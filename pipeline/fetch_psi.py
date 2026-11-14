"""Download NASA PSI (Physical Sciences Informatics) combustion-science data.

Source: https://psi.nasa.gov/physci/repo  (public, CC0-1.0, no account needed)

The PSI web app is an Angular SPA backed by an undocumented JSON API. We use
the same public endpoints the site uses:

  GET /geode-py/ws/repo/search?ffield=Research Area&fvalue=combustion science
  GET /geode-py/ws/repo/investigations/{accession}
  GET /geode-py/ws/studies/{accession}/download?file=..&version=..&redirect=false
      -> returns a pre-signed S3 URL

The PSI server is slow (1-300 s per record), so this script is idempotent: it
skips anything already on disk. The app never calls PSI at runtime; it reads
the snapshot written here.

Usage:  python pipeline/fetch_psi.py [--force]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.parse import quote

import httpx

BASE = "https://psi.nasa.gov/geode-py/ws"
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "psi"
INV_DIR = RAW / "investigations"
TABLE_DIR = RAW / "experimental_tables"
DOC_DIR = RAW / "documents"
SEARCH_FILE = RAW / "combustion_investigations_search.json"

# Light, text-rich document categories worth indexing for the AI assistant.
DOC_CATEGORIES = {"Science Documents", "Reports", "Presentations"}
DOC_EXT = {".pdf"}
MAX_DOC_MB = 25

TIMEOUT = httpx.Timeout(connect=30, read=900, write=30, pool=30)


def log(msg: str) -> None:
    print(msg, flush=True)


def get_json(client: httpx.Client, url: str, retries: int = 3):
    for attempt in range(1, retries + 1):
        try:
            r = client.get(url)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            log(f"  ! attempt {attempt}/{retries} failed for {url}: {exc}")
            time.sleep(3 * attempt)
    return None


def fetch_search(client: httpx.Client, force: bool) -> list[dict]:
    if SEARCH_FILE.exists() and not force:
        data = json.loads(SEARCH_FILE.read_text(encoding="utf-8"))
    else:
        url = (f"{BASE}/repo/search?from=0&size=200&ffield={quote('Research Area')}"
               f"&fvalue={quote('combustion science')}")
        data = get_json(client, url)
        if data is None:
            sys.exit("Could not reach the PSI search API.")
        SEARCH_FILE.write_text(json.dumps(data), encoding="utf-8")
    hits = [h["_source"] for h in data["hits"]["hits"]]
    log(f"PSI search index: {len(hits)} combustion-science investigations")
    return hits


def file_category(acc: str, f: dict) -> str:
    return f.get("remote_path", "").split(f"/{acc}/")[-1].split("/")[0]


def slim_record(rec: dict) -> dict:
    """Drop the huge per-version file lists, keep a compact file summary."""
    acc = rec["accession"]
    files = []
    for f in rec.get("added") or []:
        files.append({
            "file_name": f.get("file_name"),
            "category": file_category(acc, f),
            "file_size": f.get("file_size"),
            "version": f.get("version"),
        })
    out = {k: v for k, v in rec.items() if k not in ("added", "removed", "modified")}
    out["files_latest_version"] = files
    return out


def fetch_investigation(client: httpx.Client, acc: str, force: bool) -> dict | None:
    path = INV_DIR / f"{acc}.json"
    if path.exists() and not force:
        return json.loads(path.read_text(encoding="utf-8"))
    log(f"  fetching {acc} (PSI can take minutes for large records)...")
    rec = get_json(client, f"{BASE}/repo/investigations/{acc}")
    if rec is None:
        return None
    slim = slim_record(rec)
    path.write_text(json.dumps(slim, indent=1), encoding="utf-8")
    return slim


def presigned(client: httpx.Client, acc: str, file_name: str, version) -> str | None:
    for v in [version, 1, 2, 3]:
        if v is None:
            continue
        try:
            r = client.get(f"{BASE}/studies/{acc}/download",
                           params={"file": file_name, "version": v, "redirect": "false"})
            if r.status_code == 200 and r.text.startswith("https"):
                return r.text.strip()
        except httpx.HTTPError:
            pass
    return None


def download(client: httpx.Client, acc: str, file_name: str, version, dest: Path) -> bool:
    if dest.exists():
        return True
    url = presigned(client, acc, file_name, version)
    if not url:
        log(f"  ! no download URL for {acc}/{file_name}")
        return False
    with client.stream("GET", url) as r:
        if r.status_code != 200:
            log(f"  ! {r.status_code} downloading {file_name}")
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as fh:
            for chunk in r.iter_bytes():
                fh.write(chunk)
    log(f"  + {dest.relative_to(ROOT)}")
    return True


def table_filename(acc: str, file_name: str) -> str:
    """PSI-26_Experimental table_BASS.csv -> PSI-26.csv ; multi-table -> PSI-10_normal.csv"""
    stem = file_name.rsplit(".", 1)[0]
    suffix = stem.split("_")[-1].lower()
    if "inverse" in suffix:
        return f"{acc}_inverse.csv"
    if "normal" in suffix:
        return f"{acc}_normal.csv"
    return f"{acc}.csv"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download everything")
    ap.add_argument("--docs", action="store_true", help="also download light PDF documents")
    args = ap.parse_args()
    for d in (INV_DIR, TABLE_DIR, DOC_DIR):
        d.mkdir(parents=True, exist_ok=True)

    with httpx.Client(timeout=TIMEOUT, follow_redirects=True,
                      headers={"User-Agent": "flame-intelligence-pipeline/0.1"}) as client:
        hits = fetch_search(client, args.force)
        for h in sorted(hits, key=lambda s: int(s["Accession"].split("-")[1])):
            acc = h["Accession"]
            if h.get("Research Area", "").lower() != "combustion science":
                continue
            rec = fetch_investigation(client, acc, args.force)
            if rec is None:
                log(f"  ! {acc}: detail record unavailable, the search-index entry will be used")
                continue
            for t in rec.get("experimentalTable") or []:
                download(client, acc, t["file_name"], t.get("version"),
                         TABLE_DIR / table_filename(acc, t["file_name"]))
            if args.docs:
                for f in rec.get("files_latest_version", []):
                    name = f["file_name"] or ""
                    if (f["category"] in DOC_CATEGORIES and Path(name).suffix.lower() in DOC_EXT
                            and (f.get("file_size") or 0) < MAX_DOC_MB * 1e6):
                        download(client, acc, name, f.get("version"), DOC_DIR / acc / name)
    log("done")


if __name__ == "__main__":
    main()
