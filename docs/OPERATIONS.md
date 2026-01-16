# GovWork Operations (Refresh + Deploy)

This doc explains:
- How **Category Radar** works
- How to **refresh** the dataset and rebuild SQLite
- How to keep the current workflow: **commit the DB file to GitHub**, and the cloud deployment simply **reads that DB**
- Optional: an **admin endpoint** to trigger refresh

## 1) What is “Category Radar”?

Category Radar is an analytics view derived from existing MPLADS tables. It **does not create new tables** and does not require migrations.

It’s backed by these API routes:
- `GET /api/analytics/category-radar`
- `GET /api/analytics/category-radar/drilldown`

What it does:
- Groups spend by `ACTIVITY_NAME` (category)
- Computes metrics like:
  - spend share, MP count, vendor count
  - completion % (completed / recommended)
  - transparency % (proofs / completed)
  - vendor concentration (Top1/Top3 vendor spend share)
  - “lift vs national” when you filter by state
- Generates “flags” using simple heuristics (lift + high spend + low transparency + vendor concentration)

So yes: if you deploy to Google Cloud, it will work **as long as the backend has access to the SQLite DB file**.

## 2) Is SQLite “static”? Will it update tomorrow automatically?

SQLite here is just a **file**.

The backend reads:
- `src/backend/data/govwork.db` (see `src/backend/database.py`)

That means:
- In cloud, it is **as static as the code deployment**.
- If MoSPI data changes tomorrow, your deployed app will **not** automatically update unless you rebuild the DB and redeploy (or you run a refresh inside a persistent server).

## 3) Refreshing data + rebuilding the DB (recommended workflow)

Your current workflow is: **commit DB to GitHub** → deploy code → cloud reads DB.

This is the simplest and most reliable approach (especially for Cloud Run).

### 3.1 Prereqs (Python venv)

From repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r src/backend/requirements.txt
```

### 3.2 One-command refresh

We added an orchestrator script:
- `scripts/refresh_db.py`

It does:
1) fetch raw JSON into `data/raw/` (optional)
2) ETL into `data/govwork.db`
3) copy the DB into `src/backend/data/govwork.db` (the runtime DB used by the API)

Run:

```bash
source .venv/bin/activate
python3 scripts/refresh_db.py --force-fetch
```

Notes:
- Fetching uses **hard-coded cookies/headers** in `scripts/fetch_data.py`. Those can expire; if fetch fails, update the cookie/header block.
- If you want ETL-only (no fetch), you can just run:

```bash
source .venv/bin/activate
python3 scripts/etl_to_db.py
```

### 3.3 Commit the refreshed DB

After refresh, commit the runtime DB:
- `src/backend/data/govwork.db`

That keeps your “no DB commands in cloud” deployment model.

## 4) Local sanity checks (venv)

Backend import + DB connectivity:

```bash
source .venv/bin/activate
python3 scripts/check_backend.py
```

Run backend:

```bash
source .venv/bin/activate
uvicorn src.backend.main:app --reload --port 8000
```

Frontend:

```bash
npm --prefix src/frontend install
npm --prefix src/frontend run dev
```

## 5) Deploying to Google Cloud (keeping DB committed)

### Option A (recommended): Cloud Run (immutable image)

This matches your current workflow perfectly:
- You refresh locally
- Commit `src/backend/data/govwork.db`
- Build + deploy

High-level steps:
1) Refresh + commit DB
2) Deploy backend service

If you want, I can add a Dockerfile for Cloud Run next; that’s the most predictable setup.

Important note:
- Cloud Run filesystem is **ephemeral**. Even if you run a refresh job inside the container, it won’t reliably persist. So treat the DB as part of the build artifact.

### Option B: GCE VM (persistent disk)

If you run the service on a VM:
- You can keep the DB on disk
- You *can* run refresh jobs in-place (cron or admin endpoint)

This is the best option if you truly want “refresh from cloud without rebuild”.

## 6) Admin endpoint to trigger refresh

We added a token-protected endpoint:
- `POST /api/admin/refresh-db`
- `GET /api/admin/refresh-db/{job_id}`

Auth:
- Header: `x-admin-token: <token>`
- Token comes from env var `GOVWORK_ADMIN_TOKEN` (or falls back to `Token221988`).

Example:

```bash
curl -X POST "$API_URL/api/admin/refresh-db?do_fetch=false" \
  -H 'x-admin-token: Token221988'
```

For a full fetch+ETL refresh (more brittle):

```bash
curl -X POST "$API_URL/api/admin/refresh-db?do_fetch=true&force_fetch=true" \
  -H 'x-admin-token: Token221988'
```

Caveats:
- For Cloud Run: refreshed files may not persist across restarts; recommended flow remains “refresh locally → commit DB → redeploy”.
- Fetch step depends on MoSPI cookies; it may fail in server environments.
