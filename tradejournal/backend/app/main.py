import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import get_settings
from .db import SessionLocal
from .routers import accounts, auth, dashboard, images, io, prices, sessions, strategies, trades

log = logging.getLogger("tradejournal")
API = "/api/v1"


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="TradeJournal API", version="1.0.0",
                  description="API nhật ký giao dịch & backtest. Xác thực bằng cookie phiên httpOnly; "
                              "mọi yêu cầu thay đổi dữ liệu cần header `X-Requested-With: tradejournal`.",
                  docs_url=f"{API}/docs", openapi_url=f"{API}/openapi.json", redoc_url=None)
    if s.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
                           allow_methods=["*"], allow_headers=["Content-Type", "X-Requested-With", "Idempotency-Key"])

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        if s.env == "production":
            resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.url.path.startswith(API) and "cache-control" not in resp.headers:
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        # Chỉ log loại lỗi và đường dẫn; không log body/cookie (có thể chứa dữ liệu nhạy cảm)
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Lỗi máy chủ. Vui lòng thử lại."}, status_code=500)

    for r in (auth, accounts, strategies, sessions, trades, images, dashboard, io, prices):
        app.include_router(r.router, prefix=API)

    @app.get(f"{API}/health", tags=["ops"])
    def health():
        with SessionLocal() as db:
            db.execute(text("select 1"))
        return {"status": "ok"}

    return app


app = create_app()
