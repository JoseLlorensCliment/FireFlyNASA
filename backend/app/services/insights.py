"""Safety Insights — descriptive analyses only (no risk scores).

Every function returns data that can be traced to PSI rows, plus a `method` text
explaining exactly how it was computed and a `limitations` list.
"""
from __future__ import annotations

import json
import math
from collections import Counter, defaultdict

from app.models.database import query

MOON = {"o2_min": 30.0, "p_max": 70.3}          # challenge: >=30 % O2, <=10.2 psi
EARTH = {"o2": 21.0, "p": 101.3}
SUIT = {"o2": 100.0, "p": 29.6}

SCENARIOS = {
    "iss": {"label": "ISS-like cabin (≈21% O₂, ≈101 kPa)", "o2": 21.0, "p": 101.3},
    "moon": {"label": "Moon Base / pressurized rover (≥30% O₂, ≤70.3 kPa)", "o2": 30.0, "p": 70.3, "region": True},
    "suit": {"label": "Spacesuit (100% O₂, 29.6 kPa)", "o2": 100.0, "p": 29.6},
}
O2_SCALE, P_SCALE = 20.0, 50.0  # normalisation for the "distance to scenario" criterion


def _num(v: str | None) -> float | None:
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# 1. Exploration-atmosphere coverage
# ---------------------------------------------------------------------------
def atmosphere_coverage() -> dict:
    rows = query("""SELECT t.accession, i.acronym, t."table", t.o2, t.o2_min, t.o2_max, t.pressure, t.fuel, t.outcome
                    FROM tests t JOIN investigations i USING(accession)
                    WHERE t.o2 IS NOT NULL AND t.pressure IS NOT NULL
                      AND t.kind NOT IN ('auxiliary','continuation','data_index')""")
    per: dict[str, dict] = {}
    points = []
    for r in rows:
        inverse = "inverse" in r["table"]
        acc = r["accession"]
        p = per.setdefault(acc, {"accession": acc, "acronym": r["acronym"], "n": 0, "n_ambient": 0,
                                 "in_moon_region": 0, "o2_ge_30_any_p": 0, "p_le_70": 0,
                                 "max_ambient_o2": None, "min_pressure": None})
        p["n"] += 1
        p["min_pressure"] = r["pressure"] if p["min_pressure"] is None else min(p["min_pressure"], r["pressure"])
        if not inverse:  # only ambient O2 is comparable with cabin atmospheres
            p["n_ambient"] += 1
            p["max_ambient_o2"] = r["o2"] if p["max_ambient_o2"] is None else max(p["max_ambient_o2"], r["o2"])
            if r["o2"] >= MOON["o2_min"]:
                p["o2_ge_30_any_p"] += 1
            if r["pressure"] <= MOON["p_max"]:
                p["p_le_70"] += 1
            if r["o2"] >= MOON["o2_min"] and r["pressure"] <= MOON["p_max"]:
                p["in_moon_region"] += 1
        points.append({"accession": acc, "group": r["acronym"] or acc, "o2": r["o2"], "o2_min": r["o2_min"],
                       "o2_max": r["o2_max"], "pressure": r["pressure"], "inverse": inverse,
                       "label": " · ".join(x for x in (r["fuel"], r["outcome"]) if x)})
    summary = sorted(per.values(), key=lambda x: -x["n"])
    total_ambient = sum(s["n_ambient"] for s in summary)
    in_moon = sum(s["in_moon_region"] for s in summary)
    no_op = [r["acronym"] or r["accession"] for r in query(
        "SELECT accession, acronym FROM investigations WHERE n_tests > 0") if r["accession"] not in per]
    return {
        "points": points,
        "summary": summary,
        "totals": {"rows_with_o2_and_pressure": len(rows), "ambient_rows": total_ambient,
                   "ambient_rows_in_moon_region": in_moon},
        "investigations_without_o2_pressure_rows": no_op,
        "method": ("Rows from PSI experimental tables that report both O₂ and pressure (harmonized to % and kPa). "
                   "'Moon region' = ambient O₂ ≥ 30% and pressure ≤ 70.3 kPa (10.2 psi), as stated in the challenge. "
                   "Inverse-flame rows (O₂ is the burner oxidizer stream, not the cabin atmosphere) are plotted "
                   "but excluded from the ambient counts. Set-point lists and ranges are plotted at their mid-point "
                   "with error bars."),
        "limitations": [
            "PSI contains no partial-gravity (lunar/Martian) combustion data; all points are microgravity tests.",
            "Gaseous, droplet and solid-fuel configurations are shown together for coverage only, not for comparing results.",
            "Several investigations (BASS, BASS-II, Saffire, SPICE) do not report pressure per row and are absent from this map.",
        ],
    }


# ---------------------------------------------------------------------------
# 2. FLEX: suppressant dilution vs reported outcome
# ---------------------------------------------------------------------------
def flex_suppression() -> dict:
    rows = query("""SELECT fuel, o2, co2, he, pressure, burn_time, outcome, raw FROM tests
                    WHERE accession = 'PSI-69' AND kind = 'test'""")
    pts, groups = [], defaultdict(Counter)
    for r in rows:
        diluent = "CO₂ added" if (r["co2"] or 0) > 0 else "He added" if (r["he"] or 0) > 0 else "No suppressant (O₂/N₂)"
        raw = r["raw"] if isinstance(r["raw"], dict) else json.loads(r["raw"])
        pts.append({"fuel": r["fuel"], "o2": r["o2"], "co2": r["co2"], "he": r["he"], "pressure": r["pressure"],
                    "burn_time": r["burn_time"], "outcome": r["outcome"], "diluent": diluent,
                    "burning_rate": _num(raw.get("Burning rate; mm")),
                    "extinction_d": _num(raw.get("Visible flame extinction diameter; mm")),
                    "d0": _num(raw.get("Droplet initial diameter; mm"))})
        groups[(r["fuel"], diluent)][r["outcome"] or "n/r"] += 1
    table = [{"fuel": f, "diluent": d, "n": sum(c.values()), "outcomes": dict(c)} for (f, d), c in sorted(groups.items())]
    return {
        "points": pts, "table": table,
        "method": ("All 274 FLEX (PSI-69) droplet tests. Each test is grouped by its initial ambient composition: "
                   "CO₂ > 0 → 'CO₂ added'; He > 0 → 'He added'; otherwise O₂/N₂ only. Outcomes are the 'Test end' "
                   "values reported by FLEX (Extinction / Disruption / Completion). Counts are descriptive."),
        "limitations": [
            "FLEX tested liquid droplets (methanol, heptane); results do not transfer directly to solid cabin materials.",
            "Test conditions were chosen iteratively to find limits, so outcome counts are not frequencies of real fires.",
            "The 'Burning rate' column header in the source lacks its unit beyond 'mm' (likely mm²/s); shown as reported.",
        ],
    }


# ---------------------------------------------------------------------------
# 3. Saffire-II: microgravity vs normal-gravity flame spread (verbatim)
# ---------------------------------------------------------------------------
def saffire_ug_vs_1g() -> dict:
    rows = query("""SELECT raw, fuel FROM tests WHERE accession = 'PSI-99' AND kind = 'test' ORDER BY row_index""")
    out = []
    for r in rows:
        raw = r["raw"] if isinstance(r["raw"], dict) else json.loads(r["raw"])
        out.append({
            "sample": raw.get("Sample Number"), "material": raw.get("Material") or "(not stated in table)",
            "family": r["fuel"], "thickness": raw.get("Samle Thickness"), "flow": raw.get("Air Flow (cm/s)"),
            "direction": raw.get("Flow Direction"), "o2": raw.get("Percent O2 (Note 1)"),
            "ug_burn_length": raw.get("?-g Burn Length"), "ug_spread": raw.get("?-g Spread Length"),
            "g1_burn_length": raw.get("1-g Burn Length"), "g1_spread": raw.get("1-g Spread Rate"),
            "burn_time": raw.get("Burn Time (s)"),
        })
    notes = query("SELECT notes FROM tables_meta WHERE accession = 'PSI-99'")
    return {
        "rows": out, "notes": notes[0]["notes"] if notes else [],
        "method": ("Verbatim values from the Saffire-II experimental table (PSI-99). Microgravity columns ('µ-g', "
                   "printed as '?-g' in the source) are shown next to the normal-gravity reference columns. No values "
                   "are derived or recomputed."),
        "limitations": [
            "Nine samples at a single flow (20 cm/s) and ~21.5–22.1% O₂; no pressure is reported.",
            "Two rows have no material in the source table (likely the same as the previous sample) and are left blank.",
            "Values are partly qualitative ('Complete', 'Acceleratory', '~ 0').",
        ],
    }


# ---------------------------------------------------------------------------
# 4. BASS-II: O2 consumption and CO production per test
# ---------------------------------------------------------------------------
def bass2_products() -> dict:
    rows = query("SELECT raw, fuel, fuel_raw FROM tests WHERE accession = 'PSI-25' AND kind = 'test'")
    pts = []
    for r in rows:
        raw = r["raw"] if isinstance(r["raw"], dict) else json.loads(r["raw"])
        o2i, o2f = _num(raw.get("Calibrated  initial O2 % by vol")), _num(raw.get("Calibrated final O2 % by vol"))
        coi, cof = _num(raw.get("Initial CO (ppm)")), _num(raw.get("Final CO (ppm)"))
        if o2i is None or o2f is None:
            continue
        pts.append({"test": raw.get("Test #"), "pi": raw.get("PI"), "family": r["fuel"] or "unclassified",
                    "material": r["fuel_raw"], "o2_initial": o2i, "o2_final": o2f, "o2_drop": round(o2i - o2f, 2),
                    "co_initial": coi, "co_final": cof,
                    "co_rise": None if coi is None or cof is None else round(cof - coi, 1),
                    "flag": "large O₂ drop (>5 points): check source" if (o2i - o2f) > 5 else None})
    return {
        "points": pts,
        "method": ("BASS-II (PSI-25) reports calibrated O₂ and CO before and after each test in the glovebox volume. "
                   "We plot O₂ drop = initial − final (percentage points) against CO rise = final − initial (ppm), "
                   "per test, coloured by fuel family. Drops above 5 points are flagged for manual verification."),
        "limitations": [
            "Values depend on burn duration, sample size and the number of samples burned in the same atmosphere; "
            "they describe the chamber, not intrinsic material properties.",
            "Flow is only reported as instrument settings, so tests at different flows are mixed.",
        ],
    }


# ---------------------------------------------------------------------------
# 5. Transparent relevance criteria per scenario (weights are applied client-side)
# ---------------------------------------------------------------------------
CRITERIA = [
    {"key": "safety_role", "label": "Directly addresses fire safety",
     "desc": "1 if curated role includes prevention, detection or suppression; 0 otherwise."},
    {"key": "solid_materials", "label": "Solid cabin-type materials",
     "desc": "1 if fuels are solids (fabrics, plastics), 0.5 aerosol/dust, 0 for gas or liquid fuels."},
    {"key": "condition_proximity", "label": "Tested close to the scenario atmosphere",
     "desc": "1 − min(1, d), d = distance from the closest tested ambient (O₂, P) point to the scenario, with O₂ "
             "scaled by 20 points and P by 50 kPa (0 inside the Moon region). 0 when O₂ and pressure are not reported."},
    {"key": "quantitative_data", "label": "Per-test quantitative data in PSI",
     "desc": "1 if PSI provides a per-test table, 0.5 for summaries/condition matrices, 0 for none."},
    {"key": "flight_data", "label": "Microgravity flight data",
     "desc": "1 for ISS/Cygnus investigations, 0 for ground re-analyses."},
]


def _distance(o2: float, p: float, sc: dict) -> float:
    if sc.get("region"):
        do2 = max(0.0, sc["o2"] - o2)
        dp = max(0.0, p - sc["p"])
    else:
        do2, dp = abs(o2 - sc["o2"]), abs(p - sc["p"])
    return math.hypot(do2 / O2_SCALE, dp / P_SCALE)


def relevance_criteria() -> dict:
    invs = query("SELECT accession, acronym, title, fuel_phase, roles, project_type, n_tests FROM investigations")
    kinds = defaultdict(set)
    for r in query("SELECT accession, kind FROM tests GROUP BY accession, kind"):
        kinds[r["accession"]].add(r["kind"])
    pts = defaultdict(list)
    for r in query("""SELECT accession, "table", o2, pressure FROM tests
                      WHERE o2 IS NOT NULL AND pressure IS NOT NULL AND kind NOT IN ('auxiliary','continuation')"""):
        if "inverse" not in r["table"]:
            pts[r["accession"]].append((r["o2"], r["pressure"]))
    out = []
    for inv in invs:
        roles = set(inv["roles"] or [])
        k = kinds.get(inv["accession"], set())
        base = {
            "safety_role": {"value": 1.0 if roles & {"prevention", "detection", "suppression"} else 0.0,
                            "why": ", ".join(sorted(roles)) or "no role"},
            "solid_materials": {"value": {"solid": 1.0, "aerosol": 0.5}.get(inv["fuel_phase"], 0.0),
                                "why": inv["fuel_phase"] or "unknown"},
            "quantitative_data": {"value": 1.0 if "test" in k else 0.5 if k & {"test_day", "condition_set", "session"} else 0.0,
                                  "why": ", ".join(sorted(k)) or "no PSI table"},
            "flight_data": {"value": 1.0 if inv["project_type"] == "Microgravity Investigation" else 0.0,
                            "why": inv["project_type"]},
        }
        prox = {}
        for sid, sc in SCENARIOS.items():
            if not pts.get(inv["accession"]):
                prox[sid] = {"value": 0.0, "why": "O₂ and pressure not both reported per row"}
                continue
            d, (o2, p) = min((_distance(o2, p, sc), (o2, p)) for o2, p in pts[inv["accession"]])
            prox[sid] = {"value": round(max(0.0, 1 - min(1.0, d)), 3),
                         "why": f"closest tested point {o2:.1f}% O₂, {p:.0f} kPa"}
        out.append({"accession": inv["accession"], "acronym": inv["acronym"], "title": inv["title"],
                    "criteria": base, "condition_proximity": prox})
    return {
        "scenarios": [{"id": k, **v} for k, v in SCENARIOS.items()],
        "criteria": CRITERIA,
        "investigations": out,
        "method": ("Relevance = Σ weightᵢ × criterionᵢ / Σ weights, with user-adjustable weights. Every criterion is "
                   "a documented property of the PSI record or data. This ranks how relevant an investigation's "
                   "evidence is to a scenario; it is NOT a fire-risk score for any material or atmosphere."),
    }
