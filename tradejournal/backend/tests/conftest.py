import os
import tempfile

import pytest

os.environ.setdefault("TJ_DATABASE_URL", os.environ.get(
    "TJ_TEST_DATABASE_URL", "postgresql+psycopg://tj:tj@localhost:5432/tradejournal_test"))
os.environ["TJ_COOKIE_SECURE"] = "false"
os.environ["TJ_STORAGE_BACKEND"] = "local"
os.environ["TJ_STORAGE_LOCAL_DIR"] = tempfile.mkdtemp(prefix="tj-test-")
os.environ["TJ_MAX_UPLOAD_MB"] = "1"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import models  # noqa: E402,F401
from app.config import get_settings  # noqa: E402
from app.db import Base, get_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.ratelimit import limiter  # noqa: E402

get_settings.cache_clear()


@pytest.fixture(scope="session", autouse=True)
def _schema():
    eng = get_engine()
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield
    Base.metadata.drop_all(eng)


@pytest.fixture(autouse=True)
def _clean():
    limiter.reset()
    yield
    eng = get_engine()
    with eng.begin() as c:
        if eng.dialect.name == "postgresql":
            names = ", ".join(t.name for t in Base.metadata.sorted_tables)
            c.execute(text(f"TRUNCATE {names} CASCADE"))
        else:
            for t in reversed(Base.metadata.sorted_tables):
                c.execute(t.delete())


class Api:
    """TestClient có sẵn header chống CSRF."""

    def __init__(self, client: TestClient) -> None:
        self.c = client
        self.h = {"X-Requested-With": "tradejournal"}

    def __getattr__(self, name):
        fn = getattr(self.c, name)
        if name in ("post", "put", "patch", "delete"):
            def wrapped(url, **kw):
                kw["headers"] = {**self.h, **kw.get("headers", {})}
                return fn("/api/v1" + url, **kw)
            return wrapped
        if name == "get":
            return lambda url, **kw: fn("/api/v1" + url, **kw)
        return fn


def make_user(email="a@example.com", password="mat-khau-rat-manh"):
    api = Api(TestClient(create_app()))
    r = api.post("/auth/register", json={"email": email, "password": password, "display_name": "A",
                                         "timezone": "Asia/Ho_Chi_Minh"})
    assert r.status_code == 201, r.text
    return api


@pytest.fixture
def api():
    return make_user()


@pytest.fixture
def api_b():
    return make_user("b@example.com")
