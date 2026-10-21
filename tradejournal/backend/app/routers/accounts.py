import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import audit, current_user, owned
from ..models import Account, Trade, User
from ..schemas import AccountIn, AccountOut

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
def list_accounts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Account).where(Account.user_id == user.id).order_by(Account.name)).all()


@router.post("", response_model=AccountOut, status_code=201)
def create_account(body: AccountIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = Account(user_id=user.id, **body.model_dump())
    acc.currency = acc.currency.upper()
    db.add(acc)
    try:
        db.flush()
    except IntegrityError:
        raise HTTPException(409, "Tên tài khoản đã tồn tại")
    audit(db, request, user.id, "account.create", "account", acc.id)
    db.commit()
    return acc


@router.put("/{account_id}", response_model=AccountOut)
def update_account(account_id: uuid.UUID, body: AccountIn, request: Request,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned(db, Account, account_id, user, "Tài khoản")
    for k, v in body.model_dump().items():
        setattr(acc, k, v)
    acc.currency = acc.currency.upper()
    try:
        db.flush()
    except IntegrityError:
        raise HTTPException(409, "Tên tài khoản đã tồn tại")
    audit(db, request, user.id, "account.update", "account", acc.id)
    db.commit()
    return acc


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: uuid.UUID, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    acc = owned(db, Account, account_id, user, "Tài khoản")
    if db.scalar(select(Trade.id).where(Trade.account_id == acc.id).limit(1)):
        raise HTTPException(409, "Tài khoản đang có giao dịch; hãy lưu trữ (archive) thay vì xóa")
    db.delete(acc)
    audit(db, request, user.id, "account.delete", "account", account_id)
    db.commit()
