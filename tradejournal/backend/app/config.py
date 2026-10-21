"""Cấu hình ứng dụng, đọc từ biến môi trường (tiền tố TJ_). Không hard-code secret."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TJ_", env_file=".env", extra="ignore")

    env: str = "development"  # development | staging | production
    database_url: str = "postgresql+psycopg://tj:tj@localhost:5432/tradejournal"

    # Phiên đăng nhập (cookie httpOnly lưu token ngẫu nhiên, DB chỉ lưu hash)
    session_cookie_name: str = "tj_session"
    session_ttl_hours: int = 24 * 14
    cookie_secure: bool = True
    cors_origins: list[str] = []

    # Lưu ảnh: "local" (dev) hoặc "s3" (S3-compatible: AWS S3, R2, MinIO, B2...)
    storage_backend: str = "local"
    storage_local_dir: str = "./data/uploads"
    s3_bucket: str = ""
    s3_endpoint_url: str | None = None
    s3_region: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None

    max_upload_mb: int = 10
    max_images_per_user: int = 5000
    max_csv_rows: int = 20000
    max_csv_mb: int = 5

    # Giới hạn tốc độ endpoint nhạy cảm (số yêu cầu / cửa sổ giây)
    auth_rate_limit: int = 10
    auth_rate_window_s: int = 60
    upload_rate_limit: int = 60
    upload_rate_window_s: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
