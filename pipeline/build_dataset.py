"""Build the Flame Intelligence SQLite database from the PSI snapshot.

Input : data/raw/psi/**            (written by fetch_psi.py)
        data/metadata/curation.json (hand-curated, human-reviewed)
Output: data/processed/flame.db

Each experimental-table row is stored twice:
  * raw      - the original row, verbatim (column -> cell text)
  * harmonized fields (fuel, O2 %, pressure kPa, flow cm/s ...) with
    value/min/max/quality/raw and the source column (provenance).
Only harmonized fields are ever compared across investigations.

Usage: python pipeline/build_dataset.py
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).parent))
from parsing import (  # noqa: E402
    Quantity, is_empty, is_note_row, normalize_fuel, parse_percent,
    parse_pressure_kpa, parse_quantity, percent_in_text, read_table,
)

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "psi"
OUT = ROOT / "data" / "processed" / "flame.db"
CURATION = json.loads((ROOT / "data" / "metadata" / "curation.json").read_text(encoding="utf-8"))
PSI_URL = "https://psi.nasa.gov/physci/repo/data/investigations/{}"

# --------------------------------------------------------------------------
# Canonical (harmonized) variables
# --------------------------------------------------------------------------
VARIABLES = [
    ("fuel", "Fuel / material", None, "Fuel or sample material, normalized to a family; original text kept."),
    ("o2", "Oxygen concentration", "% (mole/volume)", "Ambient O2 (or oxidizer-stream O2 for inverse flames). Mole fraction x100."),
    ("pressure", "Pressure", "kPa", "Chamber/ambient pressure converted from mmHg, atm or bar."),
    ("flow", "Flow velocity", "cm/s", "Imposed air/oxidizer flow velocity past the sample or burner."),
    ("flow_direction", "Flow direction", None, "Concurrent / opposed (solids) or co-flow (gas jets)."),
    ("co2", "CO2 concentration", "% (mole/volume)", "Ambient CO2 (FLEX: suppressant; BASS-II: initial product level)."),
    ("he", "Helium concentration", "% (mole/volume)", "Ambient helium (FLEX suppressant / diluent)."),
    ("burn_time", "Burn time", "s", "Duration of burning as reported by the investigation."),
    ("outcome", "Test outcome", None, "Reported end state, e.g. extinction, disruption, completion."),
]

F = Callable[[dict], Quantity | str | None]


def col(name: str) -> Callable[[dict], str]:
    return lambda r: r.get(name, "")


def q_pct(name: str, fraction=False) -> F:
    return lambda r: parse_percent(r.get(name), fraction)


def q_kpa(name: str, unit: str) -> F:
    return lambda r: parse_pressure_kpa(r.get(name), unit)


def q_num(name: str) -> F:
    return lambda r: parse_quantity(r.get(name))


def cfig_outcome(r: dict) -> str | None:
    ign = (r.get("Hot ignition") or "").strip().lower()
    term = (r.get("Self -ext or flow term") or r.get("Self-ext or flow term") or "").strip().upper()
    if ign == "no":
        return "No ignition"
    return {"SE": "Self-extinguished", "FT": "Flow terminated"}.get(term, ign.capitalize() or None)


# table file stem -> spec
#   kind: test | test_day | condition_set | session | data_index
#   fields: canonical -> (source column label, extractor)
TABLES: dict[str, dict] = {
    "PSI-69": {"kind": "test", "fields": {
        "fuel": ("Fuel", col("Fuel")),
        "o2": ("O initial ambient composition; mole fraction", q_pct("O initial ambient composition; mole fraction", True)),
        "co2": ("CO initial ambient composition; mole fraction", q_pct("CO initial ambient composition; mole fraction", True)),
        "he": ("He initial ambient composition; mole fraction", q_pct("He initial ambient composition; mole fraction", True)),
        "pressure": ("Ambient pressure; mmHg", q_kpa("Ambient pressure; mmHg", "mmhg")),
        "burn_time": ("Burn time; s", q_num("Burn time; s")),
        "outcome": ("Test end", col("Test end")),
    }, "note": "Column headers lost their subscripts in the source file (e.g. 'O' = O2, 'CO' = CO2), confirmed by the N2 column and mole fractions summing to 1."},
    "PSI-68": {"kind": "condition_set", "fields": {
        "fuel": ("Sample (Fuel Type)", col("Sample (Fuel Type)")),
        "o2": ("Oxygen Mole Fraction", q_pct("Oxygen Mole Fraction", True)),
        "pressure": ("Ambient Pressure (atm)", q_kpa("Ambient Pressure (atm)", "atm")),
        "flow": ("Flow Velocity (cm/s)", q_num("Flow Velocity (cm/s)")),
    }, "note": "Rows are test-condition matrices (sets of O2 and pressure set-points), not individual tests."},
    "PSI-39": {"kind": "test", "fields": {
        "fuel": ("Fuel", col("Fuel")),
        "o2": ("Oxygen (mole fraction)", q_pct("Oxygen", True)),
        "he": ("Helium (mole fraction)", q_pct("Helium", True)),
        "pressure": ("Pressure (atm)", q_kpa("Pressure", "atm")),
    }},
    "PSI-25": {"kind": "test", "fields": {
        "fuel": ("Fuel Sample Material", col("Fuel Sample Material")),
        "o2": ("Calibrated  initial O2 % by vol", q_pct("Calibrated  initial O2 % by vol")),
        "co2": ("Initial CO2 % by vol", q_pct("Initial CO2 % by vol")),
    }, "note": "Flow is reported as fan/air display settings, not in physical units, so it is not harmonized."},
    "PSI-26": {"kind": "test", "fields": {
        "fuel": ("Fuel Sample Material", col("Fuel Sample Material")),
    }, "note": "Inventory of tests only (no atmosphere or flow values in this table)."},
    "PSI-98": {"kind": "test", "fields": {
        "fuel": ("Material", col("Material")),
        "o2": ("Percent O2", q_pct("Percent O2")),
        "flow": ("Air Flow (cm/s)", q_num("Air Flow (cm/s)")),
        "flow_direction": ("Flow Direction", col("Flow Direction")),
        "burn_time": ("Burn Time (s)", q_num("Burn Time (s)")),
    }},
    "PSI-99": {"kind": "test", "fields": {
        "fuel": ("Material", col("Material")),
        "o2": ("Percent O2 (Note 1)", q_pct("Percent O2 (Note 1)")),
        "flow": ("Air Flow (cm/s)", q_num("Air Flow (cm/s)")),
        "flow_direction": ("Flow Direction", col("Flow Direction")),
        "burn_time": ("Burn Time (s)", q_num("Burn Time (s)")),
    }, "note": "'?-g' in headers is 'µ-g' (microgravity) with the µ lost in encoding. Note 1: O2 derived from measured CO2 production referenced to the ISS-reported initial O2."},
    "PSI-100": {"kind": "test", "fields": {
        "fuel": ("Material", col("Material")),
        "flow": ("Air Flow", q_num("Air Flow")),
        "flow_direction": ("Direction", col("Direction")),
    }},
    "PSI-107": {"kind": "test", "fields": {
        "fuel": ("Fuel", col("Fuel")),
        "flow": ("Air Rate (cm/s)", q_num("Air Rate (cm/s)")),
        "flow_direction": ("(co-flow burner)", lambda r: "Co-flow"),
    }},
    "PSI-106": {"kind": "test_day", "fields": {"fuel": ("Fuel Type", col("Fuel Type"))}},
    "PSI-20": {"kind": "test_day", "fields": {
        "fuel": ("Fuel Bottle", col("Fuel Bottle")),
        "o2": ("Oxygen Conc (percent)", q_pct("Oxygen Conc (percent)")),
        "flow_direction": ("(quiescent)", lambda r: "Quiescent"),
    }, "note": "Each row summarises one test day; chamber pressure varied but is not reported in this table."},
    "PSI-21": {"kind": "test_day", "fields": {"fuel": ("Fuel Bottle", col("Fuel Bottle"))},
               "fuel_family": lambda r: {"Methane based test": "Methane", "Ethylene based test": "Ethylene"}.get(r.get("Test Type", "")),
               "note": "The 'Fuel Bottle' column contains spreadsheet auto-fill artefacts (e.g. 'CH5', 'C2H7'); the fuel family is therefore taken from 'Test Type' where it names the fuel. Original text is preserved."},
    "PSI-22": {"kind": "test_day", "fields": {"fuel": ("Fuel Bottle", col("Fuel Bottle"))},
               "continuation_if_empty": "Test Type",
               "note": "Rows with an empty 'Test Type' list additional fuel concentrations for the previous test day."},
    "PSI-23": {"kind": "test_day", "fields": {
        "fuel": ("Fuel Bottle", col("Fuel Bottle")),
        "o2": ("Atmosphere*", lambda r: percent_in_text(r.get("Atmosphere*"))),
    }},
    "PSI-10_normal": {"kind": "test", "fields": {
        "fuel": ("Fuel", col("Fuel")),
        "o2": ("XO2 (init)", q_pct("XO2 (init)", True)),
        "pressure": ("pmean (atm)", q_kpa("pmean (atm)", "atm")),
    }},
    "PSI-10_inverse": {"kind": "test", "fields": {
        "fuel": ("XC2H4 initial (fuel in ambient)", lambda r: "C2H4 (ambient)"),
        "o2": ("XO2 (oxidizer stream)", q_pct("XO2", True)),
        "pressure": ("pmean (atm)", q_kpa("pmean (atm)", "atm")),
    }, "note": "Inverse flames: oxygen flows from the burner into a fuel-containing ambient, so O2 refers to the oxidizer stream."},
    "PSI-159_normal": {"kind": "test", "fields": {
        "fuel": ("Fuel", col("Fuel")),
        "o2": ("XO2 before test", q_pct("XO2 before test", True)),
        "pressure": ("approx p (bar)", lambda r: _approx(parse_pressure_kpa(r.get("approx p (bar)"), "bar"))),
        "burn_time": ("burn time (sec)", q_num("burn time (sec)")),
        "outcome": ("Hot ignition + Self-ext or flow term", cfig_outcome),
    }},
    "PSI-159_inverse": {"kind": "test", "fields": {
        "fuel": ("Fuel", col("Fuel")),
        "o2": ("XO2 (oxidizer stream)", q_pct("XO2", True)),
        "pressure": ("approx p (bar)", lambda r: _approx(parse_pressure_kpa(r.get("approx p (bar)"), "bar"))),
        "burn_time": ("burn time (sec)", q_num("burn time (sec)")),
        "outcome": ("Hot ignition + Self -ext or flow term", cfig_outcome),
    }, "note": "Inverse flames: O2 refers to the oxidizer stream issuing from the spherical burner (up to 85%)."},
    "PSI-101": {"kind": "test", "fields": {
        "fuel": ("Sample Type", col("Sample Type")),
        "flow": ("Inlet velocity (cm/s)", q_num("Inlet velocity (cm/s)")),
    }},
    "PSI-102": {"kind": "test", "fields": {
        "fuel": ("Sample Material", col("Sample Material")),
        "flow": ("Air Flow (cm/s)", q_num("Air Flow (cm/s)")),
    }},
    "PSI-47": {"kind": "session", "fields": {"fuel": ("Sample Material", col("Sample Material"))}},
    "PSI-142": {"kind": "data_index", "fields": {}, "note": "Index of datasets published as figures in the referenced papers."},
}


def _approx(q: Quantity) -> Quantity:
    if q.quality == "measured":
        q.quality = "approx"
    return q


# --------------------------------------------------------------------------
# Investigations & publications
# --------------------------------------------------------------------------

def split5(s: str | None) -> list[str]:
    return [p.strip() for p in re.split(r"\s{5,}", s or "") if p.strip()]


def load_investigations() -> list[dict]:
    search = json.loads((RAW / "combustion_investigations_search.json").read_text(encoding="utf-8"))
    out = []
    for h in search["hits"]["hits"]:
        s = h["_source"]
        acc = s["Accession"]
        if s.get("Research Area", "").lower() != "combustion science":
            continue
        detail_path = RAW / "investigations" / f"{acc}.json"
        d = json.loads(detail_path.read_text(encoding="utf-8")) if detail_path.exists() else None
        cur = CURATION["investigations"].get(acc, {})
        hw = s.get("Experiment Hardware") or {}
        inv = {
            "accession": acc,
            "acronym": (d or {}).get("investigationAcronym") or s.get("Acronym") or None,
            "title": s.get("Title"),
            "project_type": s.get("Project Type"),
            "flight_platform": (s.get("Flight Platform") or "").strip() or None,
            "sub_research_area": s.get("SubResearch Area") or None,
            "start_date": _date(s.get("Investigation Start Date")),
            "end_date": _date(s.get("Investigation End Date")),
            "release_date": _ts(s.get("Public Release Date")),
            "doi": (d or {}).get("doi"),
            "license": (d or {}).get("licenseIdentifier") or "CC0-1.0",
            "hardware": (hw.get("Name") or "").strip() or (d or {}).get("experimentHardware") or None,
            "hardware_link": (hw.get("Link") or "").strip() or None,
            "nasa_center": s.get("Monitoring Center"),
            "sponsor": s.get("Sponsoring Agency"),
            "objectives": s.get("Objectives"),
            "approach": s.get("Approach"),
            "hypothesis": s.get("Hypothesis"),
            "research_impacts": s.get("Research Impacts/Earth Benefits"),
            "keywords": json.dumps(split5(s.get("Keywords"))),
            "related": json.dumps([r for r in split5(s.get("Related Investigations")) if r.startswith("PSI-")]),
            "contacts": json.dumps([
                {"name": f"{c.get('firstName', '')} {c.get('lastName', '')}".strip(),
                 "affiliation": c.get("affiliation")} for c in (d or {}).get("contacts", [])
            ]),
            "total_file_size": (d or {}).get("totalFileSize"),
            "psi_url": PSI_URL.format(acc),
            "record_source": "psi_detail" if d else "psi_search_index",
            "fuel_phase": cur.get("fuel_phase"),
            "roles": json.dumps(cur.get("roles", [])),
            "tags": json.dumps(cur.get("tags", [])),
            "hardware_family": cur.get("hardware_family"),
            "curation_basis": cur.get("basis"),
            "_pubs": _pubs(s, d),
            "_files": (d or {}).get("files_latest_version", []),
        }
        out.append(inv)
    return out


def _date(s: str | None) -> str | None:
    if not s or not s.strip():
        return None
    try:
        return datetime.strptime(s.strip(), "%m-%d-%Y").date().isoformat()
    except ValueError:
        return None


def _ts(v) -> str | None:
    try:
        return datetime.fromtimestamp(float(v), tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError):
        return None


def _pubs(s: dict, d: dict | None) -> list[dict]:
    if d and d.get("publications"):
        return [{"title": p.get("title"), "authors": p.get("authorList"), "doi": p.get("doi") or None}
                for p in d["publications"] if p.get("title")]
    titles = split5(s.get("Publication Title"))
    authors = split5(s.get("Publication Author List"))
    return [{"title": t, "authors": authors[i] if i < len(authors) else None, "doi": None}
            for i, t in enumerate(titles)]


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------

def load_tables() -> tuple[list[dict], list[dict]]:
    tests, metas = [], []
    for path in sorted((RAW / "experimental_tables").glob("PSI-*.csv")):
        stem = path.stem
        acc = stem.split("_")[0]
        spec = TABLES.get(stem)
        if spec is None:
            print(f"  ! no spec for {stem}, skipped")
            continue
        header, body, enc = read_table(path)
        notes, kept = [], 0
        for i, row in enumerate(body):
            if is_empty(row):
                continue
            if is_note_row(row):
                notes.append(row[0].strip())
                continue
            raw = {h: c.strip() for h, c in zip(header, row) if h}
            rec = {"accession": acc, "table": stem, "row_index": i, "kind": spec["kind"],
                   "raw": raw, "provenance": {}}
            for field, (source, fn) in spec["fields"].items():
                val = fn(raw)
                rec["provenance"][field] = source
                rec[field] = val
            fam = spec.get("fuel_family")
            rec["fuel_family"] = fam(raw) if fam else None
            cont = spec.get("continuation_if_empty")
            if cont and not raw.get(cont):
                rec["kind"] = "continuation"
            # Saffire-type "pre-test flow visualisation" rows are not burns
            if re.match(r"^F\d", raw.get(header[0], "")):
                rec["kind"] = "auxiliary"
            tests.append(rec)
            kept += rec["kind"] not in ("auxiliary", "continuation")
        metas.append({"accession": acc, "table": stem, "source_file": str(path.relative_to(ROOT)),
                      "encoding": enc, "columns": json.dumps(header), "n_rows": kept,
                      "kind": spec["kind"], "notes": json.dumps(notes), "curator_note": spec.get("note")})
    return tests, metas


# --------------------------------------------------------------------------
# SQLite
# --------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE investigations (
  accession TEXT PRIMARY KEY, acronym TEXT, title TEXT, project_type TEXT, flight_platform TEXT,
  sub_research_area TEXT, start_date TEXT, end_date TEXT, release_date TEXT, doi TEXT, license TEXT,
  hardware TEXT, hardware_link TEXT, nasa_center TEXT, sponsor TEXT, objectives TEXT, approach TEXT,
  hypothesis TEXT, research_impacts TEXT, keywords TEXT, related TEXT, contacts TEXT,
  total_file_size REAL, psi_url TEXT, record_source TEXT, fuel_phase TEXT, roles TEXT, tags TEXT,
  hardware_family TEXT, curation_basis TEXT, n_tests INTEGER DEFAULT 0, n_publications INTEGER DEFAULT 0
);
CREATE TABLE publications (
  id INTEGER PRIMARY KEY, accession TEXT, title TEXT, authors TEXT, doi TEXT
);
CREATE TABLE files (
  id INTEGER PRIMARY KEY, accession TEXT, file_name TEXT, category TEXT, file_size REAL
);
CREATE TABLE tables_meta (
  accession TEXT, "table" TEXT PRIMARY KEY, source_file TEXT, encoding TEXT, columns TEXT,
  n_rows INTEGER, kind TEXT, notes TEXT, curator_note TEXT
);
CREATE TABLE tests (
  id INTEGER PRIMARY KEY, accession TEXT, "table" TEXT, row_index INTEGER, kind TEXT, raw TEXT,
  fuel_raw TEXT, fuel TEXT,
  o2 REAL, o2_min REAL, o2_max REAL, o2_quality TEXT,
  pressure REAL, pressure_min REAL, pressure_max REAL, pressure_quality TEXT,
  flow REAL, flow_min REAL, flow_max REAL, flow_quality TEXT,
  co2 REAL, co2_quality TEXT, he REAL, he_quality TEXT,
  burn_time REAL, burn_time_quality TEXT,
  flow_direction TEXT, outcome TEXT, harmonized TEXT, provenance TEXT
);
CREATE INDEX ix_tests_acc ON tests(accession);
CREATE TABLE variables (name TEXT PRIMARY KEY, label TEXT, unit TEXT, description TEXT);
CREATE TABLE scenarios (id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE dataset_info (key TEXT PRIMARY KEY, value TEXT);
"""


def qcols(rec: dict, field: str, with_bounds=True) -> list:
    q = rec.get(field)
    if not isinstance(q, Quantity):
        return [None, None, None, None] if with_bounds else [None, None]
    return [q.value, q.min, q.max, q.quality] if with_bounds else [q.value, q.quality]


def main() -> None:
    invs = load_investigations()
    tests, metas = load_tables()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    db = sqlite3.connect(OUT)
    db.executescript(SCHEMA)

    for inv in invs:
        acc = inv["accession"]
        pubs, files = inv.pop("_pubs"), inv.pop("_files")
        inv["n_publications"] = len(pubs)
        inv["n_tests"] = sum(1 for t in tests if t["accession"] == acc
                             and t["kind"] not in ("auxiliary", "continuation", "data_index"))
        cols = ",".join(inv.keys())
        db.execute(f"INSERT INTO investigations ({cols}) VALUES ({','.join('?' * len(inv))})",
                   list(inv.values()))
        db.executemany("INSERT INTO publications (accession,title,authors,doi) VALUES (?,?,?,?)",
                       [(acc, p["title"], p["authors"], p["doi"]) for p in pubs])
        db.executemany("INSERT INTO files (accession,file_name,category,file_size) VALUES (?,?,?,?)",
                       [(acc, f["file_name"], f["category"], f["file_size"]) for f in files])

    for m in metas:
        db.execute(f"INSERT INTO tables_meta VALUES ({','.join('?' * 9)})", list(m.values()))

    for t in tests:
        fuel_raw = t.get("fuel") or None
        harmonized = {k: (v.dict() if isinstance(v, Quantity) else v)
                      for k, v in t.items() if k in {v[0] for v in VARIABLES}}
        db.execute(
            """INSERT INTO tests (accession,"table",row_index,kind,raw,fuel_raw,fuel,
               o2,o2_min,o2_max,o2_quality,pressure,pressure_min,pressure_max,pressure_quality,
               flow,flow_min,flow_max,flow_quality,co2,co2_quality,he,he_quality,
               burn_time,burn_time_quality,flow_direction,outcome,harmonized,provenance)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [t["accession"], t["table"], t["row_index"], t["kind"], json.dumps(t["raw"]),
             fuel_raw, t.get("fuel_family") or normalize_fuel(fuel_raw),
             *qcols(t, "o2"), *qcols(t, "pressure"), *qcols(t, "flow"),
             *qcols(t, "co2", False), *qcols(t, "he", False), *qcols(t, "burn_time", False),
             (t.get("flow_direction") or "").strip().capitalize() or None,
             (t.get("outcome") or None),
             json.dumps(harmonized), json.dumps(t["provenance"])])

    db.executemany("INSERT INTO variables VALUES (?,?,?,?)", VARIABLES)
    for s in CURATION["scenarios"]["items"]:
        db.execute("INSERT INTO scenarios VALUES (?,?)", (s["id"], json.dumps(s)))
    info = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "NASA Physical Sciences Informatics (PSI) — https://psi.nasa.gov (CC0-1.0)",
        "n_investigations": str(len(invs)),
        "n_rows": str(len(tests)),
    }
    db.executemany("INSERT INTO dataset_info VALUES (?,?)", info.items())
    db.commit()

    # Report
    print(f"investigations: {len(invs)}  (detail records: "
          f"{sum(1 for i in invs if i['record_source'] == 'psi_detail')})")
    print(f"tables: {len(metas)}  rows: {len(tests)}")
    for field in ("o2", "pressure", "flow", "burn_time"):
        n = db.execute(f"SELECT COUNT(*) FROM tests WHERE {field} IS NOT NULL").fetchone()[0]
        sus = db.execute(f"SELECT COUNT(*) FROM tests WHERE {field}_quality='suspect'").fetchone()[0]
        print(f"  {field:10s} harmonized={n:5d} suspect={sus}")
    unmatched = db.execute("SELECT DISTINCT fuel_raw FROM tests WHERE fuel IS NULL AND fuel_raw IS NOT NULL").fetchall()
    print(f"  fuels without family match: {[u[0] for u in unmatched][:20]}")
    print(f"-> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
