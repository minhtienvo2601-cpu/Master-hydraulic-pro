"""Mô hình dữ liệu. Mọi thời gian lưu UTC (timestamptz). Mọi bản ghi có UUID, created_at, updated_at."""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

PRICE = Numeric(20, 8)
MONEY = Numeric(20, 4)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Ho_Chi_Minh", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class UserSession(TimestampMixin, Base):
    __tablename__ = "user_sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user_agent: Mapped[str] = mapped_column(String(255), default="", nullable=False)


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_accounts_user_name"),)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    broker: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    initial_balance: Mapped[Decimal | None] = mapped_column(MONEY)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Strategy(TimestampMixin, Base):
    __tablename__ = "strategies"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_strategies_user_name"),)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    versions: Mapped[list["StrategyVersion"]] = relationship(
        back_populates="strategy", order_by="StrategyVersion.version_no"
    )


class StrategyVersion(TimestampMixin, Base):
    """Một phiên bản chiến lược. Khi status='confirmed' thì các quy tắc bị khóa (không ghi đè lịch sử)."""

    __tablename__ = "strategy_versions"
    __table_args__ = (
        UniqueConstraint("strategy_id", "version_no", name="uq_strategy_versions_no"),
        CheckConstraint("status in ('draft','confirmed')", name="ck_strategy_versions_status"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    strategy_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("strategies.id", ondelete="RESTRICT"), nullable=False)
    parent_version_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("strategy_versions.id"))
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    entry_rules: Mapped[str] = mapped_column(Text, default="", nullable=False)
    exit_rules: Mapped[str] = mapped_column(Text, default="", nullable=False)
    risk_rules: Mapped[str] = mapped_column(Text, default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    strategy: Mapped[Strategy] = relationship(back_populates="versions")


class BacktestSession(TimestampMixin, Base):
    __tablename__ = "backtest_sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    strategy_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("strategy_versions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    market: Mapped[str] = mapped_column(String(40), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(16), nullable=False)
    data_start: Mapped[date | None] = mapped_column(Date)
    data_end: Mapped[date | None] = mapped_column(Date)
    data_timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    entry_rules: Mapped[str] = mapped_column(Text, default="", nullable=False)
    exit_rules: Mapped[str] = mapped_column(Text, default="", nullable=False)
    risk_rules: Mapped[str] = mapped_column(Text, default="", nullable=False)
    target_trades: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    # Quy ước vốn cho equity curve backtest
    initial_capital: Mapped[Decimal | None] = mapped_column(MONEY)
    equity_method: Mapped[str] = mapped_column(String(32), default="cash", nullable=False)
    risk_per_trade_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    summary_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


TRADE_TYPES = ("live", "backtest")
TRADE_STATUSES = ("open", "closed", "cancelled")


class Trade(TimestampMixin, Base):
    __tablename__ = "trades"
    __table_args__ = (
        CheckConstraint("trade_type in ('live','backtest')", name="ck_trades_type"),
        CheckConstraint("direction in ('buy','sell')", name="ck_trades_direction"),
        CheckConstraint("status in ('open','closed','cancelled')", name="ck_trades_status"),
        CheckConstraint(
            "(trade_type = 'backtest' AND backtest_session_id IS NOT NULL) OR "
            "(trade_type = 'live' AND backtest_session_id IS NULL)",
            name="ck_trades_type_session",
        ),
        CheckConstraint("risk_amount IS NULL OR risk_amount > 0", name="ck_trades_risk_positive"),
        CheckConstraint("commission >= 0 AND other_fees >= 0", name="ck_trades_costs_nonneg"),
        UniqueConstraint("user_id", "code", name="uq_trades_user_code"),
        UniqueConstraint("user_id", "idempotency_key", name="uq_trades_user_idem"),
        UniqueConstraint("user_id", "import_hash", name="uq_trades_user_import_hash"),
        Index("ix_trades_user_type_exit", "user_id", "trade_type", "exit_time"),
        Index("ix_trades_user_type_entry", "user_id", "trade_type", "entry_time"),
        Index("ix_trades_session", "backtest_session_id"),
        Index("ix_trades_version", "strategy_version_id"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trade_type: Mapped[str] = mapped_column(String(10), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    backtest_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("backtest_sessions.id", ondelete="RESTRICT")
    )
    strategy_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("strategy_versions.id", ondelete="RESTRICT")
    )
    market: Mapped[str] = mapped_column(String(40), nullable=False)
    direction: Mapped[str] = mapped_column(String(4), nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="open", nullable=False)
    entry_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timeframe: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    trading_session: Mapped[str] = mapped_column(String(32), default="", nullable=False)

    entry_price: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    stop_loss: Mapped[Decimal | None] = mapped_column(PRICE)
    take_profit: Mapped[Decimal | None] = mapped_column(PRICE)
    exit_price: Mapped[Decimal | None] = mapped_column(PRICE)
    volume: Mapped[Decimal | None] = mapped_column(PRICE)
    risk_amount: Mapped[Decimal | None] = mapped_column(MONEY)
    gross_pnl: Mapped[Decimal | None] = mapped_column(MONEY)
    commission: Mapped[Decimal] = mapped_column(MONEY, default=Decimal(0), nullable=False)
    swap: Mapped[Decimal] = mapped_column(MONEY, default=Decimal(0), nullable=False)
    other_fees: Mapped[Decimal] = mapped_column(MONEY, default=Decimal(0), nullable=False)
    # Giá trị dẫn xuất, luôn được backend tính lại khi lưu (xem services/trade_calc.py)
    net_pnl: Mapped[Decimal | None] = mapped_column(MONEY)
    r_multiple: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    r_source: Mapped[str] = mapped_column(String(10), default="none", nullable=False)  # computed|manual|none
    r_manual: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    outcome: Mapped[str | None] = mapped_column(String(10))  # win|loss|breakeven (chỉ khi closed)

    # Phân tích
    trend: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    key_levels: Mapped[str] = mapped_column(Text, default="", nullable=False)
    setup: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    confirmation: Mapped[str] = mapped_column(Text, default="", nullable=False)
    market_condition: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    entry_reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    exit_reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    plan_compliance: Mapped[str] = mapped_column(String(16), default="", nullable=False)  # followed|partial|violated
    mistakes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    emotion: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    lessons: Mapped[str] = mapped_column(Text, default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # Biểu đồ: liên kết ngoài (vd TradingView) và cấu hình đánh dấu Entry/SL/TP/Exit
    chart_link: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
    chart_config: Mapped[dict | None] = mapped_column(JSON)

    is_draft: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    row_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    import_hash: Mapped[str | None] = mapped_column(String(64))
    import_job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("import_jobs.id", ondelete="SET NULL"))

    tags: Mapped[list["Tag"]] = relationship(secondary="trade_tags", lazy="selectin")


class TradeImage(TimestampMixin, Base):
    __tablename__ = "trade_images"
    __table_args__ = (
        CheckConstraint(
            "(trade_id IS NOT NULL) OR (backtest_session_id IS NOT NULL)", name="ck_trade_images_owner"
        ),
        CheckConstraint("kind in ('before','after','other')", name="ck_trade_images_kind"),
        Index("ix_trade_images_trade", "trade_id"),
        Index("ix_trade_images_session", "backtest_session_id"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    trade_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("trades.id", ondelete="RESTRICT"))
    backtest_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("backtest_sessions.id", ondelete="RESTRICT")
    )
    kind: Mapped[str] = mapped_column(String(10), default="other", nullable=False)
    caption: Mapped[str] = mapped_column(Text, default="", nullable=False)
    storage_key: Mapped[str] = mapped_column(String(300), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Xóa 2 pha: đánh dấu trong DB trước, xóa object sau khi commit thành công
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    storage_purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Tag(TimestampMixin, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tags_user_name"),)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    color: Mapped[str] = mapped_column(String(16), default="", nullable=False)


class TradeTag(Base):
    __tablename__ = "trade_tags"
    trade_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trades.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class ImportJob(TimestampMixin, Base):
    __tablename__ = "import_jobs"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), default="trades", nullable=False)
    filename: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    file_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="previewed", nullable=False)  # previewed|committed|failed
    options: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    valid_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duplicate_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    imported_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    errors: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    payload: Mapped[list | None] = mapped_column(JSON)  # các dòng hợp lệ đã chuẩn hóa, xóa sau khi commit
    committed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    ip: Mapped[str] = mapped_column(String(64), default="", nullable=False)


class PriceSeries(TimestampMixin, Base):
    """Dữ liệu giá OHLC do người dùng nhập từ nguồn họ có quyền sử dụng.
    Ứng dụng không tự sinh dữ liệu nến; biểu đồ chỉ hiển thị khi có series hợp lệ."""

    __tablename__ = "price_series"
    __table_args__ = (UniqueConstraint("user_id", "symbol", "timeframe", "source", name="uq_price_series"),)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(40), nullable=False)
    timeframe: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    bar_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    first_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PriceBar(Base):
    __tablename__ = "price_bars"
    series_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("price_series.id", ondelete="CASCADE"), primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    open: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    high: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    low: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    close: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    volume: Mapped[Decimal | None] = mapped_column(PRICE)
