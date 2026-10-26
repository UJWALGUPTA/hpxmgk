"""API tests against the bundled January 2026 snapshot."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_meta():
    body = client.get("/api/meta").json()
    assert body["decision_window"] == {"from": "2026-01-02", "to": "2026-02-01"}
    assert len(body["delivery_days"]) == 31
    assert {a["id"] for a in body["auctions"]} >= {"epex-60", "n2ex-60", "epex-30"}


def test_day_view_only_uses_forecasts_available_at_gate():
    body = client.get("/api/day/2026-01-15").json()
    assert body["gate_closure"] == "2026-01-14T09:20:00+00:00"
    assert body["decision_publish_time"] <= body["gate_closure"]
    assert len(body["series"]) == 48  # half-hourly grid
    decision = [v for v in body["vintages"] if v["is_decision"]]
    assert len(decision) == 1 and decision[0]["available_at_gate"]
    assert any(not v["available_at_gate"] for v in body["vintages"])


def test_custom_gate_changes_decision_vintage():
    early = client.get("/api/day/2026-01-15", params={"gate": "03:00"}).json()
    late = client.get("/api/day/2026-01-15", params={"gate": "16:00"}).json()
    assert early["decision_publish_time"] < late["decision_publish_time"]


def test_accuracy_shape():
    body = client.get("/api/accuracy").json()
    overall = body["overall"]
    assert overall["n"] == 31 * 24
    assert overall["mae"] > 0 and overall["rmse"] >= overall["mae"]
    assert 0 <= overall["coverage"] <= 1
    assert len(body["daily"]) == 31
    assert len(body["by_hour"]) == 24
    assert sum(b["count"] for b in body["histogram"]) == overall["n"]


def test_errors():
    assert client.get("/api/day/2026-03-01").status_code == 404
    assert client.get("/api/accuracy", params={"auction": "nope"}).status_code == 422
    assert client.get("/api/accuracy", params={"gate": "9am"}).status_code == 422
