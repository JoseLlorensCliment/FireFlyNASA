"""Scientifically careful comparison of 2–4 investigations.

Only harmonized variables are compared. For each one we report coverage, ranges,
quality flags and a comparability status, plus explicit warnings whenever the
investigations differ in ways that make a direct comparison misleading.
"""
from __future__ import annotations

from collections import Counter

from app.models.database import query, query_one

NUMERIC = [
    ("o2", "Oxygen concentration", "%"),
    ("pressure", "Pressure", "kPa"),
    ("flow", "Imposed flow velocity", "cm/s"),
    ("co2", "CO₂ concentration", "%"),
    ("he", "Helium concentration", "%"),
    ("burn_time", "Burn time", "s"),
]
CATEGORICAL = [("fuel", "Fuel / material family"), ("flow_direction", "Flow direction"), ("outcome", "Reported outcome")]

ROW_KIND_LABEL = {"test": "individual tests", "test_day": "daily summaries", "condition_set": "condition matrices",
                  "session": "sessions", "data_index": "data index"}
PHASE_LABEL = {"solid": "solid samples", "liquid": "liquid droplets", "gas": "gaseous flames", "aerosol": "aerosols/dust"}

# Variables whose physical meaning depends on the experiment configuration.
CONFIG_DEPENDENT = {
    "burn_time": "Burn time means different things across configurations (droplet lifetime vs. duration of a burning "
                 "sample vs. flame duration on a burner).",
    "outcome": "Outcome categories are defined by each investigation (e.g. FLEX 'Disruption' vs. CFI-G 'Flow terminated').",
    "flow": "Flow velocity is imposed differently (duct flow over a sample, co-flow around a burner, droplet drift).",
}


def _rows(acc: str) -> list[dict]:
    return query("""SELECT "table", kind, fuel, fuel_raw, o2, o2_min, o2_max, o2_quality,
                    pressure, pressure_min, pressure_max, pressure_quality, flow, flow_min, flow_max, flow_quality,
                    co2, co2_quality, he, he_quality, burn_time, burn_time_quality, flow_direction, outcome
                    FROM tests WHERE accession = ? AND kind NOT IN ('auxiliary','continuation','data_index')""", (acc,))


def _numeric_stats(rows: list[dict], key: str) -> dict:
    vals = [r for r in rows if r[key] is not None]
    if not vals:
        return {"n": 0, "of": len(rows), "min": None, "max": None, "median": None, "quality": {}}

    def lo_of(r):
        v = r.get(f"{key}_min")
        return v if v is not None else r[key]

    def hi_of(r):
        v = r.get(f"{key}_max")
        return v if v is not None else r[key]

    xs = sorted(r[key] for r in vals)
    return {"n": len(vals), "of": len(rows), "min": min(lo_of(r) for r in vals), "max": max(hi_of(r) for r in vals),
            "median": xs[len(xs) // 2],
            "quality": dict(Counter(r.get(f"{key}_quality") or "measured" for r in vals))}


def _overlap(stats: list[dict]) -> dict | None:
    if any(s["n"] == 0 for s in stats):
        return None
    lo = max(s["min"] for s in stats)
    hi = min(s["max"] for s in stats)
    return {"overlaps": lo <= hi, "min": lo if lo <= hi else None, "max": hi if lo <= hi else None}


def compare(accessions: list[str]) -> dict:
    invs = []
    for acc in accessions:
        inv = query_one("""SELECT accession, acronym, title, project_type, flight_platform, fuel_phase, roles,
                           hardware_family, hardware, start_date, end_date, n_tests FROM investigations
                           WHERE accession = ?""", (acc,))
        if inv:
            inv["_rows"] = _rows(acc)
            inv["row_kinds"] = dict(Counter(r["kind"] for r in inv["_rows"]))
            inv["tables"] = sorted({r["table"] for r in inv["_rows"]})
            invs.append(inv)
    if len(invs) < 2:
        raise ValueError("Select at least two valid investigations")

    names = {i["accession"]: i["acronym"] or i["accession"] for i in invs}
    warnings: list[dict] = []

    def attr(label, key, fmt=lambda v: v):
        vals = {i["accession"]: fmt(i[key]) for i in invs}
        return {"label": label, "values": vals, "status": "same" if len({str(v) for v in vals.values()}) == 1 else "different"}

    attributes = [
        attr("Project type", "project_type"),
        attr("Platform", "flight_platform"),
        attr("Fuel phase", "fuel_phase", lambda v: PHASE_LABEL.get(v, v)),
        attr("Hardware family", "hardware_family"),
        attr("Fire-safety role", "roles", lambda v: ", ".join(v or [])),
        attr("Start year", "start_date", lambda v: (v or "?")[:4]),
        {"label": "Rows are",
         "values": {i["accession"]: ", ".join(f"{v} {ROW_KIND_LABEL.get(k, k)}" for k, v in i["row_kinds"].items())
                    or "no table" for i in invs},
         "status": "same" if len({tuple(sorted(i["row_kinds"])) for i in invs}) == 1 else "different"},
    ]

    phases = {i["fuel_phase"] for i in invs}
    if len(phases) > 1:
        warnings.append({"level": "critical", "title": "Different fuel phases",
                         "text": "These investigations burn " + ", ".join(sorted(PHASE_LABEL.get(p, str(p)) for p in phases)) +
                                 ". Burning rates, burn times and extinction behaviour are governed by different physics "
                                 "and must not be compared as like-for-like values. Compare the conditions tested, not the results."})
    kinds = {k for i in invs for k in i["row_kinds"]}
    if len(kinds) > 1 or kinds & {"test_day", "condition_set"}:
        detail = "; ".join(f"{names[i['accession']]}: " + (", ".join(ROW_KIND_LABEL.get(k, k) for k in i["row_kinds"]) or "no table")
                           for i in invs)
        warnings.append({"level": "warning", "title": "Rows do not represent the same thing",
                         "text": f"{detail}. Row counts and distributions are therefore not comparable; daily summaries "
                                 "and condition matrices list set-points rather than individual test outcomes."})
    if {i["project_type"] for i in invs} == {"Microgravity Investigation", "Ground Investigation"}:
        warnings.append({"level": "info", "title": "Flight vs ground",
                         "text": "Ground investigations re-analyse or model flight data; they are not independent microgravity tests."})
    inverse = [names[i["accession"]] for i in invs if any("inverse" in t for t in i["tables"])]
    if inverse:
        warnings.append({"level": "warning", "title": "Inverse flames",
                         "text": f"{', '.join(inverse)} include inverse flames, where O₂ is the oxidizer-stream concentration "
                                 "issuing from the burner — not the ambient atmosphere. Do not compare it with ambient O₂ of other experiments."})
    empty = [names[i["accession"]] for i in invs if not i["_rows"]]
    if empty:
        warnings.append({"level": "info", "title": "No tabulated data",
                         "text": f"{', '.join(empty)}: no PSI experimental table; only documents can be compared."})

    variables = []
    for key, label, unit in NUMERIC:
        per = {i["accession"]: _numeric_stats(i["_rows"], key) for i in invs}
        reported = [a for a, s in per.items() if s["n"] > 0]
        if not reported:
            status = "not_reported"
        elif len(reported) < len(invs):
            status = "partial"
        elif key in CONFIG_DEPENDENT and len(phases) > 1:
            status = "not_comparable"
        elif (key == "o2" and inverse) or any(set(s["quality"]) - {"measured"} for s in per.values() if s["n"]):
            status = "caution"
        else:
            status = "comparable"
        variables.append({"key": key, "label": label, "unit": unit, "kind": "numeric", "status": status,
                          "per_investigation": per,
                          "overlap": _overlap(list(per.values())) if len(reported) == len(invs) else None,
                          "note": CONFIG_DEPENDENT.get(key)})
    for key, label in CATEGORICAL:
        per = {}
        for i in invs:
            c = Counter(r[key] for r in i["_rows"] if r[key])
            per[i["accession"]] = {"n": sum(c.values()), "of": len(i["_rows"]), "top": c.most_common(8)}
        reported = [a for a, s in per.items() if s["n"] > 0]
        shared = []
        if len(reported) == len(invs):
            shared = sorted(set.intersection(*[{v for v, _ in per[a]["top"]} for a in reported]))
        status = ("not_reported" if not reported else "partial" if len(reported) < len(invs)
                  else "not_comparable" if key in CONFIG_DEPENDENT
                  else "comparable" if shared else "different")
        variables.append({"key": key, "label": label, "unit": None, "kind": "categorical", "status": status,
                          "per_investigation": per, "shared_values": shared, "note": CONFIG_DEPENDENT.get(key)})

    shared_fuels = next(v["shared_values"] for v in variables if v["key"] == "fuel")
    if shared_fuels:
        warnings.append({"level": "info", "title": "Shared fuels / materials",
                         "text": "All selected investigations used: " + ", ".join(shared_fuels) +
                                 ". These are the most defensible points of comparison, provided geometry and flow also match."})

    points = []
    for i in invs:
        rows = [r for r in i["_rows"] if r["o2"] is not None]
        step = max(1, len(rows) // 600)
        for r in rows[::step]:
            points.append({"accession": i["accession"], "o2": r["o2"], "o2_min": r["o2_min"], "o2_max": r["o2_max"],
                           "pressure": r["pressure"], "flow": r["flow"], "quality": r["o2_quality"],
                           "inverse": "inverse" in r["table"], "fuel": r["fuel"] or r["fuel_raw"], "outcome": r["outcome"]})

    for i in invs:
        i.pop("_rows")
    return {"investigations": invs, "attributes": attributes, "variables": variables,
            "warnings": warnings, "points": points}
