"""Investigation catalogue, test tables and dashboard statistics."""
from __future__ import annotations

import re
from collections import Counter

from app.models.database import query, query_one

SUMMARY_COLS = """accession, acronym, title, project_type, flight_platform, sub_research_area,
  start_date, end_date, fuel_phase, roles, tags, hardware_family, n_tests, n_publications, objectives"""

SEARCH_FIELDS = {"acronym": 6.0, "title": 4.0, "keywords": 3.0, "tags": 3.0,
                 "objectives": 1.0, "approach": 0.6, "hypothesis": 0.6, "research_impacts": 0.4,
                 "fuels": 2.0}


def _excerpt(text: str | None, n: int = 260) -> str | None:
    if not text:
        return None
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[:n].rsplit(" ", 1)[0] + "…"


def _summary(row: dict, score: float | None = None) -> dict:
    row = dict(row)
    row["objectives_excerpt"] = _excerpt(row.pop("objectives", None))
    row["score"] = score
    return row


def _fuels_by_accession() -> dict[str, str]:
    rows = query("SELECT accession, group_concat(DISTINCT fuel) AS fuels FROM tests GROUP BY accession")
    return {r["accession"]: r["fuels"] or "" for r in rows}


def list_investigations(q: str | None = None, fuel_phase: str | None = None,
                        role: str | None = None, project_type: str | None = None,
                        has_tests: bool | None = None, sort: str = "relevance") -> list[dict]:
    rows = query(f"SELECT {SUMMARY_COLS}, keywords, approach, hypothesis, research_impacts FROM investigations")
    fuels = _fuels_by_accession()
    out = []
    terms = [t for t in re.findall(r"[\w\-]+", (q or "").lower()) if len(t) > 1]
    for r in rows:
        if fuel_phase and r["fuel_phase"] != fuel_phase:
            continue
        if role and role not in (r["roles"] or []):
            continue
        if project_type and (r["project_type"] or "").lower() != project_type.lower():
            continue
        if has_tests is not None and (r["n_tests"] > 0) != has_tests:
            continue
        score = None
        if terms:
            score = 0.0
            for field, w in SEARCH_FIELDS.items():
                val = fuels.get(r["accession"], "") if field == "fuels" else r.get(field)
                text = " ".join(val) if isinstance(val, list) else (val or "")
                text = text.lower()
                for t in terms:
                    score += w * text.count(t)
            if score == 0:
                continue
        for k in ("keywords", "approach", "hypothesis", "research_impacts"):
            r.pop(k, None)
        out.append(_summary(r, score))

    if sort == "relevance" and terms:
        out.sort(key=lambda x: -(x["score"] or 0))
    elif sort == "tests":
        out.sort(key=lambda x: -x["n_tests"])
    elif sort == "publications":
        out.sort(key=lambda x: -x["n_publications"])
    elif sort == "date":
        out.sort(key=lambda x: x["start_date"] or "0000", reverse=True)
    else:
        out.sort(key=lambda x: (x["project_type"] != "Microgravity Investigation", x["acronym"] or x["title"]))
    return out


def _column_summary(columns: list[str], rows: list[dict]) -> list[dict]:
    out = []
    for c in columns:
        if not c:
            continue
        vals = [r["raw"].get(c, "") for r in rows]
        non_empty = [v for v in vals if v]
        distinct = list(dict.fromkeys(non_empty))
        nums = []
        for v in non_empty:
            try:
                nums.append(float(v))
            except ValueError:
                pass
        status = "empty" if not distinct else ("constant" if len(distinct) == 1 else "varies")
        numeric = len(nums) >= max(2, int(0.8 * len(non_empty)))
        out.append({
            "column": c, "status": status, "distinct": len(distinct),
            "numeric_min": min(nums) if numeric and nums else None,
            "numeric_max": max(nums) if numeric and nums else None,
            "example_values": distinct[:6],
        })
    return out


def get_investigation(accession: str) -> dict | None:
    inv = query_one("SELECT * FROM investigations WHERE accession = ?", (accession,))
    if not inv:
        return None
    inv = _summary(inv) | {k: inv[k] for k in inv if k != "objectives"} | {"objectives": inv["objectives"]}
    inv["publications"] = query("SELECT title, authors, doi FROM publications WHERE accession = ? ORDER BY title",
                                (accession,))
    related = []
    for acc in inv.get("related") or []:
        r = query_one("SELECT accession, acronym, title FROM investigations WHERE accession = ?", (acc,))
        related.append(r or {"accession": acc, "acronym": None, "title": "(not a combustion-science record)"})
    inv["related"] = related
    tables = []
    for meta in query('SELECT * FROM tables_meta WHERE accession = ? ORDER BY "table"', (accession,)):
        rows = query('SELECT raw FROM tests WHERE "table" = ? AND kind NOT IN (\'auxiliary\',\'continuation\')',
                     (meta["table"],))
        meta["column_summary"] = _column_summary(meta["columns"], rows)
        tables.append(meta)
    inv["tables"] = tables
    cats = query("""SELECT category, COUNT(*) AS n, SUM(file_size) AS bytes FROM files
                    WHERE accession = ? GROUP BY category ORDER BY bytes DESC""", (accession,))
    inv["file_categories"] = cats
    return inv


def get_tests(accession: str, table: str | None = None, limit: int = 100, offset: int = 0,
              include_auxiliary: bool = False) -> dict:
    where = ["accession = ?"]
    params: list = [accession]
    if table:
        where.append('"table" = ?')
        params.append(table)
    if not include_auxiliary:
        where.append("kind NOT IN ('auxiliary','continuation')")
    w = " AND ".join(where)
    total = query_one(f"SELECT COUNT(*) AS n FROM tests WHERE {w}", params)["n"]
    items = query(f'SELECT * FROM tests WHERE {w} ORDER BY "table", row_index LIMIT ? OFFSET ?',
                  [*params, limit, offset])
    return {"total": total, "items": items}


def stats() -> dict:
    invs = query("SELECT accession, project_type, fuel_phase, roles, flight_platform, hardware_family, "
                 "n_tests, n_publications, start_date, end_date, acronym, title FROM investigations")
    info = {r["key"]: r["value"] for r in query("SELECT key, value FROM dataset_info")}
    n_rows = query_one("SELECT COUNT(*) AS n FROM tests WHERE kind NOT IN ('auxiliary','continuation','data_index')")["n"]
    harmonized = {}
    for f in ("fuel", "o2", "pressure", "flow", "co2", "he", "burn_time", "flow_direction", "outcome"):
        harmonized[f] = query_one(f"SELECT COUNT(*) AS n FROM tests WHERE {f} IS NOT NULL "
                                  "AND kind NOT IN ('auxiliary','continuation')")["n"]
    pubs = query_one("SELECT COUNT(*) AS n, COUNT(DISTINCT doi) AS d FROM publications")

    def facet(values) -> list[dict]:
        return [{"key": k or "Unspecified", "count": v} for k, v in Counter(values).most_common()]

    timeline = sorted(
        [{"accession": i["accession"], "label": i["acronym"] or f'{i["accession"]} (ground)', "start": i["start_date"],
          "end": i["end_date"], "project_type": i["project_type"], "fuel_phase": i["fuel_phase"]}
         for i in invs if i["start_date"] and i["end_date"]],
        key=lambda x: x["start"])
    return {
        "n_investigations": len(invs),
        "n_microgravity": sum(1 for i in invs if i["project_type"] == "Microgravity Investigation"),
        "n_ground": sum(1 for i in invs if i["project_type"] == "Ground Investigation"),
        "n_with_tables": sum(1 for i in invs if i["n_tests"] > 0),
        "n_test_rows": n_rows,
        "n_publications": pubs["n"],
        "n_dois": pubs["d"],
        "n_harmonized_variables": query_one("SELECT COUNT(*) AS n FROM variables")["n"],
        "harmonized_counts": harmonized,
        "by_fuel_phase": facet(i["fuel_phase"] for i in invs),
        "by_role": facet(r for i in invs for r in (i["roles"] or [])),
        "by_platform": facet((i["flight_platform"] if i["flight_platform"] not in (None, "Not Applicable")
                              else "Ground (re-analysis)") for i in invs),
        "by_hardware": facet(i["hardware_family"] for i in invs if i["hardware_family"]),
        "timeline": timeline,
        "source": info.get("source", ""),
        "built_at": info.get("built_at", ""),
    }


def variables() -> list[dict]:
    return query("SELECT * FROM variables")


def scenarios() -> list[dict]:
    return [r["data"] for r in query("SELECT data FROM scenarios")]
