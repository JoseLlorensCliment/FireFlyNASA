"""Build the retrieval corpus + FAISS index for the AI assistant, in resumable stages.

Corpus (all NASA sources):
  * psi_record   - each PSI investigation record (objectives, approach, hypothesis, impacts, hardware)
  * psi_table    - a factual, deterministic summary of every experimental table, generated from flame.db
                   (+ verbatim rows of tables with <= 40 rows)
  * psi_document - text of PDF documents downloaded from PSI (reports, science documents, presentations)
  * nasa_doc     - NASA GRC fact sheets and the Researcher's Guide to ISS Combustion Science

Stages (run all, or one at a time with --stage):
  chunks : PDFs + DB -> data/processed/rag/chunks.jsonl            (CPU, no network)
  embed  : chunks.jsonl -> data/processed/rag/embed_cache/<sig>/*.npy (Gemini API or local model)
           checkpointed per batch: re-running resumes where it stopped.
  index  : cached vectors -> data/processed/rag/index.faiss + manifest.json

Embedding provider/model/dimension come from .env (EMBEDDING_PROVIDER, EMBEDDING_MODEL,
EMBEDDING_DIM) and are recorded in manifest.json; the API refuses an index built with
different settings.

Usage:
  python pipeline/build_rag_index.py                    # all stages
  python pipeline/build_rag_index.py --stage chunks
  python pipeline/build_rag_index.py --stage embed      # resumable
  python pipeline/build_rag_index.py --stage index
  python pipeline/build_rag_index.py --limit 20 --out data/processed/rag_smoke   # quick end-to-end test
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import time
from collections import Counter
from pathlib import Path

import faiss
import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.ai.embeddings import embed_documents, signature  # noqa: E402
from app.core.config import get_settings  # noqa: E402

import numpy as np  # noqa: E402

DB = ROOT / "data" / "processed" / "flame.db"
OUT = ROOT / "data" / "processed" / "rag"
DOCS = ROOT / "data" / "raw" / "psi" / "documents"
NASA_DOCS = ROOT / "data" / "raw" / "nasa_docs"
PSI_URL = "https://psi.nasa.gov/physci/repo/data/investigations/{}"

CHUNK_CHARS = 1400
OVERLAP = 250
MIN_PAGE_CHARS = 200
SKIP_DOCS = re.compile(r"crew training|image directory nomenclature|researchers guide|pubslist", re.I)

NASA_DOC_META = {
    "researchers-guide.pdf": ("A Researcher's Guide to: Combustion Science (ISS, 2015)",
                              "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/", None),
    "advanced-combustion-via-microgravity-experiments-acme.pdf": ("NASA GRC fact sheet: ACME", None, "PSI-23"),
    "burning-and-suppression-of-solids-bass.pdf": ("NASA GRC fact sheet: BASS", None, "PSI-26"),
    "dust-and-aerosol-measurement-feasibility-test-daft.pdf": ("NASA GRC fact sheet: DAFT", None, "PSI-47"),
    "flame-extinguishment-experiment-flex.pdf": ("NASA GRC fact sheet: FLEX", None, "PSI-69"),
    "smoke-aerosol-measurement-experiment-same.pdf": ("NASA GRC fact sheet: SAME", None, "PSI-102"),
    "smoke-point-in-co-flow-experiment-spice.pdf": ("NASA GRC fact sheet: SPICE", None, "PSI-107"),
    "spacecraft-fire-safety-demonstration-saffire.pdf": ("NASA GRC fact sheet: Saffire", None, "PSI-98"),
    "structure-liftoff-in-combustion-experiment-slice.pdf": ("NASA GRC fact sheet: SLICE", None, "PSI-106"),
}
GRC_URL = "https://www.nasa.gov/wp-content/uploads/2025/07/{}"


def clean(text: str) -> str:
    text = text.replace("­", "").replace("ﬁ", "fi").replace("ﬂ", "fl")
    text = re.sub(r"-\n(\w)", r"\1", text)          # de-hyphenate line breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split(text: str) -> list[str]:
    if len(text) <= CHUNK_CHARS:
        return [text]
    out, start = [], 0
    while start < len(text):
        end = min(len(text), start + CHUNK_CHARS)
        if end < len(text):  # prefer to cut at a sentence/paragraph boundary
            cut = max(text.rfind(". ", start + CHUNK_CHARS // 2, end), text.rfind("\n", start + CHUNK_CHARS // 2, end))
            if cut > start:
                end = cut + 1
        out.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - OVERLAP, start + 1)
    return [c for c in out if len(c) > 80]


def pdf_chunks(path: Path, base: dict) -> list[dict]:
    chunks = []
    try:
        doc = fitz.open(path)
    except Exception as exc:  # noqa: BLE001
        print(f"  ! cannot open {path.name}: {exc}")
        return chunks
    for pno, page in enumerate(doc, start=1):
        text = clean(page.get_text("text"))
        if len(text) < MIN_PAGE_CHARS:
            continue
        for part in split(text):
            chunks.append({**base, "page": pno, "text": part})
    return chunks


def fmt_range(lo, hi, unit):
    if lo is None:
        return None
    if abs((hi or lo) - lo) < 1e-9:
        return f"{lo:g} {unit}"
    return f"{lo:g}–{hi:g} {unit}"


def table_summaries(db: sqlite3.Connection, inv: dict) -> list[str]:
    out = []
    metas = db.execute('SELECT "table", kind, n_rows, notes, curator_note FROM tables_meta WHERE accession=?',
                       (inv["accession"],)).fetchall()
    for table, kind, n_rows, notes, cnote in metas:
        rows = db.execute("""SELECT fuel, fuel_raw, o2_min, o2_max, pressure_min, pressure_max, flow_min, flow_max,
                             co2, he, burn_time, flow_direction, outcome FROM tests
                             WHERE "table"=? AND kind NOT IN ('auxiliary','continuation')""", (table,)).fetchall()
        name = inv["acronym"] or inv["accession"]
        lines = [f"Experimental data summary for {name} ({inv['accession']}), PSI table '{table}': "
                 f"{n_rows} rows, each row is {kind.replace('_', ' ')}."]
        fuels = Counter(r[0] or r[1] for r in rows if (r[0] or r[1]))
        if fuels:
            lines.append("Fuels/materials (rows): " + "; ".join(f"{k} ({v})" for k, v in fuels.most_common(12)) + ".")

        def rng(i, j, unit, label):
            vals = [(r[i], r[j]) for r in rows if r[i] is not None]
            if vals:
                lines.append(f"{label}: {fmt_range(min(v[0] for v in vals), max(v[1] for v in vals), unit)} "
                             f"(reported in {len(vals)} of {len(rows)} rows).")
            else:
                lines.append(f"{label}: not reported in this table.")
        rng(2, 3, "% O2", "Oxygen concentration")
        rng(4, 5, "kPa", "Pressure")
        rng(6, 7, "cm/s", "Imposed flow velocity")
        for idx, label, unit in ((8, "CO2", "%"), (9, "Helium", "%"), (10, "Burn time", "s")):
            vals = [r[idx] for r in rows if r[idx] is not None]
            if vals:
                lines.append(f"{label}: {min(vals):g}–{max(vals):g} {unit} (in {len(vals)} rows).")
        dirs = Counter(r[11] for r in rows if r[11])
        if dirs:
            lines.append("Flow direction (rows): " + ", ".join(f"{k} {v}" for k, v in dirs.items()) + ".")
        outs = Counter(r[12] for r in rows if r[12])
        if outs:
            lines.append("Reported outcomes (rows): " + ", ".join(f"{k} {v}" for k, v in outs.most_common()) + ".")
        if cnote:
            lines.append(f"Data note: {cnote}")
        for n in json.loads(notes or "[]"):
            lines.append(f"Table note: {n}")
        out.append(" ".join(lines))
    return out


def rel(p: Path) -> str:
    """Path relative to the repo root when possible (for portable log messages)."""
    try:
        return p.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(p)


def build_chunks() -> list[dict]:
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    invs = [dict(r) for r in db.execute("SELECT * FROM investigations")]
    by_acc = {i["accession"]: i for i in invs}
    chunks: list[dict] = []

    for inv in invs:
        acc, name = inv["accession"], inv["acronym"] or inv["accession"]
        base = {"accession": acc, "url": PSI_URL.format(acc), "page": None}
        header = (f"{name} — {inv['title']} ({acc}). {inv['project_type']}; platform: {inv['flight_platform'] or 'n/a'}; "
                  f"hardware: {inv['hardware'] or 'n/a'}; period {inv['start_date'] or '?'} to {inv['end_date'] or '?'}.")
        for field, label in (("objectives", "Objectives"), ("approach", "Approach"),
                             ("hypothesis", "Hypothesis"), ("research_impacts", "Research impacts / Earth benefits")):
            if inv[field]:
                for part in split(clean(inv[field])):
                    chunks.append({**base, "source_type": "psi_record", "doc_id": f"{acc}:record",
                                   "title": f"PSI record {acc} ({name}) — {label}",
                                   "text": f"{header}\n{label}: {part}"})
        for s in table_summaries(db, inv):
            chunks.append({**base, "source_type": "psi_table", "doc_id": f"{acc}:table",
                           "title": f"PSI experimental table summary — {name}", "text": s})
        # Small tables: also index the verbatim rows so specific values are retrievable.
        for (table, n_rows) in db.execute('SELECT "table", n_rows FROM tables_meta WHERE accession=?', (acc,)):
            if n_rows > 40:
                continue
            rows = db.execute('SELECT raw FROM tests WHERE "table"=? ORDER BY row_index', (table,)).fetchall()
            lines = ["; ".join(f"{k}={v}" for k, v in json.loads(r[0]).items() if v) for r in rows]
            text = f"Verbatim rows of PSI experimental table '{table}' ({name}, {acc}):\n" + "\n".join(lines)
            for part in split(text):
                chunks.append({**base, "source_type": "psi_table", "doc_id": f"{acc}:table",
                               "title": f"PSI experimental table rows — {name}", "text": part})

    pdfs = sorted(DOCS.glob("PSI-*/*.pdf"))
    if not pdfs:
        print(f"  ! no PSI PDFs found in {rel(DOCS)} — run: python pipeline/fetch_psi.py --docs")
    for path in pdfs:
        if SKIP_DOCS.search(path.name):
            continue
        acc = path.parent.name
        name = by_acc.get(acc, {}).get("acronym") or acc
        title = re.sub(r"^PSI-\d+_", "", path.stem).replace("_", " — ", 1).replace("_", " ")
        chunks += pdf_chunks(path, {"accession": acc, "source_type": "psi_document",
                                    "doc_id": f"psi:{path.parent.name}/{path.name}",
                                    "title": f"{name}: {title}", "url": PSI_URL.format(acc),
                                    "local_path": path.relative_to(ROOT).as_posix()})

    for path in sorted(NASA_DOCS.glob("*.pdf")):
        title, url, acc = NASA_DOC_META.get(path.name, (path.stem, None, None))
        chunks += pdf_chunks(path, {"accession": acc, "source_type": "nasa_doc", "doc_id": f"nasa:{path.name}",
                                    "title": title, "url": url or GRC_URL.format(path.name),
                                    "local_path": path.relative_to(ROOT).as_posix()})

    for i, c in enumerate(chunks):
        c["id"] = i
    return chunks


def read_chunks(out: Path) -> list[dict]:
    with (out / "chunks.jsonl").open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh]


def chunks_hash(out: Path) -> str:
    return hashlib.sha256((out / "chunks.jsonl").read_bytes()).hexdigest()[:16]


def cache_dir(out: Path) -> Path:
    sig = signature()
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", f"{sig['provider']}_{sig['model']}_{sig['dim']}")
    bs = get_settings().embed_batch_size  # part files are numbered per batch, so the batch size is part of the key
    return out / "embed_cache" / f"{safe}_bs{bs}_{chunks_hash(out)}"


def stage_chunks(out: Path, limit: int | None) -> None:
    chunks = build_chunks()
    if limit:
        chunks = chunks[:limit]
    out.mkdir(parents=True, exist_ok=True)
    with (out / "chunks.jsonl").open("w", encoding="utf-8", newline="\n") as fh:
        for c in chunks:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"chunks: {len(chunks)}  by type: {dict(Counter(c['source_type'] for c in chunks))}")
    print(f"-> {rel((out / 'chunks.jsonl'))}")


def stage_embed(out: Path) -> None:
    chunks = read_chunks(out)
    cdir = cache_dir(out)
    cdir.mkdir(parents=True, exist_ok=True)
    bs = get_settings().embed_batch_size
    n_batches = (len(chunks) + bs - 1) // bs
    print(f"embedding {len(chunks)} chunks with {signature()} in {n_batches} batches of {bs} -> {rel(cdir)}")
    t0 = time.time()
    for b in range(n_batches):
        part = cdir / f"part_{b:05d}.npy"
        if part.exists():
            continue  # checkpoint: already embedded
        batch = chunks[b * bs:(b + 1) * bs]
        vecs = embed_documents([(c["title"], c["text"]) for c in batch])
        np.save(part, vecs.astype("float32"))
        done = b + 1
        rate = (time.time() - t0) / max(1, done)
        print(f"  batch {done}/{n_batches} ({len(batch)} chunks, dim={vecs.shape[1]}) ~{rate:.1f}s/batch", flush=True)
    print(f"embedding complete in {time.time() - t0:.0f}s")


def stage_index(out: Path) -> None:
    chunks = read_chunks(out)
    cdir = cache_dir(out)
    bs = get_settings().embed_batch_size
    n_batches = (len(chunks) + bs - 1) // bs
    missing = [b for b in range(n_batches) if not (cdir / f"part_{b:05d}.npy").exists()]
    if missing:
        sys.exit(f"{len(missing)} embedding batches missing in {rel(cdir)} — run --stage embed first")
    vecs = np.concatenate([np.load(cdir / f"part_{b:05d}.npy") for b in range(n_batches)]).astype("float32")
    if vecs.shape[0] != len(chunks):
        sys.exit(f"vector count {vecs.shape[0]} != chunk count {len(chunks)} (EMBED_BATCH_SIZE changed?)")
    index = faiss.IndexFlatIP(vecs.shape[1])  # cosine similarity on L2-normalized vectors
    index.add(vecs)
    faiss.write_index(index, str(out / "index.faiss"))
    (out / "manifest.json").write_text(json.dumps({
        "n_chunks": len(chunks), "dim": int(vecs.shape[1]), "embedding": signature(),
        "chunks_sha256_16": chunks_hash(out),
        "chunking": {"chunk_chars": CHUNK_CHARS, "overlap_chars": OVERLAP, "min_page_chars": MIN_PAGE_CHARS},
        "documents": sorted({c["doc_id"] for c in chunks}),
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, indent=1), encoding="utf-8")
    print(f"index: {index.ntotal} vectors, dim {vecs.shape[1]} -> {rel((out / 'index.faiss'))}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", choices=["all", "chunks", "embed", "index"], default="all")
    ap.add_argument("--limit", type=int, default=None, help="only the first N chunks (smoke test)")
    ap.add_argument("--out", default=str(OUT.relative_to(ROOT)), help="output folder, relative to the repo root")
    args = ap.parse_args()
    out = (ROOT / args.out).resolve()
    if args.stage in ("all", "chunks"):
        stage_chunks(out, args.limit)
    if args.stage in ("all", "embed"):
        stage_embed(out)
    if args.stage in ("all", "index"):
        stage_index(out)


if __name__ == "__main__":
    main()
