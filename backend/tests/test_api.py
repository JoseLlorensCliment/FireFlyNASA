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
