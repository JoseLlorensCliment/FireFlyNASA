# Flame Intelligence — common tasks. Requires Python 3.11+ and Node 20+.
PY := .venv/bin/python

.PHONY: setup data data-docs build-data rag rag-smoke api web test check

setup:            ## Create venv, install Python + JS dependencies
	python3 -m venv .venv || uv venv --python 3.12 .venv
	$(PY) -m pip install -r backend/requirements.txt || uv pip install --python $(PY) -r backend/requirements.txt
	cd frontend && npm install

data:             ## Refresh PSI metadata + experimental tables (slow server; idempotent)
	$(PY) pipeline/fetch_psi.py

data-docs:        ## Also download light PDF documents for the AI assistant
	$(PY) pipeline/fetch_psi.py --docs

build-data:       ## Normalize tables and build data/processed/flame.db
	$(PY) pipeline/build_dataset.py

rag:              ## Build the RAG index in resumable stages (chunks -> embed -> index); see RAG_HANDOFF.md
	$(PY) pipeline/build_rag_index.py

rag-smoke:        ## Validate the RAG index and one cited answer
	$(PY) pipeline/rag_smoke_test.py --answer

api:              ## Run the FastAPI backend on :8000
	cd backend && ../$(PY) -m uvicorn app.main:app --reload --port 8000

web:              ## Run the Vite dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

test:             ## Run backend tests
	$(PY) -m pytest -q backend/tests

check: test       ## Tests + frontend type-check
	cd frontend && npx tsc -b --noEmit
