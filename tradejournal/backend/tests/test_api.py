"""Kiểm thử nghiệp vụ theo tiêu chí nghiệm thu SRS mục 10."""
import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.main import create_app

from .conftest import Api, make_user
from .test_stats import GOLDEN

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def setup_refs(api, initial_balance=10000):
    acc = api.post("/accounts", json={"name": "IC Markets", "currency": "USD", "initial_balance": initial_balance}).json()
    st = api.post("/strategies", json={"name": "XAUUSD H4 Pullback"}).json()
    v1 = st["versions"][0]
    sess = api.post("/backtest-sessions", json={
        "name": "XAUUSD H4 Trend Pullback V1", "strategy_version_id": v1["id"], "market": "xauusd",
        "timeframe": "H4", "target_trades": 4, "initial_capital": 10000, "equity_method": "r_fixed",
        "risk_per_trade_pct": 0.5}).json()
    return acc, st, v1, sess


def live_trade(acc, **kw):
    body = {"trade_type": "live", "account_id": acc["id"], "market": "XAUUSD", "direction": "buy", "status": "closed",
            "entry_time": "2024-02-01T09:00:00+07:00", "exit_time": "2024-02-01T15:00:00+07:00",
            "entry_price": 2000, "stop_loss": 1990, "exit_price": 2020, "gross_pnl": 200, "commission": 4,
            "risk_amount": 100, "timeframe": "H1"}
    body.update(kw)
    return body


def bt_trade(sess, **kw):
    body = {"trade_type": "backtest", "backtest_session_id": sess["id"], "market": "XAUUSD", "direction": "sell",
            "status": "closed", "entry_time": "2023-05-01T08:00:00+00:00", "exit_time": "2023-05-02T08:00:00+00:00",
            "entry_price": 2000, "stop_loss": 2010, "take_profit": 1970, "exit_price": 1970, "timeframe": "H4",
            "setup": "Pullback", "market_condition": "Trend", "plan_compliance": "followed"}
    body.update(kw)
    return body


# ---------------- Xác thực & bảo mật ----------------
def test_auth_flow_and_session_persistence():
    api = make_user()
    assert api.get("/auth/me").json()["email"] == "a@example.com"
    assert api.post("/auth/logout").status_code == 204
    assert api.get("/auth/me").status_code == 401
    # đăng nhập trên "thiết bị khác"
    other = Api(TestClient(create_app()))
    r = other.post("/auth/login", json={"email": "A@example.com", "password": "mat-khau-rat-manh"})
    assert r.status_code == 200
    assert other.get("/auth/me").status_code == 200
    assert other.post("/auth/login", json={"email": "a@example.com", "password": "sai"}).status_code == 401


def test_password_is_hashed_with_argon2(api):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        h = db.scalar(select(User.password_hash))
    assert h.startswith("$argon2id$") and "mat-khau" not in h


def test_csrf_header_required(api):
    r = api.c.post("/api/v1/accounts", json={"name": "x"})
    assert r.status_code == 403


def test_login_rate_limited():
    c = Api(TestClient(create_app()))
    codes = [c.post("/auth/login", json={"email": "x@example.com", "password": "abc"}).status_code for _ in range(12)]
    assert 429 in codes


def test_cross_user_isolation(api, api_b):
    acc, st, v1, sess = setup_refs(api)
    t = api.post("/trades", json=live_trade(acc)).json()
    img = api.post(f"/trades/{t['id']}/images", files={"file": ("a.png", PNG, "image/png")}).json()
    # B không đọc/sửa/xóa được dữ liệu của A — trả 404 để không lộ sự tồn tại
    assert api_b.get(f"/trades/{t['id']}").status_code == 404
    assert api_b.put(f"/trades/{t['id']}", json={**live_trade(acc), "row_version": 1}).status_code == 404
    assert api_b.delete(f"/trades/{t['id']}").status_code == 404
    assert api_b.get(f"/images/{img['id']}/file").status_code == 404
    assert api_b.delete(f"/images/{img['id']}").status_code == 404
    assert api_b.get(f"/backtest-sessions/{sess['id']}").status_code == 404
    assert api_b.get(f"/strategies/{st['id']}").status_code == 404
    assert api_b.get("/trades").json()["total"] == 0
    # B không thể gắn giao dịch vào tài khoản của A
    assert api_b.post("/trades", json=live_trade(acc)).status_code == 404
    assert api_b.get("/dashboard?trade_type=live").json()["stats"]["total_closed"] == 0


# ---------------- 10.1 Nghiệp vụ ----------------
def test_live_and_backtest_are_separated(api):
    acc, st, v1, sess = setup_refs(api)
    assert api.post("/trades", json=live_trade(acc)).status_code == 201
    assert api.post("/trades", json=bt_trade(sess)).status_code == 201
    assert api.post("/trades", json=bt_trade(sess, entry_time="2023-05-03T08:00:00+00:00",
                                             exit_time="2023-05-03T12:00:00+00:00", exit_price=2010)).status_code == 201
    live = api.get("/dashboard?trade_type=live").json()["stats"]
    bt = api.get("/dashboard?trade_type=backtest").json()["stats"]
    assert live["total_closed"] == 1 and live["net_profit"] == 196.0
    assert bt["total_closed"] == 2 and bt["net_profit"] == 0 and bt["total_r"] == 2.0  # +3R và -1R
    # mặc định dashboard chỉ là Live
    assert api.get("/dashboard").json()["stats"]["total_closed"] == 1
    # không thể gắn phiên backtest cho lệnh live
    assert api.post("/trades", json=live_trade(acc, backtest_session_id=sess["id"])).status_code == 422


def test_golden_dataset_through_api(api):
    acc = api.post("/accounts", json={"name": "Golden", "currency": "USD", "initial_balance": 10000}).json()
    for g in GOLDEN["trades"]:
        body = {k: v for k, v in g.items() if k != "case" and v is not None}
        body.update(trade_type="live", account_id=acc["id"], market="XAUUSD")
        r = api.post("/trades", json=body)
        assert r.status_code == 201, (g["code"], r.text)
    d = api.get("/dashboard?trade_type=live").json()["stats"]
    exp = GOLDEN["expected"]
    for k in ("total_closed", "wins", "losses", "breakevens", "excluded", "win_rate", "net_profit", "gross_profit",
              "gross_loss", "profit_factor", "average_win", "average_loss", "expectancy_r", "total_r",
              "max_win_streak", "max_loss_streak", "max_drawdown", "max_drawdown_pct", "max_drawdown_r"):
        assert d[k] == exp[k], k
    assert d["equity_curve"][-1]["equity"] == exp["final_equity"]


def test_edit_does_not_create_new_record(api):
    acc, *_ = setup_refs(api)
    t = api.post("/trades", json=live_trade(acc)).json()
    r = api.put(f"/trades/{t['id']}", json={**live_trade(acc, gross_pnl=300, lessons="Giữ lệnh tốt"), "row_version": 1})
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["id"] == t["id"] and u["code"] == t["code"] and u["net_pnl"] == 296.0 and u["r_multiple"] == 2.96
    assert u["row_version"] == 2
    assert api.get("/trades").json()["total"] == 1
    # sửa với row_version cũ (thiết bị khác) → 409, không ghi đè
    assert api.put(f"/trades/{t['id']}", json={**live_trade(acc), "row_version": 1}).status_code == 409


def test_idempotent_create(api):
    acc, *_ = setup_refs(api)
    h = {"Idempotency-Key": "abc-123"}
    r1 = api.post("/trades", json=live_trade(acc), headers=h)
    r2 = api.post("/trades", json=live_trade(acc), headers=h)
    assert r1.status_code == 201 and r2.status_code == 200 and r1.json()["id"] == r2.json()["id"]
    assert api.get("/trades").json()["total"] == 1


def test_validation_rules(api):
    acc, *_ = setup_refs(api)
    bad = [
        live_trade(acc, stop_loss=2010),                             # SL sai phía cho Buy
        live_trade(acc, exit_time="2024-02-01T08:00:00+07:00"),      # thoát trước khi vào
        live_trade(acc, gross_pnl=None),                             # live đóng thiếu kết quả
        live_trade(acc, entry_time="2024-02-01T09:00:00"),           # thiếu múi giờ
        live_trade(acc, commission=-1),                              # chi phí âm
        live_trade(acc, account_id=None),                            # live thiếu tài khoản
    ]
    for b in bad:
        assert api.post("/trades", json=b).status_code == 422, b


def test_missing_risk_no_fake_r(api):
    acc, *_ = setup_refs(api)
    t = api.post("/trades", json=live_trade(acc, risk_amount=None)).json()
    assert t["r_multiple"] is None and t["r_source"] == "none" and t["outcome"] == "win"
    d = api.get("/dashboard").json()["stats"]
    assert d["r_sample"] == 0 and d["expectancy_r"] is None and d["total_closed"] == 1


def test_multiple_images_and_safe_delete(api):
    acc, *_ = setup_refs(api)
    t1 = api.post("/trades", json=live_trade(acc)).json()
    t2 = api.post("/trades", json=live_trade(acc, entry_time="2024-02-02T09:00:00+07:00",
                                             exit_time="2024-02-02T10:00:00+07:00")).json()
    a = api.post(f"/trades/{t1['id']}/images", files={"file": ("a.png", PNG, "image/png")},
                 data={"kind": "before", "caption": "Trước khi vào"}).json()
    b = api.post(f"/trades/{t1['id']}/images", files={"file": ("b.jpg", JPG, "image/jpeg")}, data={"kind": "after"}).json()
    c = api.post(f"/trades/{t2['id']}/images", files={"file": ("c.png", PNG, "image/png")}).json()
    assert len(api.get(f"/trades/{t1['id']}/images").json()) == 2
    assert api.get(f"/images/{a['id']}/file").content == PNG
    assert api.patch(f"/images/{a['id']}", json={"caption": "Vùng cầu H4"}).json()["caption"] == "Vùng cầu H4"
    # thay ảnh giữ nguyên liên kết
    rep = api.put(f"/images/{b['id']}/file", files={"file": ("b2.png", PNG, "image/png")}).json()
    assert rep["id"] == b["id"] and rep["trade_id"] == t1["id"] and rep["content_type"] == "image/png"
    # xóa 1 ảnh không ảnh hưởng giao dịch/ảnh khác
    assert api.delete(f"/images/{a['id']}").status_code == 204
    assert api.get(f"/images/{a['id']}/file").status_code == 404
    assert api.get(f"/trades/{t1['id']}").status_code == 200
    assert api.get(f"/images/{c['id']}/file").content == PNG
    assert api.get(f"/trades/{t1['id']}").json()["image_count"] == 1
    # xóa giao dịch xóa ảnh của nó, không đụng ảnh giao dịch khác
    assert api.delete(f"/trades/{t1['id']}").status_code == 204
    assert api.get(f"/images/{b['id']}/file").status_code == 404
    assert api.get(f"/images/{c['id']}/file").status_code == 200


def test_upload_validation(api):
    acc, *_ = setup_refs(api)
    t = api.post("/trades", json=live_trade(acc)).json()
    # đổi đuôi .png nhưng nội dung không phải ảnh
    r = api.post(f"/trades/{t['id']}/images", files={"file": ("x.png", b"<script>alert(1)</script>", "image/png")})
    assert r.status_code == 415
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (1024 * 1024 + 10)  # vượt 1MB (cấu hình test)
    assert api.post(f"/trades/{t['id']}/images", files={"file": ("big.png", big, "image/png")}).status_code == 413
    webp = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 32
    assert api.post(f"/trades/{t['id']}/images", files={"file": ("w.webp", webp, "image/webp")}).status_code == 201


def test_backtest_progress_persists_across_logout(api):
    _, _, _, sess = setup_refs(api)
    api.post("/trades", json=bt_trade(sess))
    api.post("/trades", json=bt_trade(sess, status="open", exit_time=None, exit_price=None))
    p = api.get(f"/backtest-sessions/{sess['id']}").json()["progress"]
    assert p["recorded"] == 1 and p["target"] == 4 and p["completion_pct"] == 25.0 and p["incomplete"] == 1
    api.post("/auth/logout")
    other = Api(TestClient(create_app()))
    other.post("/auth/login", json={"email": "a@example.com", "password": "mat-khau-rat-manh"})
    p2 = other.get(f"/backtest-sessions/{sess['id']}").json()["progress"]
    assert p2["recorded"] == 1 and p2["incomplete"] == 1
    st = other.get(f"/backtest-sessions/{sess['id']}/stats").json()
    # r_fixed 0.5% của 10000 → 3R = +150
    assert st["equity_method"] == "r_fixed" and st["equity_curve"][-1]["equity"] == 10150.0


def test_strategy_versions_immutable_and_isolated_stats(api):
    _, st, v1, sess1 = setup_refs(api)
    api.patch(f"/strategies/versions/{v1['id']}", json={"entry_rules": "Pullback về EMA50 H4"})
    api.post(f"/strategies/versions/{v1['id']}/confirm")
    assert api.patch(f"/strategies/versions/{v1['id']}", json={"entry_rules": "đổi"}).status_code == 409
    api.post("/trades", json=bt_trade(sess1))  # +3R cho V1
    v2 = api.post(f"/strategies/{st['id']}/versions?from_version_id={v1['id']}", json={}).json()
    assert v2["version_no"] == 2 and v2["entry_rules"] == "Pullback về EMA50 H4" and v2["status"] == "draft"
    api.patch(f"/strategies/versions/{v2['id']}", json={"entry_rules": "Thêm bộ lọc ADX"})
    sess2 = api.post("/backtest-sessions", json={"name": "V2 test", "strategy_version_id": v2["id"],
                                                 "market": "XAUUSD", "timeframe": "H4"}).json()
    api.post("/trades", json=bt_trade(sess2, exit_price=2010))  # -1R cho V2
    cmp = api.get(f"/strategies/{st['id']}/compare").json()["versions"]
    assert [(c["version_no"], c["sample_size"], c["stats"]["total_r"]) for c in cmp] == [(1, 1, 3.0), (2, 1, -1.0)]
    v1_now = [v for v in api.get(f"/strategies/{st['id']}").json()["versions"] if v["id"] == v1["id"]][0]
    assert v1_now["entry_rules"] == "Pullback về EMA50 H4"
    # trade trong phiên của V1 không thể gắn sang V2
    assert api.post("/trades", json=bt_trade(sess1, strategy_version_id=v2["id"])).status_code == 422


def test_filters_update_metrics(api):
    acc, *_ = setup_refs(api)
    api.post("/trades", json=live_trade(acc))  # buy +196
    api.post("/trades", json=live_trade(acc, direction="sell", stop_loss=2010, exit_price=2010, gross_pnl=-100,
                                        entry_time="2024-03-01T09:00:00+07:00", exit_time="2024-03-01T10:00:00+07:00",
                                        market="EURUSD"))
    assert api.get("/dashboard?direction=buy").json()["stats"]["net_profit"] == 196.0
    assert api.get("/dashboard?direction=sell").json()["stats"]["net_profit"] == -104.0
    assert api.get("/dashboard?market=eurusd").json()["stats"]["total_closed"] == 1
    d = api.get("/dashboard?date_from=2024-03-01&date_to=2024-03-31").json()
    assert d["stats"]["total_closed"] == 1 and d["by_period"][0]["period"] == "2024-03-01"
    assert api.get("/trades?q=L-2024").json()["total"] == 2
    lst = api.get("/trades?sort=net_pnl&order=asc&page_size=1").json()
    assert lst["total"] == 2 and len(lst["items"]) == 1 and lst["items"][0]["net_pnl"] == -104.0
    assert api.get("/trades?outcome=loss").json()["total"] == 1


# ---------------- CSV ----------------
CSV = """code,market,direction,status,entry_time,exit_time,entry_price,stop_loss,exit_price,gross_pnl,commission,risk_amount,setup,tags
C1,XAUUSD,buy,closed,2024-04-01 09:00,2024-04-01 12:00,2300,2290,2320,200,5,100,Breakout,london;a+
C2,XAUUSD,sell,closed,2024-04-02 09:00,2024-04-02 12:00,2300,2310,2310,-100,5,100,Pullback,
C3,XAUUSD,buy,closed,2024-04-03 09:00,2024-04-03 08:00,2300,2290,2320,200,5,100,Breakout,
C4,XAUUSD,long,closed,2024-04-04 09:00,2024-04-04 12:00,abc,2290,2320,200,5,100,Breakout,
"""


def test_csv_import_preview_commit_and_no_duplicates(api):
    acc, *_ = setup_refs(api)
    files = {"file": ("trades.csv", CSV.encode(), "text/csv")}
    data = {"trade_type": "live", "account_id": acc["id"]}
    job = api.post("/import/trades/preview", files=files, data=data).json()
    assert job["total_rows"] == 4 and job["valid_rows"] == 2 and job["error_rows"] == 2
    assert {e["line"] for e in job["errors"]} == {4, 5}
    assert api.get("/trades").json()["total"] == 0  # preview không ghi
    done = api.post(f"/import/jobs/{job['id']}/commit").json()
    assert done["status"] == "committed" and done["imported_rows"] == 2
    assert api.post(f"/import/jobs/{job['id']}/commit").json()["imported_rows"] == 2  # gọi lại không nhập lặp
    assert api.get("/trades").json()["total"] == 2
    # Nhập lại cùng tệp → toàn bộ là trùng
    job2 = api.post("/import/trades/preview", files={"file": ("trades.csv", CSV.encode(), "text/csv")}, data=data).json()
    assert job2["valid_rows"] == 0 and job2["duplicate_rows"] == 2
    t = api.get("/trades?q=C1").json()["items"][0]
    # thời gian không có múi giờ hiểu theo múi giờ người dùng (UTC+7)
    assert t["entry_time"].startswith("2024-04-01T02:00:00") and t["net_pnl"] == 195.0
    assert sorted(x["name"] for x in t["tags"]) == ["a+", "london"]


def test_csv_export_roundtrip(api, api_b):
    acc, st, v1, sess = setup_refs(api)
    api.post("/trades", json=live_trade(acc, notes="=HYPERLINK(\"x\")", tags=["A"]))
    api.post("/trades", json=bt_trade(sess, r_manual=2.5))
    csv_text = api.get("/export/trades.csv").content.decode("utf-8-sig")
    assert "'=HYPERLINK" in csv_text  # chống formula injection
    # Người dùng B tạo tham chiếu cùng tên rồi nhập lại tệp → giữ đúng các trường
    acc_b, st_b, v1_b, sess_b = setup_refs(api_b)
    job = api_b.post("/import/trades/preview", files={"file": ("x.csv", csv_text.encode(), "text/csv")}).json()
    assert job["valid_rows"] == 2, job["errors"]
    api_b.post(f"/import/jobs/{job['id']}/commit")
    a_items = sorted(api.get("/trades").json()["items"], key=lambda t: t["code"])
    b_items = sorted(api_b.get("/trades").json()["items"], key=lambda t: t["code"])
    keys = ["code", "trade_type", "market", "direction", "status", "entry_time", "exit_time", "entry_price",
            "stop_loss", "take_profit", "exit_price", "gross_pnl", "commission", "net_pnl", "r_multiple", "r_source",
            "setup", "market_condition", "plan_compliance", "notes", "timeframe"]
    for a, b in zip(a_items, b_items):
        assert {k: a[k] for k in keys} == {k: b[k] for k in keys}
        assert [t["name"] for t in a["tags"]] == [t["name"] for t in b["tags"]]


def test_export_archive_contains_manifest(api):
    acc, *_ = setup_refs(api)
    t = api.post("/trades", json=live_trade(acc)).json()
    img = api.post(f"/trades/{t['id']}/images", files={"file": ("a.png", PNG, "image/png")}).json()
    z = zipfile.ZipFile(io.BytesIO(api.get("/export/archive.zip").content))
    names = set(z.namelist())
    assert {"trades.csv", "strategies.csv", "backtest_sessions.csv", "accounts.csv", "manifest.json",
            "stats_report.json"} <= names
    m = json.loads(z.read("manifest.json"))
    entry = m["images"][0]
    assert entry["trade_id"] == t["id"] and entry["trade_code"] == t["code"]
    assert z.read(entry["file"]) == PNG and entry["image_id"] == img["id"]


def test_price_series_no_fake_data(api):
    assert api.get("/prices/series?symbol=XAUUSD").json() == []
    csv_text = "time,open,high,low,close\n2024-01-01 00:00,2000,2010,1995,2005\n2024-01-01 04:00,2005,2012,2001,2008\n"
    s = api.post("/prices/series/import", files={"file": ("p.csv", csv_text.encode(), "text/csv")},
                 data={"symbol": "xauusd", "timeframe": "H4", "source": "MT5 export (tài khoản cá nhân)"}).json()
    assert s["bar_count"] == 2
    bars = api.get(f"/prices/series/{s['id']}/bars").json()["bars"]
    assert len(bars) == 2 and bars[0]["open"] == 2000
    mt5 = "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\n2024.01.02\t08:00:00\t2000\t2010\t1995\t2005\t120\n"
    s2 = api.post("/prices/series/import", files={"file": ("mt5.csv", mt5.encode(), "text/csv")},
                  data={"symbol": "XAUUSD", "timeframe": "H1", "source": "MT5", "timezone": "Europe/Athens"}).json()
    assert s2["bar_count"] == 1 and s2["first_ts"].startswith("2024-01-02T06:00:00")
    bad = "time,open,high,low,close\n2024-01-01 00:00,2000,1990,1995,2005\n"
    assert api.post("/prices/series/import", files={"file": ("p.csv", bad.encode(), "text/csv")},
                    data={"symbol": "X", "timeframe": "H4", "source": "x"}).status_code == 422


def test_audit_log_written(api):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import AuditLog
    acc, *_ = setup_refs(api)
    t = api.post("/trades", json=live_trade(acc)).json()
    api.delete(f"/trades/{t['id']}")
    with SessionLocal() as db:
        actions = set(db.scalars(select(AuditLog.action)))
    assert {"auth.register", "trade.create", "trade.delete"} <= actions
