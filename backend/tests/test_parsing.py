import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))
from parsing import normalize_fuel, parse_percent, parse_pressure_kpa, parse_quantity, percent_in_text  # noqa: E402


def test_single_and_units():
    q = parse_quantity("20 cm/s")
    assert (q.value, q.quality) == (20.0, "measured")


def test_approx():
    q = parse_quantity("~ 21.5")
    assert q.value == 21.5 and q.quality == "approx"


def test_range():
    q = parse_quantity("21.5 - 21.7")
    assert (q.min, q.max, q.quality) == (21.5, 21.7, "range")
    q = parse_quantity("22.1 to 22.0")
    assert (q.min, q.max) == (22.0, 22.1)


def test_set_points_fraction_to_percent():
    q = parse_percent("0.17; 0.21;0.25; 0.3", fraction=True)
    assert q.quality == "set" and q.min == 17 and q.max == 30


def test_not_reported_and_suspect():
    assert parse_quantity("n/a").quality == "not_reported"
    assert parse_quantity("").value is None
    # spreadsheet percent-format artefact must not be "fixed" silently
    assert parse_percent("3400%").quality == "suspect"


def test_pressure_conversion():
    assert parse_pressure_kpa("760", "mmhg").value == 101.32
    assert parse_pressure_kpa("1", "atm").value == 101.33 or parse_pressure_kpa("1", "atm").value == 101.32
    assert parse_pressure_kpa("0.5; 1.0; 3.0", "atm").max == 303.98


def test_percent_in_text():
    q = percent_in_text("~21% O2 with N2")
    assert q.value == 21 and q.quality == "approx"


def test_fuel_family():
    assert normalize_fuel("2 cm SIBAL") == "SIBAL (cotton-fiberglass fabric)"
    assert normalize_fuel("1/4\" clear rod") == "PMMA"
    assert normalize_fuel("75 % Propylene") == "Propylene"
    assert normalize_fuel("unknown thing") is None


def test_mixed_sample_keeps_both_families():
    assert normalize_fuel("PMMA & Nomex") == "PMMA + Nomex"
    assert normalize_fuel("IsoOctane (pure)") == "Isooctane"
