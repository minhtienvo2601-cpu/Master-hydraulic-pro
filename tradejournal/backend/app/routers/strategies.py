import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import audit, current_user, owned
from ..models import BacktestSession, Strategy, StrategyVersion, Trade, User
from ..queries import load_stat_trades
from ..schemas import StrategyIn, StrategyOut, VersionIn, VersionOut, VersionPatch
from ..stats import compute_stats, stats_to_dict

router = APIRouter(prefix="/strategies", tags=["strategies"])
RULE_FIELDS = ("entry_rules", "exit_rules", "risk_rules")


def _strategy(db: Session, sid: uuid.UUID, user: User) -> Strategy:
    return owned(db, Strategy, sid, user, "Chiến lược")


@router.get("", response_model=list[StrategyOut])
def list_strategies(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Strategy).where(Strategy.user_id == user.id)
                      .options(selectinload(Strategy.versions)).order_by(Strategy.name)).all()


@router.post("", response_model=StrategyOut, status_code=201)
def create_strategy(body: StrategyIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Tạo chiến lược kèm phiên bản V1 (nháp)."""
    st = Strategy(user_id=user.id, name=body.name.strip(), description=body.description)
    db.add(st)
    try:
        db.flush()
    except IntegrityError:
        raise HTTPException(409, "Tên chiến lược đã tồn tại")
    db.add(StrategyVersion(user_id=user.id, strategy_id=st.id, version_no=1, label=f"{st.name} V1"))
    audit(db, request, user.id, "strategy.create", "strategy", st.id)
    db.commit()
    db.refresh(st)
    return st


@router.get("/{strategy_id}", response_model=StrategyOut)
def get_strategy(strategy_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _strategy(db, strategy_id, user)


@router.put("/{strategy_id}", response_model=StrategyOut)
def update_strategy(strategy_id: uuid.UUID, body: StrategyIn, request: Request,
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    st = _strategy(db, strategy_id, user)
    st.name, st.description = body.name.strip(), body.description
    try:
        db.flush()
    except IntegrityError:
        raise HTTPException(409, "Tên chiến lược đã tồn tại")
    audit(db, request, user.id, "strategy.update", "strategy", st.id)
    db.commit()
    return st


@router.delete("/{strategy_id}", status_code=204)
def delete_strategy(strategy_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    st = _strategy(db, strategy_id, user)
    vids = [v.id for v in st.versions]
    if vids and (db.scalar(select(Trade.id).where(Trade.strategy_version_id.in_(vids)).limit(1)) or
                 db.scalar(select(BacktestSession.id).where(BacktestSession.strategy_version_id.in_(vids)).limit(1))):
        raise HTTPException(409, "Chiến lược đã có giao dịch hoặc phiên backtest, không thể xóa")
    for v in st.versions:
        db.delete(v)
    db.flush()
    db.delete(st)
    audit(db, request, user.id, "strategy.delete", "strategy", strategy_id)
    db.commit()


@router.post("/{strategy_id}/versions", response_model=VersionOut, status_code=201)
def create_version(strategy_id: uuid.UUID, body: VersionIn, request: Request,
                   from_version_id: uuid.UUID | None = None,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Tạo phiên bản mới. Nếu có from_version_id: sao chép quy tắc của phiên bản đó (các trường trống trong body)."""
    st = _strategy(db, strategy_id, user)
    parent = None
    if from_version_id:
        parent = owned(db, StrategyVersion, from_version_id, user, "Phiên bản")
        if parent.strategy_id != st.id:
            raise HTTPException(400, "Phiên bản nguồn không thuộc chiến lược này")
    no = (db.scalar(select(func.max(StrategyVersion.version_no)).where(StrategyVersion.strategy_id == st.id)) or 0) + 1
    v = StrategyVersion(user_id=user.id, strategy_id=st.id, version_no=no,
                        parent_version_id=parent.id if parent else None,
                        label=body.label or f"{st.name} V{no}")
    for f in (*RULE_FIELDS, "notes"):
        setattr(v, f, getattr(body, f) or (getattr(parent, f) if parent else ""))
    db.add(v)
    db.flush()
    audit(db, request, user.id, "strategy_version.create", "strategy_version", v.id,
          from_version=str(parent.id) if parent else None)
    db.commit()
    return v


@router.patch("/versions/{version_id}", response_model=VersionOut)
def update_version(version_id: uuid.UUID, body: VersionPatch, request: Request,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = owned(db, StrategyVersion, version_id, user, "Phiên bản")
    data = body.model_dump(exclude_unset=True)
    if v.status == "confirmed" and any(f in data and data[f] != getattr(v, f) for f in RULE_FIELDS):
        raise HTTPException(409, "Phiên bản đã xác nhận: quy tắc bị khóa. Hãy sao chép thành phiên bản mới.")
    for k, val in data.items():
        if val is not None:
            setattr(v, k, val)
    audit(db, request, user.id, "strategy_version.update", "strategy_version", v.id, fields=sorted(data))
    db.commit()
    return v


@router.post("/versions/{version_id}/confirm", response_model=VersionOut)
def confirm_version(version_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = owned(db, StrategyVersion, version_id, user, "Phiên bản")
    if v.status != "confirmed":
        v.status = "confirmed"
        v.confirmed_at = datetime.now(timezone.utc)
        audit(db, request, user.id, "strategy_version.confirm", "strategy_version", v.id)
        db.commit()
    return v


@router.get("/{strategy_id}/compare")
def compare_versions(strategy_id: uuid.UUID, trade_type: str = Query("backtest", pattern="^(live|backtest)$"),
                     user: User = Depends(current_user), db: Session = Depends(get_db)):
    """So sánh các phiên bản bằng CÙNG bộ công thức; luôn kèm cỡ mẫu từng phiên bản."""
    st = _strategy(db, strategy_id, user)
    out = []
    for v in st.versions:
        trades = load_stat_trades(db, user, trade_type=trade_type, strategy_version_ids=[v.id])
        d = stats_to_dict(compute_stats(trades))
        d.pop("equity_curve")
        out.append({"version_id": str(v.id), "version_no": v.version_no, "label": v.label,
                    "status": v.status, "sample_size": d["total_closed"], "stats": d})
    return {"strategy_id": str(st.id), "trade_type": trade_type, "versions": out}
