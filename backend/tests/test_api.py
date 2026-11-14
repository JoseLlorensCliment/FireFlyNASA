import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def test_health():
    assert client.get("/api/health").json()["db"] is True


def test_stats_are_derived_from_data():
    s = client.get("/api/stats").json()
    assert s["n_investigations"] == 24
    assert s["n_microgravity"] + s["n_ground"] == 24
    assert s["n_test_rows"] > 1500


def test_search_and_filters():
    res = client.get("/api/investigations", params={"q": "extinguishment"}).json()
    assert any(r["acronym"] == "FLEX" for r in res)
    solids = client.get("/api/investigations", params={"fuel_phase": "solid"}).json()
    assert solids and all(r["fuel_phase"] == "solid" for r in solids)


def test_detail_and_tests_keep_provenance():
    d = client.get("/api/investigations/PSI-69").json()
    assert d["doi"] and d["tables"] and d["publications"]
    page = client.get("/api/investigations/PSI-69/tests", params={"limit": 5}).json()
    row = page["items"][0]
    assert row["provenance"]["o2"].startswith("O initial")
    assert row["harmonized"]["o2"]["raw"] == row["raw"]["O initial ambient composition; mole fraction"]


def test_unknown_investigation_404():
    assert client.get("/api/investigations/PSI-9999").status_code == 404


def test_compare_flags_incompatible_phases():
    d = client.get("/api/compare", params={"ids": "PSI-69,PSI-25"}).json()
    assert any(w["title"] == "Different fuel phases" for w in d["warnings"])
    fuel = next(v for v in d["variables"] if v["key"] == "fuel")
    assert fuel["status"] == "different"
    assert client.get("/api/compare", params={"ids": "PSI-69"}).status_code == 400


def test_compare_flags_inverse_flame_oxygen():
    d = client.get("/api/compare", params={"ids": "PSI-159,PSI-10"}).json()
    assert any(w["title"] == "Inverse flames" for w in d["warnings"])
    assert next(v for v in d["variables"] if v["key"] == "o2")["status"] == "caution"


def test_insights_endpoints_are_descriptive_and_documented():
    for path in ("atmospheres", "flex-suppression", "saffire-gravity", "bass2-products"):
        d = client.get(f"/api/insights/{path}").json()
        assert d["method"]
    atm = client.get("/api/insights/atmospheres").json()
    assert atm["totals"]["ambient_rows_in_moon_region"] <= atm["totals"]["ambient_rows"]
    rel = client.get("/api/insights/relevance").json()
    assert "NOT a fire-risk score" in rel["method"]
    assert all(0 <= c["value"] <= 1 for i in rel["investigations"] for c in i["criteria"].values())


def test_report_without_ai_is_deterministic_markdown():
    r = client.post("/api/reports", json={"question": "Suppression in FLEX vs BASS", "accessions": ["PSI-69", "PSI-26"]})
    assert r.status_code == 200
    d = r.json()
    assert d["ai"] is None and d["comparison"]["warnings"]
    md = d["markdown"]
    for h in ("Research question", "Investigations consulted", "Relevant data", "Comparison", "Limitations", "References"):
        assert h in md
    assert "10.60555/mbq8-0451" in md  # FLEX dataset DOI
    assert client.post("/api/reports", json={"question": "x?", "accessions": []}).status_code == 422


def test_report_with_ai_degrades_gracefully_without_index_or_key(monkeypatch):
    from app.ai import retriever
    monkeypatch.setattr(retriever, "_load", lambda: (_ for _ in ()).throw(RuntimeError("RAG index not found")))
    d = client.post("/api/reports", json={"question": "Oxygen effects?", "accessions": ["PSI-69"], "include_ai": True}).json()
    assert d["ai"]["mode"] == "unavailable" and "AI discussion unavailable" in d["markdown"]
