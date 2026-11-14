"""Robust parsing helpers for the heterogeneous PSI experimental tables.

Every parsed quantity keeps:
  value    representative number (single value, or mid-point of a range/set)
  min/max  bounds when the source gives a range or a list of set-points
  quality  measured | approx | range | set | derived | suspect | not_reported
  raw      the original cell text (always shown in the UI next to the value)

Nothing is silently corrected. Cells that cannot be parsed unambiguously are
kept as raw text with quality=suspect or not_reported.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import asdict, dataclass
from pathlib import Path

NUM = r"[-+]?(?:\d+\.\d*|\.\d+|\d+)"
NA_TOKENS = {"", "n/a", "na", "none", "-", "--", "?", "insignificant", "see fig. 5"}

MMHG_TO_KPA = 0.133322
ATM_TO_KPA = 101.325
BAR_TO_KPA = 100.0


@dataclass
class Quantity:
    value: float | None
    min: float | None
    max: float | None
    quality: str
    raw: str

    def scaled(self, factor: float) -> "Quantity":
        f = lambda x: None if x is None else round(x * factor, 6)  # noqa: E731
        return Quantity(f(self.value), f(self.min), f(self.max), self.quality, self.raw)

    def dict(self) -> dict:
        return asdict(self)


def read_table(path: Path) -> tuple[list[str], list[list[str]], str]:
    """Read a CSV that may be UTF-8 (with BOM) or Windows-1252."""
    data = path.read_bytes()
    try:
        text, enc = data.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        text, enc = data.decode("cp1252"), "cp1252"
    rows = list(csv.reader(io.StringIO(text)))
    header = [h.strip() for h in rows[0]]
    body = [r + [""] * (len(header) - len(r)) for r in rows[1:]]
    return header, body, enc


def is_empty(row: list[str]) -> bool:
    return all(not c.strip() for c in row)


def is_note_row(row: list[str]) -> bool:
    """A free-text footnote stored as a table row (only first cell filled)."""
    first = row[0].strip()
    rest_empty = all(not c.strip() for c in row[1:])
    return rest_empty and bool(re.match(r"^(note\b|\*)", first, re.I))


def parse_quantity(cell: str | None) -> Quantity:
    raw = (cell or "").strip()
    low = raw.lower()
    if low in NA_TOKENS:
        return Quantity(None, None, None, "not_reported", raw)

    approx = "~" in raw or "approx" in low
    nums = [float(n) for n in re.findall(NUM, raw.replace(",", ""))]
    if not nums:
        return Quantity(None, None, None, "not_reported", raw)

    # List of set-points: "0.17; 0.21;0.25; 0.3" or "0.5; 1.0; 1.5; 2.0; or 3.0"
    if ";" in raw and len(nums) > 1:
        lo, hi = min(nums), max(nums)
        return Quantity(round((lo + hi) / 2, 6), lo, hi, "set", raw)

    # Range: "21.5 - 21.7", "0.1 - 5", "22.1 to 22.0"
    if len(nums) == 2 and re.search(rf"{NUM}\s*(?:-|–|to)\s*{NUM}", raw):
        lo, hi = sorted(nums)
        return Quantity(round((lo + hi) / 2, 6), lo, hi, "range", raw)

    if len(nums) == 1:
        v = nums[0]
        return Quantity(v, v, v, "approx" if approx else "measured", raw)

    return Quantity(None, None, None, "suspect", raw)


def parse_percent(cell: str | None, fraction: bool = False) -> Quantity:
    """Oxygen / gas concentration in percent by volume (= mole percent)."""
    q = parse_quantity(cell)
    if fraction:
        q = q.scaled(100.0)
    if q.value is not None and not (0 <= (q.max or q.value) <= 100):
        # e.g. "3400%" (spreadsheet percent-format artefact). Do not guess.
        return Quantity(None, None, None, "suspect", q.raw)
    return q


def parse_pressure_kpa(cell: str | None, unit: str) -> Quantity:
    factor = {"mmhg": MMHG_TO_KPA, "atm": ATM_TO_KPA, "bar": BAR_TO_KPA, "kpa": 1.0}[unit]
    q = parse_quantity(cell).scaled(factor)
    if q.value is not None and (q.min or q.value) <= 0:
        # A chamber pressure of 0 is not physical for a burning test: flag, don't use.
        return Quantity(None, None, None, "suspect", q.raw)
    for k in ("value", "min", "max"):
        v = getattr(q, k)
        if v is not None:
            setattr(q, k, round(v, 2))
    return q


def percent_in_text(text: str | None) -> Quantity:
    """'~21% O2 with N2' -> 21 (approx)."""
    raw = (text or "").strip()
    m = re.search(rf"({NUM})\s*%\s*O2", raw)
    if not m:
        return Quantity(None, None, None, "not_reported", raw)
    v = float(m.group(1))
    return Quantity(v, v, v, "approx" if "~" in raw else "measured", raw)


FUEL_PATTERNS = [
    (r"\bCH4\b|methane", "Methane"),
    (r"\bC2H4\b|ethylene", "Ethylene"),
    (r"\bC2H6\b|\bethane\b", "Ethane"),
    (r"\bC3H8\b|propane", "Propane"),
    (r"\bC3H6\b|propylene", "Propylene"),
    (r"butane|\bC4H10\b", "Butane"),
    (r"dibutyl phthalate", "Dibutyl phthalate (DBP)"),
    (r"dimethyl ether|\bDME\b", "Dimethyl ether"),
    (r"methanol", "Methanol"),
    (r"\bethanol", "Ethanol"),
    (r"iso-?octane", "Isooctane"),
    (r"\bn-?octane", "n-Octane"),
    (r"n-?decane|\bdecane\b|\bC10H22\b", "n-Decane"),
    (r"(?<!iso-)(?<!iso)dodecane|\bC12H26\b", "n-Dodecane"),
    (r"iso-?dodecane", "Isododecane"),
    (r"heptane|\bC7H16\b", "n-Heptane"),
    (r"hexanol", "Hexanol"),
    (r"\bSIBAL\b|cotton.?fiberglass|cotton", "SIBAL (cotton-fiberglass fabric)"),
    (r"PMMA|acrylic|clear rod|blac?k? rod", "PMMA"),
    (r"\bH2\b|hydrogen", "Hydrogen"),
    (r"wax|candle|paraffin", "Wax (candle / paraffin)"),
    (r"nomex", "Nomex"),
    (r"ultem", "Ultem"),
    (r"silicone", "Silicone"),
    (r"kapton", "Kapton"),
    (r"teflon|PTFE", "Teflon (PTFE)"),
    (r"pyrell", "Pyrell foam"),
    (r"lamp ?wick", "Lamp wick"),
    (r"dust", "Dust (non-combustible aerosol)"),
]


def normalize_fuel(raw: str | None) -> str | None:
    """Map a free-text fuel/material description to a canonical family.

    Returns None when no known family matches (the raw text is still kept).
    """
    if not raw:
        return None
    found = [name for pat, name in FUEL_PATTERNS if re.search(pat, raw, re.I)]
    found = list(dict.fromkeys(found))
    return " + ".join(found) if found else None
