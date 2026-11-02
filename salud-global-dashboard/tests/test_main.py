from fastapi.testclient import TestClient

from app import main


def test_health():
    with TestClient(main.app) as c:
        assert c.get("/health").json() == {"status": "ok"}


CSV = (
    "Date_reported,Country_code,Country,WHO_region,New_cases,Cumulative_cases,New_deaths,Cumulative_deaths\n"
    "2026-01-01,MX,Mexico,AMR,,10,,1\n"
    "2026-01-02,MX,Mexico,AMR,5,15,0,1\n"
    "2026-01-03,MX,Mexico,AMR,,14,1,2\n"
)


def _patch(monkeypatch):
    async def fake(request):
        return {"countries": main.parse_who(CSV), "meta": {}}
    monkeypatch.setattr(main, "get_data", fake)


def test_history_computes_daily_deltas(monkeypatch):
    _patch(monkeypatch)
    with TestClient(main.app) as c:
        body = c.get("/api/history?days=30").json()
        by_country = c.get("/api/countries/mexico/history?days=30").json()
    assert body["dates"] == ["2026-01-02", "2026-01-03"]
    assert body["new_cases"] == [5, 0]  # los acumulados no bajan
    assert body["new_deaths"] == [0, 1]
    assert by_country == body


def test_unknown_country_is_404(monkeypatch):
    _patch(monkeypatch)
    with TestClient(main.app) as c:
        assert c.get("/api/countries/Atlantis/history").status_code == 404


def test_rejects_bad_input():
    with TestClient(main.app) as c:
        assert c.get("/api/history?days=1").status_code == 422
        assert c.get("/api/countries/%3Cscript%3E/history").status_code == 422
