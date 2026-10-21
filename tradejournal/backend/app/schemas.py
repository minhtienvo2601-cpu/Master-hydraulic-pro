import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    PlainSerializer,
    field_validator,
    model_validator,
)

Num = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float, when_used="json")]
OptNum = Annotated[
    Decimal | None, PlainSerializer(lambda v: float(v) if v is not None else None, return_type=float | None, when_used="json")
]


def _aware(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    if v.tzinfo is None:
        raise ValueError("Thời gian phải kèm múi giờ (ISO 8601, ví dụ 2024-01-02T09:30:00+07:00)")
    return v.astimezone(timezone.utc)


AwareDT = Annotated[datetime, AfterValidator(_aware)]


def valid_tz(v: str) -> str:
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("Múi giờ không hợp lệ (dùng tên IANA, ví dụ Asia/Ho_Chi_Minh)")
    return v


TZ = Annotated[str, AfterValidator(valid_tz)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------- Auth / hồ sơ ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    display_name: str = Field(default="", max_length=120)
    timezone: TZ = "Asia/Ho_Chi_Minh"


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class UserOut(ORM):
    id: uuid.UUID
    email: str
    display_name: str
    timezone: str
    created_at: datetime


class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    timezone: TZ | None = None


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=200)


# ---------------- Tài khoản ----------------
class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    broker: str = Field(default="", max_length=120)
    currency: str = Field(default="USD", min_length=3, max_length=10)
    initial_balance: Decimal | None = Field(default=None, ge=0)
    is_archived: bool = False


class AccountOut(ORM):
    id: uuid.UUID
    name: str
    broker: str
    currency: str
    initial_balance: OptNum
    is_archived: bool
    created_at: datetime


# ---------------- Chiến lược ----------------
class StrategyIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = ""


class VersionIn(BaseModel):
    label: str | None = Field(default=None, max_length=160)
    entry_rules: str = ""
    exit_rules: str = ""
    risk_rules: str = ""
    notes: str = ""


class VersionPatch(BaseModel):
    label: str | None = Field(default=None, max_length=160)
    entry_rules: str | None = None
    exit_rules: str | None = None
    risk_rules: str | None = None
    notes: str | None = None


class VersionOut(ORM):
    id: uuid.UUID
    strategy_id: uuid.UUID
    parent_version_id: uuid.UUID | None
    version_no: int
    label: str
    entry_rules: str
    exit_rules: str
    risk_rules: str
    notes: str
    status: str
    confirmed_at: datetime | None
    created_at: datetime


class StrategyOut(ORM):
    id: uuid.UUID
    name: str
    description: str
    created_at: datetime
    versions: list[VersionOut] = []


# ---------------- Phiên backtest ----------------
EquityMethod = Literal["cash", "r_fixed", "r_compound"]


class SessionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    strategy_version_id: uuid.UUID
    market: str = Field(min_length=1, max_length=40)
    timeframe: str = Field(min_length=1, max_length=16)
    data_start: date | None = None
    data_end: date | None = None
    data_timezone: TZ = "UTC"
    entry_rules: str = ""
    exit_rules: str = ""
    risk_rules: str = ""
    target_trades: int = Field(default=100, ge=1, le=100000)
    initial_capital: Decimal | None = Field(default=None, gt=0)
    equity_method: EquityMethod = "cash"
    risk_per_trade_pct: Decimal | None = Field(default=None, gt=0, le=100)
    summary_notes: str = ""
    is_completed: bool = False

    @model_validator(mode="after")
    def _check(self):
        if self.data_start and self.data_end and self.data_end < self.data_start:
            raise ValueError("Ngày kết thúc dữ liệu phải sau ngày bắt đầu")
        if self.equity_method != "cash" and (self.initial_capital is None or self.risk_per_trade_pct is None):
            raise ValueError("Phương pháp equity theo R cần vốn ban đầu và % rủi ro mỗi lệnh")
        return self


class SessionOut(ORM):
    id: uuid.UUID
    name: str
    strategy_version_id: uuid.UUID
    market: str
    timeframe: str
    data_start: date | None
    data_end: date | None
    data_timezone: str
    entry_rules: str
    exit_rules: str
    risk_rules: str
    target_trades: int
    initial_capital: OptNum
    equity_method: str
    risk_per_trade_pct: OptNum
    summary_notes: str
    is_completed: bool
    created_at: datetime
    updated_at: datetime


class SessionProgress(BaseModel):
    recorded: int
    target: int
    completion_pct: float
    incomplete: int
    last_tested_at: datetime | None


class SessionWithProgress(SessionOut):
    progress: SessionProgress | None = None
    strategy_label: str | None = None


# ---------------- Giao dịch ----------------
Direction = Literal["buy", "sell"]
Status = Literal["open", "closed", "cancelled"]
Compliance = Literal["", "followed", "partial", "violated"]


class TradeIn(BaseModel):
    trade_type: Literal["live", "backtest"]
    code: str | None = Field(default=None, max_length=64)
    account_id: uuid.UUID | None = None
    backtest_session_id: uuid.UUID | None = None
    strategy_version_id: uuid.UUID | None = None
    market: str = Field(min_length=1, max_length=40)
    direction: Direction
    status: Status = "open"
    entry_time: AwareDT
    exit_time: AwareDT | None = None
    timeframe: str = Field(default="", max_length=16)
    trading_session: str = Field(default="", max_length=32)
    entry_price: Decimal = Field(gt=0)
    stop_loss: Decimal | None = Field(default=None, gt=0)
    take_profit: Decimal | None = Field(default=None, gt=0)
    exit_price: Decimal | None = Field(default=None, gt=0)
    volume: Decimal | None = Field(default=None, gt=0)
    risk_amount: Decimal | None = Field(default=None, gt=0)
    gross_pnl: Decimal | None = None
    commission: Decimal = Field(default=Decimal(0), ge=0)
    swap: Decimal = Decimal(0)
    other_fees: Decimal = Field(default=Decimal(0), ge=0)
    r_manual: Decimal | None = None
    trend: str = Field(default="", max_length=32)
    key_levels: str = ""
    setup: str = Field(default="", max_length=120)
    confirmation: str = ""
    market_condition: str = Field(default="", max_length=64)
    entry_reason: str = ""
    exit_reason: str = ""
    plan_compliance: Compliance = ""
    mistakes: str = ""
    emotion: str = Field(default="", max_length=64)
    lessons: str = ""
    notes: str = ""
    chart_link: str = Field(default="", max_length=1000)
    chart_config: dict | None = None
    is_draft: bool = False
    tags: list[str] = Field(default_factory=list, max_length=30)
    row_version: int | None = None  # bắt buộc khi cập nhật (khóa lạc quan)

    @field_validator("market")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("chart_link")
    @classmethod
    def _link(cls, v: str) -> str:
        if v and not v.startswith(("https://", "http://")):
            raise ValueError("Liên kết biểu đồ phải bắt đầu bằng http(s)://")
        return v

    @model_validator(mode="after")
    def _rules(self):
        validate_trade_rules(self)
        return self


def validate_trade_rules(t) -> None:
    """Quy tắc nghiệp vụ dùng chung cho form và import CSV."""
    errs: list[str] = []
    if t.trade_type == "live" and t.backtest_session_id is not None:
        errs.append("Giao dịch Live không được gắn phiên backtest")
    if t.trade_type == "backtest" and t.backtest_session_id is None:
        errs.append("Giao dịch Backtest phải thuộc một phiên backtest")
    if t.trade_type == "live" and t.account_id is None and not t.is_draft:
        errs.append("Giao dịch Live phải chọn tài khoản")
    if t.exit_time is not None and t.exit_time < t.entry_time:
        errs.append("Thời gian thoát lệnh phải sau thời gian vào lệnh")
    if t.stop_loss is not None:
        if t.direction == "buy" and t.stop_loss >= t.entry_price:
            errs.append("Lệnh Buy: Stop Loss phải thấp hơn giá vào")
        if t.direction == "sell" and t.stop_loss <= t.entry_price:
            errs.append("Lệnh Sell: Stop Loss phải cao hơn giá vào")
    if t.take_profit is not None:
        if t.direction == "buy" and t.take_profit <= t.entry_price:
            errs.append("Lệnh Buy: Take Profit phải cao hơn giá vào")
        if t.direction == "sell" and t.take_profit >= t.entry_price:
            errs.append("Lệnh Sell: Take Profit phải thấp hơn giá vào")
    if t.status == "closed" and not t.is_draft:
        if t.exit_time is None:
            errs.append("Giao dịch đã đóng phải có thời gian thoát lệnh")
        if t.trade_type == "live":
            if t.exit_price is None:
                errs.append("Giao dịch Live đã đóng phải có giá thoát thực tế")
            if t.gross_pnl is None:
                errs.append("Giao dịch Live đã đóng phải có kết quả trước chi phí")
        else:
            if t.exit_price is None and t.gross_pnl is None and t.r_manual is None:
                errs.append("Giao dịch Backtest đã đóng cần giá thoát, kết quả tiền hoặc kết quả R")
    if t.status == "open" and (t.exit_price is not None or t.exit_time is not None) and not t.is_draft:
        errs.append("Giao dịch đang mở không được có giá/thời gian thoát — hãy chuyển trạng thái sang Closed")
    if errs:
        raise ValueError("; ".join(errs))


class TagOut(ORM):
    id: uuid.UUID
    name: str
    color: str


class TradeOut(ORM):
    id: uuid.UUID
    trade_type: str
    code: str
    account_id: uuid.UUID | None
    backtest_session_id: uuid.UUID | None
    strategy_version_id: uuid.UUID | None
    market: str
    direction: str
    status: str
    entry_time: datetime
    exit_time: datetime | None
    timeframe: str
    trading_session: str
    entry_price: Num
    stop_loss: OptNum
    take_profit: OptNum
    exit_price: OptNum
    volume: OptNum
    risk_amount: OptNum
    gross_pnl: OptNum
    commission: Num
    swap: Num
    other_fees: Num
    net_pnl: OptNum
    r_multiple: OptNum
    r_source: str
    r_manual: OptNum
    outcome: str | None
    trend: str
    key_levels: str
    setup: str
    confirmation: str
    market_condition: str
    entry_reason: str
    exit_reason: str
    plan_compliance: str
    mistakes: str
    emotion: str
    lessons: str
    notes: str
    chart_link: str
    chart_config: dict | None
    is_draft: bool
    row_version: int
    tags: list[TagOut]
    created_at: datetime
    updated_at: datetime
    image_count: int = 0


class TradePage(BaseModel):
    items: list[TradeOut]
    total: int
    page: int
    page_size: int


class ImageOut(ORM):
    id: uuid.UUID
    trade_id: uuid.UUID | None
    backtest_session_id: uuid.UUID | None
    kind: str
    caption: str
    content_type: str
    size_bytes: int
    original_filename: str
    sort_order: int
    created_at: datetime


class ImagePatch(BaseModel):
    caption: str | None = Field(default=None, max_length=2000)
    kind: Literal["before", "after", "other"] | None = None
    sort_order: int | None = None


class ImportJobOut(ORM):
    id: uuid.UUID
    kind: str
    filename: str
    status: str
    total_rows: int
    valid_rows: int
    duplicate_rows: int
    error_rows: int
    imported_rows: int
    errors: list
    created_at: datetime
    committed_at: datetime | None
