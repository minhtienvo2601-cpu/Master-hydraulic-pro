import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import audit, current_user, owned
from ..models import BacktestSession, StrategyVersion, Trade, TradeImage, User
from ..queries import TradeFilter, load_stat_trades, trade_filter
from ..schemas import SessionIn, SessionOut, SessionProgress, SessionWithProgress
from ..stats import compute_stats, stats_to_dict
from .trades import purge_objects

router = APIRouter(prefix="/backtest-sessions", tags=["backtest"])


def progress_map(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    if not ids:
        return {}
    done = (Trade.status == "closed") & (Trade.is_draft.is_(False))
    rows = db.execute(
        select(Trade.backtest_session_id,
               func.sum(case((done, 1), else_=0)),
               func.sum(case((~done & (Trade.status != "cancelled"), 1), else_=0)),
               func.max(Trade.updated_at))
        .where(Trade.backtest_session_id.in_(ids)).group_by(Trade.backtest_session_id)).all()
    return {r[0]: {"recorded": int(r[1] or 0), "incomplete": int(r[2] or 0), "last": r[3]} for r in rows}


def with_progress(s: BacktestSession, p: dict | None, label: str | None) -> SessionWithProgress:
    p = p or {"recorded": 0, "incomplete": 0, "last": None}
    out = SessionWithProgress.model_validate(s)
    out.progress = SessionProgress(recorded=p["recorded"], target=s.target_trades,
                                   completion_pct=round(min(100.0, p["recorded"] / s.target_trades * 100), 1),
                                   incomplete=p["incomplete"], last_tested_at=p["last"])
    out.strategy_label = label
    return out


@router.get("", response_model=list[SessionWithProgress])
def list_sessions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(BacktestSession, StrategyVersion.label)
                      .join(StrategyVersion, StrategyVersion.id == BacktestSession.strategy_version_id)
                      .where(BacktestSession.user_id == user.id)
                      .order_by(BacktestSession.is_completed, BacktestSession.updated_at.desc())).all()
    pm = progress_map(db, [s.id for s, _ in rows])
    return [with_progress(s, pm.get(s.id), label) for s, label in rows]


@router.post("", response_model=SessionOut, status_code=201)
def create_session(body: SessionIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = owned(db, StrategyVersion, body.strategy_version_id, user, "Phiên bản chiến lược")
    data = body.model_dump()
    # Mặc định chép quy tắc từ phiên bản chiến lược nếu người dùng để trống
    for f in ("entry_rules", "exit_rules", "risk_rules"):
        data[f] = data[f] or getattr(v, f)
    s = BacktestSession(user_id=user.id, **data)
    s.market = s.market.strip().upper()
    db.add(s)
    db.flush()
    audit(db, request, user.id, "backtest_session.create", "backtest_session", s.id)
    db.commit()
    return s


@router.get("/{session_id}", response_model=SessionWithProgress)
def get_session(session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = owned(db, BacktestSession, session_id, user, "Phiên backtest")
    v = db.get(StrategyVersion, s.strategy_version_id)
    return with_progress(s, progress_map(db, [s.id]).get(s.id), v.label if v else None)


@router.put("/{session_id}", response_model=SessionOut)
def update_session(session_id: uuid.UUID, body: SessionIn, request: Request,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = owned(db, BacktestSession, session_id, user, "Phiên backtest")
    if body.strategy_version_id != s.strategy_version_id:
        if db.scalar(select(Trade.id).where(Trade.backtest_session_id == s.id).limit(1)):
            raise HTTPException(409, "Phiên đã có giao dịch, không thể đổi phiên bản chiến lược")
        owned(db, StrategyVersion, body.strategy_version_id, user, "Phiên bản chiến lược")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    s.market = s.market.strip().upper()
    audit(db, request, user.id, "backtest_session.update", "backtest_session", s.id)
    db.commit()
    return s


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = owned(db, BacktestSession, session_id, user, "Phiên backtest")
    if db.scalar(select(Trade.id).where(Trade.backtest_session_id == s.id).limit(1)) or \
       db.scalar(select(TradeImage.id).where(TradeImage.backtest_session_id == s.id,
                                             TradeImage.deleted_at.is_(None)).limit(1)):
        raise HTTPException(409, "Phiên còn giao dịch hoặc ảnh. Hãy xóa chúng trước (tránh mất dữ liệu ngoài ý muốn).")
    gone = db.scalars(select(TradeImage).where(TradeImage.backtest_session_id == s.id)).all()
    keys = [i.storage_key for i in gone if i.storage_purged_at is None]
    for i in gone:
        db.delete(i)
    db.flush()
    db.delete(s)
    audit(db, request, user.id, "backtest_session.delete", "backtest_session", session_id)
    db.commit()
    purge_objects(keys)


@router.get("/{session_id}/stats")
def session_stats(session_id: uuid.UUID, f: TradeFilter = Depends(trade_filter),
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Thống kê của phiên theo quy ước vốn/equity của phiên. Hỗ trợ cùng bộ lọc với danh sách giao dịch."""
    s = owned(db, BacktestSession, session_id, user, "Phiên backtest")
    f.backtest_session_id = s.id
    f.trade_type = "backtest"
    trades = load_stat_trades(db, user, f)
    try:
        st = compute_stats(trades, initial_capital=s.initial_capital, equity_method=s.equity_method,
                           risk_per_trade_pct=s.risk_per_trade_pct)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return stats_to_dict(st)
