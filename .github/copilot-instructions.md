# Copilot instructions (GovWork)

## Big picture
- Full-stack MPLADS analytics: FastAPI + SQLite backend in `src/backend/`, React (Vite) frontend in `src/frontend/`.
- Data originates from the MoSPI MPLADS portal, is saved as raw JSON in `data/raw/`, then loaded into SQLite tables (`allocated`, `recommended`, `expenditure`, `completed`). See `docs/ARCHITECTURE.md` and `docs/DATA_ANALYSIS.md`.

## Data pipeline (ETL) conventions
- Fetch raw JSONs with `scripts/fetch_data.py` (POSTs to `mplads.mospi.gov.in`). It embeds cookies in the script; treat this as brittle and update cookies/headers if fetch starts failing.
- Load/replace tables via `scripts/etl_to_db.py` using `pandas.DataFrame.to_sql(if_exists="replace")` and then create indices on `MP_NAME`, `STATE_NAME`, `WORK_RECOMMENDATION_DTL_ID`.
- There are **two** SQLite DB files in the repo: `data/govwork.db` (ETL output) and `src/backend/data/govwork.db` (API runtime DB). The API reads the latter via `src/backend/database.py`; keep them in sync when regenerating data.

## Backend (FastAPI) patterns
- API entrypoint: `src/backend/main.py`.
- DB access is intentionally lightweight: dependency injection yields a SQLAlchemy `Connection` (`get_db_connection()` in `src/backend/database.py`), and endpoints use `sqlalchemy.text()` with raw SQL/CTEs.
- Analytics endpoints that need date grouping do it in Python because SQLite date strings are like `"06-Oct-2025"` (see `/api/analytics/trends`).
- Proof downloads use a proxy endpoint (`/api/proxy/proof/{attach_id}`) that POSTs upstream and Base64-decodes a `URL` field into a PDF stream.

## Frontend (Vite/React) patterns
- Frontend uses TanStack React Query (`useQuery`) and `fetch` directly; query keys are simple arrays like `['mps']`, `['mp', name]`.
- API base URL: most calls use `(import.meta.env.VITE_API_URL || '') + '/api/...'` (see `src/frontend/src/pages/MPList.tsx`).
- Local dev relies on Vite proxy for `/api` -> `http://127.0.0.1:8000` (see `src/frontend/vite.config.ts`), so leaving `VITE_API_URL` empty is fine.

## Common local workflows
- Backend: `pip install -r src/backend/requirements.txt` then run `uvicorn src.backend.main:app --reload --port 8000`.
- Frontend: in `src/frontend/` run `npm install` then `npm run dev`.
- Sanity check backend imports/DB connectivity: `python scripts/check_backend.py`.

## Deployment notes
- Render config is in `render.yaml` and starts the API with `uvicorn src.backend.main:app --host 0.0.0.0 --port $PORT`.
- If hosting frontend separately, ensure `VITE_API_URL` points at the backend origin; also note `MPDetail` currently links proofs via a relative `/api/proxy/...` path.
