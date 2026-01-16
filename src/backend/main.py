from fastapi import FastAPI, Depends, HTTPException, Response, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.engine import Connection
try:
    # When imported as a package module (e.g., uvicorn src.backend.main:app)
    from .database import get_db_connection
except ImportError:
    # When imported as a plain module (e.g., uvicorn main:app)
    from database import get_db_connection
from typing import List, Optional
import pandas as pd
import requests
import logging
import os
import time
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import uuid4
from pydantic import BaseModel, Field


_refresh_jobs: dict[str, dict] = {}


def _start_refresh_job(
    *,
    job_id: str,
    force_fetch: bool,
    do_fetch: bool,
    data_dir: str,
    db_path: str,
    backend_db_path: str,
) -> None:
    started_at = datetime.now(timezone.utc).isoformat()
    _refresh_jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "started_at": started_at,
        "finished_at": None,
        "error": None,
        "params": {
            "do_fetch": do_fetch,
            "force_fetch": force_fetch,
            "data_dir": data_dir,
            "db_path": db_path,
            "backend_db_path": backend_db_path,
        },
    }

    try:
        # Import here so the API can still boot even if scripts/ deps are missing.
        # NOTE: This requires scripts/ to be importable (scripts/__init__.py exists) and
        # uvicorn to be started from repo root (so repo root is on sys.path).
        from scripts.fetch_data import fetch_data
        from scripts.etl_to_db import load_data

        if do_fetch:
            fetch_data(data_dir=data_dir, force=force_fetch)

        load_data(
            data_dir=data_dir,
            db_path=db_path,
            copy_to_backend=True,
            backend_db_path=backend_db_path,
        )

        _refresh_jobs[job_id]["status"] = "succeeded"
    except Exception as e:
        _refresh_jobs[job_id]["status"] = "failed"
        _refresh_jobs[job_id]["error"] = str(e)
    finally:
        _refresh_jobs[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()


def _parse_portal_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    value = str(value).strip()
    if not value or value.lower() == "nan":
        return None

    # Portal commonly uses '09-Jan-2026', but some rows may have variations.
    for fmt in ("%d-%b-%Y", "%d-%b-%y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except Exception:
            continue
    return None


def _safe_month_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


def _clamp_date_range(dts: list[datetime]) -> list[datetime]:
    # Drop dates that are clearly wrong (far future, far past).
    now = datetime.now()
    out: list[datetime] = []
    for dt in dts:
        if dt.year < 2000:
            continue
        if dt > now:
            continue
        out.append(dt)
    return out


def _month_delta_cutoff(months: int) -> datetime:
    # Approximate month length; good enough for UI slicing.
    return datetime.now() - timedelta(days=int(months) * 31)


def _parse_iso_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).strip())
    except Exception:
        return None


def _dt_in_range(dt: datetime, from_dt: Optional[datetime], to_dt: Optional[datetime]) -> bool:
    if from_dt and dt < from_dt:
        return False
    if to_dt and dt > to_dt:
        return False
    return True

app = FastAPI(title="GovWork API", description="MPLADS Data Analysis API")

logger = logging.getLogger("govwork.request")
if not logger.handlers:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, you can replace "*" with your Cloudflare domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_client_ip(request) -> str:
    # Prefer CDN/proxy headers when behind Cloudflare/Render/etc.
    # Cloudflare: CF-Connecting-IP is the original client IP.
    cf_connecting_ip = request.headers.get("cf-connecting-ip")
    if cf_connecting_ip:
        return cf_connecting_ip.strip()
    # Some setups use True-Client-IP.
    true_client_ip = request.headers.get("true-client-ip")
    if true_client_ip:
        return true_client_ip.strip()

    xff = request.headers.get("x-forwarded-for")
    if xff:
        # Can be a comma-separated chain. The left-most is the original client.
        return xff.split(",")[0].strip()
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _get_country_hint(request: Request) -> Optional[str]:
    # Best-effort country based on common reverse-proxy/CDN headers.
    for header in (
        "cf-ipcountry",
        "cloudfront-viewer-country",
        "x-vercel-ip-country",
        "x-country-code",
        "x-geo-country",
    ):
        val = request.headers.get(header)
        if val:
            val = val.strip()
            if val and val.upper() != "XX":
                return val
    return None


def _suggestions_path() -> Path:
    # Default under backend runtime data folder; can override via env.
    configured = os.getenv("GOVWORK_SUGGESTIONS_PATH")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parent / "data" / "suggestions.jsonl"


def _append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _read_jsonl(path: Path, limit: int) -> list[dict]:
    if not path.exists():
        return []
    items: list[dict] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except Exception:
                continue
    # Return newest first
    items.reverse()
    return items[:limit]


@app.middleware("http")
async def log_requests(request, call_next):
    if os.getenv("GOVWORK_REQUEST_LOGGING", "1") != "1":
        return await call_next(request)

    start = time.perf_counter()
    client_ip = _get_client_ip(request)
    user_agent = request.headers.get("user-agent", "-")
    referer = request.headers.get("referer", "-")

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.exception(
            "request_failed ip=%s method=%s path=%s duration_ms=%.1f ua=%r referer=%r",
            client_ip,
            request.method,
            request.url.path,
            duration_ms,
            user_agent,
            referer,
        )
        raise

    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "request ip=%s method=%s path=%s status=%s duration_ms=%.1f ua=%r referer=%r",
        client_ip,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        user_agent,
        referer,
    )
    return response


class SuggestionIn(BaseModel):
    message: str = Field(..., min_length=3, max_length=2000)
    page: Optional[str] = Field(default=None, max_length=200)
    feature: Optional[str] = Field(default=None, max_length=200)


@app.post("/api/suggestions")
def create_suggestion(payload: SuggestionIn, request: Request):
    # Persist as JSONL for append-only writes.
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": str(uuid4()),
        "created_at": now,
        "message": payload.message.strip(),
        "page": payload.page,
        "feature": payload.feature,
        "meta": {
            "ip": _get_client_ip(request),
            "country": _get_country_hint(request),
            "user_agent": request.headers.get("user-agent"),
            "accept_language": request.headers.get("accept-language"),
            "referer": request.headers.get("referer"),
        },
    }
    _append_jsonl(_suggestions_path(), record)
    logger.info(
        "suggestion_created id=%s ip=%s country=%s",
        record["id"],
        record["meta"]["ip"],
        record["meta"]["country"],
    )
    return {"ok": True, "id": record["id"]}


def _is_admin_request(request: Request) -> bool:
    token = os.getenv("GOVWORK_ADMIN_TOKEN") or "Token221988"
    logger.info(
        "Admin Token source: %s",
        "env" if os.getenv("GOVWORK_ADMIN_TOKEN") else "static default",
    )
    presented = request.headers.get("x-admin-token")
    return presented == token


@app.get("/api/admin/suggestions")
def list_suggestions(request: Request, limit: int = 200):
    if not _is_admin_request(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

    safe_limit = max(1, min(limit, 1000))
    items = _read_jsonl(_suggestions_path(), safe_limit)
    return {"count": len(items), "items": items}


@app.post("/api/admin/refresh-db")
def admin_refresh_db(
    request: Request,
    background: BackgroundTasks,
    do_fetch: bool = False,
    force_fetch: bool = False,
    data_dir: str = "data/raw",
    db_path: str = "data/govwork.db",
    backend_db_path: str = "src/backend/data/govwork.db",
):
    """Trigger a DB refresh job.

    Default behavior is ETL-only (do_fetch=False) so it won't rely on brittle cookies.
    For a full refresh from MoSPI, set do_fetch=true (and optionally force_fetch=true).

    IMPORTANT: On serverless platforms like Cloud Run, the container filesystem is ephemeral.
    This endpoint is best for local/dev or VM deployments with persistent disk.
    """
    if not _is_admin_request(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

    job_id = str(uuid4())
    background.add_task(
        _start_refresh_job,
        job_id=job_id,
        force_fetch=force_fetch,
        do_fetch=do_fetch,
        data_dir=data_dir,
        db_path=db_path,
        backend_db_path=backend_db_path,
    )

    return {
        "ok": True,
        "job_id": job_id,
        "status_url": f"/api/admin/refresh-db/{job_id}",
        "note": "If deployed on Cloud Run, refreshed files may not persist across restarts; recommended workflow is refresh locally, commit DB, rebuild/redeploy.",
    }


@app.get("/api/admin/refresh-db/{job_id}")
def admin_refresh_db_status(job_id: str, request: Request):
    if not _is_admin_request(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    job = _refresh_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/")
def read_root():
    return {"message": "GovWork API is running"}

@app.get("/api/stats")
def get_global_stats(db: Connection = Depends(get_db_connection)):
    """
    Returns global aggregates: Total Allocated, Spent, Works Count, etc.
    """
    try:
        # We use pandas for easy result parsing
        query = text("""
            SELECT 
                (SELECT SUM(ALLOCATED_AMT) FROM allocated) as total_allocated,
                (SELECT SUM(FUND_DISBURSED_AMT) FROM expenditure) as total_spent,
                (SELECT COUNT(*) FROM recommended) as total_works_recommended,
                (SELECT COUNT(*) FROM completed) as total_works_completed
        """)
        result = db.execute(query).fetchone()
        
        return {
            "total_allocated": result[0],
            "total_spent": result[1],
            "total_works_recommended": result[2],
            "total_works_completed": result[3],
            "utilization_percentage": (result[1] / result[0] * 100) if result[0] else 0,
            "completion_percentage": (result[3] / result[2] * 100) if result[2] else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mps")
def get_mps_list(limit: int = 100, sort_by: str = "expenditure", db: Connection = Depends(get_db_connection)):
    """
    Returns list of MPs with aggregated stats.
    Efficiently joins tables to calculate spending and completion rates.
    """
    # Dynamic sorting
    order_clause = "total_spent DESC"
    if sort_by == "completion":
        order_clause = "completion_rate DESC"
    elif sort_by == "transparency":
        order_clause = "transparency_score DESC"
    
    # Complex query to aggregate everything by MP
    # Note: We group by MP_NAME and CONSTITUENCY to handle same names (unlikely but safe)
    # Using Subqueries for aggregations to avoid fan-out explosion on joins
    sql = text(f"""
        WITH rec_stats AS (
            SELECT MP_NAME, COUNT(*) as works_count, SUM(RECOMMENDED_AMOUNT) as rec_amt
            FROM recommended
            GROUP BY MP_NAME
        ),
        exp_stats AS (
            SELECT MP_NAME, SUM(FUND_DISBURSED_AMT) as total_spent
            FROM expenditure
            GROUP BY MP_NAME
        ),
        comp_stats AS (
            SELECT MP_NAME, COUNT(*) as completed_count, COUNT(ATTACH_ID) as proofs_count
            FROM completed
            GROUP BY MP_NAME
        )
        SELECT 
            a.MP_NAME, a.STATE_NAME, a.CONSTITUENCY, a.ALLOCATED_AMT,
            COALESCE(r.works_count, 0) as works_recommended,
            COALESCE(e.total_spent, 0) as total_spent,
            COALESCE(c.completed_count, 0) as works_completed,
            COALESCE(c.proofs_count, 0) as works_with_proof
        FROM allocated a
        LEFT JOIN rec_stats r ON a.MP_NAME = r.MP_NAME
        LEFT JOIN exp_stats e ON a.MP_NAME = e.MP_NAME
        LEFT JOIN comp_stats c ON a.MP_NAME = c.MP_NAME
        ORDER BY {order_clause}
        LIMIT :limit
    """)
    
    try:
        result = db.execute(sql, {"limit": limit}).fetchall()
        
        # Format response
        mps = []
        for row in result:
            allocated = row[3] or 1 # avoid div by zero
            spent = row[5] or 0
            recommended_count = row[4] or 1
            completed_count = row[6] or 0
            proofs_count = row[7] or 0
            
            mps.append({
                "name": row[0],
                "state": row[1],
                "constituency": row[2],
                "allocated": row[3],
                "recommended_count": row[4],
                "spent": spent,
                "completed_count": completed_count,
                "proofs_count": proofs_count,
                "utilization_rate": round((spent / allocated) * 100, 2),
                "completion_rate": round((completed_count / recommended_count) * 100, 2),
                "transparency_score": round((proofs_count / completed_count * 100) if completed_count else 0, 2)
            })
            
        return mps
        
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mps/{mp_name}")
def get_mp_detail(mp_name: str, db: Connection = Depends(get_db_connection)):
    """
    Returns detailed stats for a specific MP, including top works and spending breakdown.
    """
    try:
        # 1. Get Basic Info
        basic_sql = text("""
            SELECT MP_NAME, STATE_NAME, CONSTITUENCY, ALLOCATED_AMT
            FROM allocated 
            WHERE MP_NAME = :mp_name
        """)
        basic = db.execute(basic_sql, {"mp_name": mp_name}).fetchone()
        
        if not basic:
            raise HTTPException(status_code=404, detail="MP not found")

        # 2. Get Works Recommended (Limit to top 50 recent) with Status
        works_sql = text("""
            SELECT 
                r.WORK_DESCRIPTION, 
                r.RECOMMENDED_AMOUNT, 
                r.RECOMMENDATION_DATE, 
                r.WORK_RECOMMENDATION_DTL_ID,
                c.ACTUAL_END_DATE,
                c.ATTACH_ID,
                c.ACTUAL_AMOUNT
            FROM recommended r
            LEFT JOIN completed c ON r.WORK_RECOMMENDATION_DTL_ID = c.WORK_RECOMMENDATION_DTL_ID
            WHERE r.MP_NAME = :mp_name
            ORDER BY r.RECOMMENDATION_DATE DESC
            LIMIT 50
        """)
        works = db.execute(works_sql, {"mp_name": mp_name}).fetchall()
        
        # 3. Get Completed Works stats
        comp_sql = text("""
            SELECT COUNT(*) as total, COUNT(ATTACH_ID) as with_proof
            FROM completed
            WHERE MP_NAME = :mp_name
        """)
        comp_stats = db.execute(comp_sql, {"mp_name": mp_name}).fetchone()

        # 4. Get Spending (Expenditure)
        exp_sql = text("""
            SELECT SUM(FUND_DISBURSED_AMT) 
            FROM expenditure 
            WHERE MP_NAME = :mp_name
        """)
        total_spent = db.execute(exp_sql, {"mp_name": mp_name}).scalar() or 0

        return {
            "info": {
                "name": basic[0],
                "state": basic[1],
                "constituency": basic[2],
                "allocated": basic[3],
            },
            "stats": {
                "spent": total_spent,
                "utilization": (total_spent / basic[3] * 100) if basic[3] else 0,
                "works_completed": comp_stats[0],
                "proofs_uploaded": comp_stats[1],
                "transparency_score": (comp_stats[1] / comp_stats[0] * 100) if comp_stats[0] else 0
            },
            "recent_works": [
                {
                    "description": w[0],
                    "recommended_amount": w[1],
                    "date": w[2],
                    "id": w[3],
                    "status": "Completed" if w[4] else "In Progress",
                    "completed_date": w[4],
                    "attach_id": w[5],
                    "actual_amount": w[6]
                } for w in works
            ]
        }
    except Exception as e:
        print(f"Error fetching details for {mp_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search")
def search_items(q: str, db: Connection = Depends(get_db_connection)):
    """
    Universal search across MPs, Vendors, Constituencies, States, and Work Types.
    Returns typed results that the frontend can route to.
    """
    if len(q) < 2:
        return []

    like_q = f"%{q}%"
    try:
        results: list[dict] = []

        # MPs / Constituencies
        mp_rows = db.execute(
            text(
                """
                SELECT DISTINCT MP_NAME, STATE_NAME, CONSTITUENCY
                FROM allocated
                WHERE LOWER(MP_NAME) LIKE LOWER(:q) OR LOWER(CONSTITUENCY) LIKE LOWER(:q)
                LIMIT 15
                """
            ),
            {"q": like_q},
        ).fetchall()
        for r in mp_rows:
            results.append(
                {
                    "type": "mp",
                    "label": r[0],
                    "mp_name": r[0],
                    "state": r[1],
                    "constituency": r[2],
                }
            )

        # Vendors
        vendor_rows = db.execute(
            text(
                """
                SELECT VENDOR_NAME, COUNT(DISTINCT MP_NAME) as mp_count, SUM(FUND_DISBURSED_AMT) as total_received
                FROM expenditure
                WHERE VENDOR_NAME IS NOT NULL AND LOWER(VENDOR_NAME) LIKE LOWER(:q)
                GROUP BY VENDOR_NAME
                ORDER BY total_received DESC
                LIMIT 10
                """
            ),
            {"q": like_q},
        ).fetchall()
        for r in vendor_rows:
            results.append(
                {
                    "type": "vendor",
                    "label": r[0],
                    "vendor_name": r[0],
                    "mp_count": r[1],
                    "total_received": r[2] or 0,
                }
            )

        # Work types (activity names)
        activity_rows = db.execute(
            text(
                """
                SELECT ACTIVITY_NAME, SUM(FUND_DISBURSED_AMT) as total_spent
                FROM expenditure
                WHERE ACTIVITY_NAME IS NOT NULL AND LOWER(ACTIVITY_NAME) LIKE LOWER(:q)
                GROUP BY ACTIVITY_NAME
                ORDER BY total_spent DESC
                LIMIT 10
                """
            ),
            {"q": like_q},
        ).fetchall()
        for r in activity_rows:
            results.append(
                {
                    "type": "work_type",
                    "label": r[0],
                    "activity": r[0],
                    "total_spent": r[1] or 0,
                }
            )

        # States
        state_rows = db.execute(
            text(
                """
                SELECT STATE_NAME, SUM(FUND_DISBURSED_AMT) as spent
                FROM expenditure
                WHERE STATE_NAME IS NOT NULL AND LOWER(STATE_NAME) LIKE LOWER(:q)
                GROUP BY STATE_NAME
                ORDER BY spent DESC
                LIMIT 8
                """
            ),
            {"q": like_q},
        ).fetchall()
        for r in state_rows:
            results.append(
                {
                    "type": "state",
                    "label": r[0],
                    "state": r[0],
                    "spent": r[1] or 0,
                }
            )

        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/work-types/{activity}")
def get_work_type_insights(activity: str, db: Connection = Depends(get_db_connection)):
    """Work-type drilldown based on ACTIVITY_NAME (spending patterns and who uses it)."""
    try:
        # Top vendors and MPs for this activity
        top_vendors = db.execute(
            text(
                """
                SELECT VENDOR_NAME, SUM(FUND_DISBURSED_AMT) as amount, COUNT(*) as payments
                FROM expenditure
                WHERE ACTIVITY_NAME = :activity
                GROUP BY VENDOR_NAME
                ORDER BY amount DESC
                LIMIT 10
                """
            ),
            {"activity": activity},
        ).fetchall()

        top_mps = db.execute(
            text(
                """
                SELECT MP_NAME, STATE_NAME, CONSTITUENCY, SUM(FUND_DISBURSED_AMT) as amount
                FROM expenditure
                WHERE ACTIVITY_NAME = :activity
                GROUP BY MP_NAME, STATE_NAME, CONSTITUENCY
                ORDER BY amount DESC
                LIMIT 10
                """
            ),
            {"activity": activity},
        ).fetchall()

        # Time series (Python date parse)
        rows = db.execute(
            text(
                """
                SELECT EXPENDITURE_DATE, FUND_DISBURSED_AMT
                FROM expenditure
                WHERE ACTIVITY_NAME = :activity
                """
            ),
            {"activity": activity},
        ).fetchall()
        dts: list[datetime] = []
        amounts: list[float] = []
        for r in rows:
            dt = _parse_portal_date(r[0])
            if dt:
                dts.append(dt)
                amounts.append(float(r[1] or 0))

        dts = _clamp_date_range(dts)
        from collections import defaultdict

        monthly = defaultdict(float)
        for dt, amt in zip(dts, amounts):
            monthly[_safe_month_key(dt)] += amt
        series = [{"month": m, "spent": monthly[m]} for m in sorted(monthly.keys())]

        total_spent = sum(amounts) if amounts else 0
        return {
            "activity": activity,
            "total_spent": total_spent,
            "monthly_spent": series,
            "top_vendors": [
                {"vendor": r[0], "amount": r[1] or 0, "payments": r[2]} for r in top_vendors
            ],
            "top_mps": [
                {"mp": r[0], "state": r[1], "constituency": r[2], "amount": r[3] or 0}
                for r in top_mps
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/vendors/{vendor_name}/insights")
def get_vendor_insights(vendor_name: str, db: Connection = Depends(get_db_connection)):
    """Vendor specialization + money flow over time."""
    try:
        totals = db.execute(
            text(
                """
                SELECT
                    COUNT(*) as payments,
                    COUNT(DISTINCT MP_NAME) as mp_count,
                    COUNT(DISTINCT STATE_NAME) as state_count,
                    SUM(FUND_DISBURSED_AMT) as total_received
                FROM expenditure
                WHERE VENDOR_NAME = :vendor_name
                """
            ),
            {"vendor_name": vendor_name},
        ).fetchone()

        # Work-type mix
        activity_rows = db.execute(
            text(
                """
                SELECT ACTIVITY_NAME, SUM(FUND_DISBURSED_AMT) as amount, COUNT(*) as payments, COUNT(DISTINCT MP_NAME) as mp_count
                FROM expenditure
                WHERE VENDOR_NAME = :vendor_name
                GROUP BY ACTIVITY_NAME
                ORDER BY amount DESC
                LIMIT 6
                """
            ),
            {"vendor_name": vendor_name},
        ).fetchall()

        # MP distribution
        mp_rows = db.execute(
            text(
                """
                SELECT MP_NAME, STATE_NAME, SUM(FUND_DISBURSED_AMT) as amount
                FROM expenditure
                WHERE VENDOR_NAME = :vendor_name
                GROUP BY MP_NAME, STATE_NAME
                ORDER BY amount DESC
                LIMIT 10
                """
            ),
            {"vendor_name": vendor_name},
        ).fetchall()

        # State reach (for “appears across N MPs in same state”)
        state_rows = db.execute(
            text(
                """
                SELECT STATE_NAME, COUNT(DISTINCT MP_NAME) as mp_count, SUM(FUND_DISBURSED_AMT) as amount
                FROM expenditure
                WHERE VENDOR_NAME = :vendor_name
                GROUP BY STATE_NAME
                ORDER BY mp_count DESC, amount DESC
                LIMIT 10
                """
            ),
            {"vendor_name": vendor_name},
        ).fetchall()

        # Time series
        rows = db.execute(
            text(
                """
                SELECT EXPENDITURE_DATE, FUND_DISBURSED_AMT
                FROM expenditure
                WHERE VENDOR_NAME = :vendor_name
                """
            ),
            {"vendor_name": vendor_name},
        ).fetchall()
        parsed: list[tuple[datetime, float]] = []
        for r in rows:
            dt = _parse_portal_date(r[0])
            if dt:
                parsed.append((dt, float(r[1] or 0)))

        parsed = [(dt, amt) for (dt, amt) in parsed if dt.year >= 2000 and dt <= datetime.now()]
        from collections import defaultdict

        monthly = defaultdict(float)
        for dt, amt in parsed:
            monthly[_safe_month_key(dt)] += amt
        monthly_series = [{"month": m, "amount": monthly[m]} for m in sorted(monthly.keys())]

        total_received = totals[3] or 0
        top_activity_total = sum([r[1] or 0 for r in activity_rows])
        top3_share = 0.0
        if total_received:
            top3_share = (
                sum([(activity_rows[i][1] or 0) for i in range(min(3, len(activity_rows)))])
                / total_received
                * 100
            )

        return {
            "name": vendor_name,
            "summary": {
                "payments": totals[0] or 0,
                "mp_count": totals[1] or 0,
                "state_count": totals[2] or 0,
                "total_received": total_received,
                "top_activity_share_pct": (top_activity_total / total_received * 100) if total_received else 0,
                "top3_activity_share_pct": top3_share,
            },
            "top_work_types": [
                {
                    "activity": r[0],
                    "amount": r[1] or 0,
                    "payments": r[2],
                    "mp_count": r[3],
                    "share_pct": (r[1] / total_received * 100) if total_received else 0,
                }
                for r in activity_rows
            ],
            "monthly_received": monthly_series,
            "top_mps": [
                {
                    "mp": r[0],
                    "state": r[1],
                    "amount": r[2] or 0,
                }
                for r in mp_rows
            ],
            "top_states": [
                {
                    "state": r[0],
                    "mp_count": r[1],
                    "amount": r[2] or 0,
                }
                for r in state_rows
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/mps/{mp_name}/insights")
def get_mp_insights(mp_name: str, db: Connection = Depends(get_db_connection)):
    """MP behavior profile: concentration, vendor preferences, work-type mix, trends, and signals."""
    try:
        # Basic info / allocation
        basic = db.execute(
            text(
                """
                SELECT MP_NAME, STATE_NAME, CONSTITUENCY, ALLOCATED_AMT
                FROM allocated
                WHERE MP_NAME = :mp_name
                """
            ),
            {"mp_name": mp_name},
        ).fetchone()
        if not basic:
            raise HTTPException(status_code=404, detail="MP not found")

        # Totals
        total_spent = (
            db.execute(
                text("SELECT SUM(FUND_DISBURSED_AMT) FROM expenditure WHERE MP_NAME = :mp_name"),
                {"mp_name": mp_name},
            ).scalar()
            or 0
        )

        rec_stats = db.execute(
            text(
                """
                SELECT COUNT(*) as works, SUM(RECOMMENDED_AMOUNT) as amount
                FROM recommended
                WHERE MP_NAME = :mp_name
                """
            ),
            {"mp_name": mp_name},
        ).fetchone()
        comp_stats = db.execute(
            text(
                """
                SELECT COUNT(*) as works, COUNT(ATTACH_ID) as proofs, SUM(ACTUAL_AMOUNT) as amount
                FROM completed
                WHERE MP_NAME = :mp_name
                """
            ),
            {"mp_name": mp_name},
        ).fetchone()

        recommended_works = rec_stats[0] or 0
        completed_works = comp_stats[0] or 0
        proofs = comp_stats[1] or 0

        # Top vendors + concentration
        vendor_rows = db.execute(
            text(
                """
                SELECT VENDOR_NAME, SUM(FUND_DISBURSED_AMT) as amount, COUNT(*) as payments
                FROM expenditure
                WHERE MP_NAME = :mp_name
                GROUP BY VENDOR_NAME
                ORDER BY amount DESC
                LIMIT 10
                """
            ),
            {"mp_name": mp_name},
        ).fetchall()
        top3_vendor_share = 0.0
        if total_spent:
            top3_vendor_share = (
                sum([(vendor_rows[i][1] or 0) for i in range(min(3, len(vendor_rows)))])
                / total_spent
                * 100
            )

        # Work-type mix (spend)
        activity_spend_rows = db.execute(
            text(
                """
                SELECT ACTIVITY_NAME, SUM(FUND_DISBURSED_AMT) as amount
                FROM expenditure
                WHERE MP_NAME = :mp_name
                GROUP BY ACTIVITY_NAME
                ORDER BY amount DESC
                LIMIT 8
                """
            ),
            {"mp_name": mp_name},
        ).fetchall()

        # Work-type mix (completed)
        activity_completed_rows = db.execute(
            text(
                """
                SELECT ACTIVITY_NAME, SUM(ACTUAL_AMOUNT) as amount
                FROM completed
                WHERE MP_NAME = :mp_name
                GROUP BY ACTIVITY_NAME
                ORDER BY amount DESC
                LIMIT 8
                """
            ),
            {"mp_name": mp_name},
        ).fetchall()

        # Time series (spending)
        exp_rows = db.execute(
            text(
                """
                SELECT EXPENDITURE_DATE, FUND_DISBURSED_AMT
                FROM expenditure
                WHERE MP_NAME = :mp_name
                """
            ),
            {"mp_name": mp_name},
        ).fetchall()
        parsed: list[tuple[datetime, float]] = []
        for r in exp_rows:
            dt = _parse_portal_date(r[0])
            if dt:
                parsed.append((dt, float(r[1] or 0)))
        parsed = [(dt, amt) for (dt, amt) in parsed if dt.year >= 2000 and dt <= datetime.now()]
        from collections import defaultdict

        monthly = defaultdict(float)
        for dt, amt in parsed:
            monthly[_safe_month_key(dt)] += amt
        spending_series = [{"month": m, "spent": monthly[m]} for m in sorted(monthly.keys())]

        # Spend without proof (completed but no proof uploaded)
        spend_no_proof = (
            db.execute(
                text(
                    """
                    SELECT SUM(e.FUND_DISBURSED_AMT)
                    FROM expenditure e
                    JOIN completed c ON e.WORK_RECOMMENDATION_DTL_ID = c.WORK_RECOMMENDATION_DTL_ID
                    WHERE e.MP_NAME = :mp_name AND (c.ATTACH_ID IS NULL OR c.ATTACH_ID = '')
                    """
                ),
                {"mp_name": mp_name},
            ).scalar()
            or 0
        )

        utilization_rate = (total_spent / (basic[3] or 1) * 100) if (basic[3] or 0) else 0
        completion_rate = (completed_works / recommended_works * 100) if recommended_works else 0
        transparency_score = (proofs / completed_works * 100) if completed_works else 0

        # National averages for “above/below average” signals
        avg_row = db.execute(
            text(
                """
                WITH rec AS (
                    SELECT MP_NAME, COUNT(*) as rec_count
                    FROM recommended
                    GROUP BY MP_NAME
                ),
                exp AS (
                    SELECT MP_NAME, SUM(FUND_DISBURSED_AMT) as spent
                    FROM expenditure
                    GROUP BY MP_NAME
                ),
                comp AS (
                    SELECT MP_NAME, COUNT(*) as comp_count, COUNT(ATTACH_ID) as proofs
                    FROM completed
                    GROUP BY MP_NAME
                )
                SELECT
                    AVG(CASE WHEN a.ALLOCATED_AMT > 0 THEN COALESCE(e.spent, 0) / a.ALLOCATED_AMT * 100 ELSE NULL END) as avg_util,
                    AVG(CASE WHEN COALESCE(r.rec_count, 0) > 0 THEN COALESCE(c.comp_count, 0) * 1.0 / r.rec_count * 100 ELSE NULL END) as avg_comp,
                    AVG(CASE WHEN COALESCE(c.comp_count, 0) > 0 THEN COALESCE(c.proofs, 0) * 1.0 / c.comp_count * 100 ELSE NULL END) as avg_trans
                FROM allocated a
                LEFT JOIN rec r ON a.MP_NAME = r.MP_NAME
                LEFT JOIN exp e ON a.MP_NAME = e.MP_NAME
                LEFT JOIN comp c ON a.MP_NAME = c.MP_NAME
                """
            )
        ).fetchone()
        avg_util = float(avg_row[0] or 0)
        avg_comp = float(avg_row[1] or 0)
        avg_trans = float(avg_row[2] or 0)

        signals: list[dict] = []
        if top3_vendor_share >= 70 and total_spent > 0:
            signals.append(
                {
                    "code": "vendor_concentration",
                    "title": "Vendor concentration is high",
                    "detail": f"Top 3 vendors account for {top3_vendor_share:.1f}% of total spend.",
                    "severity": "warning" if top3_vendor_share < 85 else "high",
                }
            )
        if utilization_rate >= avg_util and completion_rate <= avg_comp and total_spent > 0:
            signals.append(
                {
                    "code": "spend_vs_completion",
                    "title": "Spending is above average but completion is below average",
                    "detail": f"Utilization {utilization_rate:.1f}% vs avg {avg_util:.1f}%, completion {completion_rate:.1f}% vs avg {avg_comp:.1f}%.",
                    "severity": "warning",
                }
            )
        if transparency_score <= avg_trans and completed_works > 10:
            signals.append(
                {
                    "code": "low_transparency",
                    "title": "Proof uploads are below average",
                    "detail": f"Transparency {transparency_score:.1f}% vs avg {avg_trans:.1f}%.",
                    "severity": "warning" if transparency_score > 20 else "high",
                }
            )
        if spend_no_proof > 0 and total_spent > 0:
            ratio = spend_no_proof / total_spent * 100
            if ratio >= 10:
                signals.append(
                    {
                        "code": "spend_without_proof",
                        "title": "Spend on completed works without proof",
                        "detail": f"₹{spend_no_proof:,.0f} (~{ratio:.1f}%) spent on completed works with no proof uploaded.",
                        "severity": "warning" if ratio < 30 else "high",
                    }
                )

        return {
            "info": {
                "name": basic[0],
                "state": basic[1],
                "constituency": basic[2],
                "allocated": basic[3],
            },
            "stats": {
                "spent": total_spent,
                "utilization_rate": utilization_rate,
                "recommended_works": recommended_works,
                "completed_works": completed_works,
                "completion_rate": completion_rate,
                "proofs": proofs,
                "transparency_score": transparency_score,
                "recommended_amount": rec_stats[1] or 0,
                "completed_amount": comp_stats[2] or 0,
            },
            "top_vendors": [
                {
                    "vendor": r[0],
                    "amount": r[1] or 0,
                    "payments": r[2],
                    "share_pct": (r[1] / total_spent * 100) if total_spent else 0,
                }
                for r in vendor_rows
            ],
            "vendor_concentration_top3_pct": top3_vendor_share,
            "top_work_types_by_spend": [
                {
                    "activity": r[0],
                    "amount": r[1] or 0,
                    "share_pct": (r[1] / total_spent * 100) if total_spent else 0,
                }
                for r in activity_spend_rows
            ],
            "top_work_types_by_completed": [
                {
                    "activity": r[0],
                    "amount": r[1] or 0,
                }
                for r in activity_completed_rows
            ],
            "spending_trend": spending_series,
            "signals": signals,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/bias")
def get_bias_rankings(state: Optional[str] = None, db: Connection = Depends(get_db_connection)):
    """Rankings to surface suspicious / noteworthy patterns."""
    try:
        # Vendor concentration per MP (top 3 vendor share)
        rows = db.execute(
            text(
                """
                WITH vendor_spend AS (
                    SELECT MP_NAME, VENDOR_NAME, SUM(FUND_DISBURSED_AMT) as amt
                    FROM expenditure
                    WHERE (:state IS NULL OR STATE_NAME = :state)
                    GROUP BY MP_NAME, VENDOR_NAME
                ),
                ranked AS (
                    SELECT
                        MP_NAME,
                        amt,
                        ROW_NUMBER() OVER (PARTITION BY MP_NAME ORDER BY amt DESC) as rn
                    FROM vendor_spend
                ),
                totals AS (
                    SELECT MP_NAME, SUM(amt) as total_spent
                    FROM vendor_spend
                    GROUP BY MP_NAME
                )
                SELECT
                    t.MP_NAME,
                    t.total_spent,
                    SUM(CASE WHEN r.rn <= 3 THEN r.amt ELSE 0 END) as top3,
                    (SUM(CASE WHEN r.rn <= 3 THEN r.amt ELSE 0 END) * 100.0 / NULLIF(t.total_spent, 0)) as top3_pct
                FROM totals t
                JOIN ranked r ON r.MP_NAME = t.MP_NAME
                GROUP BY t.MP_NAME, t.total_spent
                HAVING t.total_spent > 0
                ORDER BY top3_pct DESC, t.total_spent DESC
                LIMIT 15
                """
            ),
            {"state": state},
        ).fetchall()
        concentration = [
            {
                "mp": r[0],
                "total_spent": r[1] or 0,
                "top3_spent": r[2] or 0,
                "top3_pct": float(r[3] or 0),
            }
            for r in rows
        ]

        # Spend on completed works without proof (ratio)
        no_proof_rows = db.execute(
            text(
                """
                WITH spent AS (
                    SELECT MP_NAME, SUM(FUND_DISBURSED_AMT) as total_spent
                    FROM expenditure
                    WHERE (:state IS NULL OR STATE_NAME = :state)
                    GROUP BY MP_NAME
                ),
                no_proof AS (
                    SELECT e.MP_NAME, SUM(e.FUND_DISBURSED_AMT) as no_proof_spent
                    FROM expenditure e
                    JOIN completed c ON e.WORK_RECOMMENDATION_DTL_ID = c.WORK_RECOMMENDATION_DTL_ID
                                        WHERE (:state IS NULL OR e.STATE_NAME = :state)
                                            AND (c.ATTACH_ID IS NULL OR c.ATTACH_ID = '')
                    GROUP BY e.MP_NAME
                )
                SELECT
                    s.MP_NAME,
                    s.total_spent,
                    COALESCE(n.no_proof_spent, 0) as no_proof_spent,
                    (COALESCE(n.no_proof_spent, 0) * 100.0 / NULLIF(s.total_spent, 0)) as no_proof_pct
                FROM spent s
                LEFT JOIN no_proof n ON n.MP_NAME = s.MP_NAME
                WHERE s.total_spent > 0
                ORDER BY no_proof_pct DESC, no_proof_spent DESC
                LIMIT 15
                """
            ),
            {"state": state},
        ).fetchall()
        spend_without_proof = [
            {
                "mp": r[0],
                "total_spent": r[1] or 0,
                "no_proof_spent": r[2] or 0,
                "no_proof_pct": float(r[3] or 0),
            }
            for r in no_proof_rows
        ]

        return {
            "vendor_concentration": concentration,
            "spend_without_proof": spend_without_proof,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/category-radar")
def get_category_radar(
    state: Optional[str] = None,
    mp: Optional[str] = None,
    vendor: Optional[str] = None,
    months: Optional[int] = 12,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 50,
    db: Connection = Depends(get_db_connection),
):
    """Category-level patterns + anomaly flags (ACTIVITY_NAME)."""
    try:
        from_dt = _parse_iso_date(from_date)
        to_dt = _parse_iso_date(to_date)
        if months is not None and months > 0:
            cutoff = _month_delta_cutoff(months)
            from_dt = max([d for d in [from_dt, cutoff] if d is not None], default=cutoff)

        # Fetch expenditure rows for filtered scope (Python filtering for dates)
        where = []
        params: dict = {}
        if state:
            where.append("STATE_NAME = :state")
            params["state"] = state
        if mp:
            where.append("MP_NAME = :mp")
            params["mp"] = mp
        if vendor:
            where.append("VENDOR_NAME = :vendor")
            params["vendor"] = vendor
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""

        exp_rows = db.execute(
            text(
                f"""
                SELECT ACTIVITY_NAME, FUND_DISBURSED_AMT, EXPENDITURE_DATE, MP_NAME, VENDOR_NAME, WORK_RECOMMENDATION_DTL_ID
                FROM expenditure
                {where_sql}
                """
            ),
            params,
        ).fetchall()

        # Aggregate spend
        cats: dict[str, dict] = {}
        total_spend = 0.0
        all_mps: set[str] = set()

        for r in exp_rows:
            activity = r[0] or "(Unknown)"
            amt = float(r[1] or 0)
            dt = _parse_portal_date(r[2])
            if dt and not _dt_in_range(dt, from_dt, to_dt):
                continue
            mp_name = r[3] or ""
            vendor_name = r[4] or ""

            total_spend += amt
            if mp_name:
                all_mps.add(mp_name)

            c = cats.get(activity)
            if not c:
                c = {
                    "activity": activity,
                    "spent": 0.0,
                    "mps": set(),
                    "vendors": set(),
                    "vendor_spend": {},
                }
                cats[activity] = c
            c["spent"] += amt
            if mp_name:
                c["mps"].add(mp_name)
            if vendor_name:
                c["vendors"].add(vendor_name)
                c["vendor_spend"][vendor_name] = c["vendor_spend"].get(vendor_name, 0.0) + amt

        # Recommended + completed metrics (by ACTIVITY_NAME)
        rec_where = []
        rec_params: dict = {}
        if state:
            rec_where.append("STATE_NAME = :state")
            rec_params["state"] = state
        if mp:
            rec_where.append("MP_NAME = :mp")
            rec_params["mp"] = mp
        rec_where_sql = ("WHERE " + " AND ".join(rec_where)) if rec_where else ""
        rec_rows = db.execute(
            text(
                f"""
                SELECT ACTIVITY_NAME, RECOMMENDATION_DATE
                FROM recommended
                {rec_where_sql}
                """
            ),
            rec_params,
        ).fetchall()
        rec_counts: dict[str, int] = {}
        for r in rec_rows:
            activity = r[0] or "(Unknown)"
            dt = _parse_portal_date(r[1])
            if dt and not _dt_in_range(dt, from_dt, to_dt):
                continue
            rec_counts[activity] = rec_counts.get(activity, 0) + 1

        comp_where = []
        comp_params: dict = {}
        if state:
            comp_where.append("STATE_NAME = :state")
            comp_params["state"] = state
        if mp:
            comp_where.append("MP_NAME = :mp")
            comp_params["mp"] = mp
        comp_where_sql = ("WHERE " + " AND ".join(comp_where)) if comp_where else ""
        comp_rows = db.execute(
            text(
                f"""
                SELECT ACTIVITY_NAME, ACTUAL_END_DATE, ATTACH_ID
                FROM completed
                {comp_where_sql}
                """
            ),
            comp_params,
        ).fetchall()
        comp_counts: dict[str, int] = {}
        proof_counts: dict[str, int] = {}
        for r in comp_rows:
            activity = r[0] or "(Unknown)"
            dt = _parse_portal_date(r[1])
            if dt and not _dt_in_range(dt, from_dt, to_dt):
                continue
            comp_counts[activity] = comp_counts.get(activity, 0) + 1
            attach_id = r[2]
            if attach_id is not None and str(attach_id).strip() != "":
                proof_counts[activity] = proof_counts.get(activity, 0) + 1

        # National baseline (for lift): only meaningful when state filter is set AND no mp/vendor filters
        baseline = None
        if state and not mp and not vendor:
            base_rows = db.execute(
                text(
                    """
                    SELECT ACTIVITY_NAME, FUND_DISBURSED_AMT, EXPENDITURE_DATE
                    FROM expenditure
                    """
                )
            ).fetchall()
            base_spend: dict[str, float] = {}
            base_total = 0.0
            for r in base_rows:
                activity = r[0] or "(Unknown)"
                amt = float(r[1] or 0)
                dt = _parse_portal_date(r[2])
                if dt and not _dt_in_range(dt, from_dt, to_dt):
                    continue
                base_total += amt
                base_spend[activity] = base_spend.get(activity, 0.0) + amt
            baseline = {"total_spent": base_total, "by_activity": base_spend}

        categories: list[dict] = []
        for activity, c in cats.items():
            spent = float(c["spent"])
            share = (spent / total_spend * 100) if total_spend else 0.0

            vendors = c["vendor_spend"]
            top_vendors = sorted(vendors.items(), key=lambda kv: kv[1], reverse=True)
            top1 = top_vendors[0][1] if top_vendors else 0.0
            top3 = sum([kv[1] for kv in top_vendors[:3]]) if top_vendors else 0.0
            top1_pct = (top1 / spent * 100) if spent else 0.0
            top3_pct = (top3 / spent * 100) if spent else 0.0

            rec = rec_counts.get(activity, 0)
            comp = comp_counts.get(activity, 0)
            proofs = proof_counts.get(activity, 0)

            completion_pct = (comp / rec * 100) if rec else 0.0
            transparency_pct = (proofs / comp * 100) if comp else 0.0

            lift = None
            if baseline and baseline["total_spent"]:
                nat_spent = baseline["by_activity"].get(activity, 0.0)
                nat_share = nat_spent / baseline["total_spent"] if baseline["total_spent"] else 0.0
                state_share = spent / total_spend if total_spend else 0.0
                if nat_share > 0:
                    lift = state_share / nat_share

            categories.append(
                {
                    "activity": activity,
                    "spent": spent,
                    "share_pct": share,
                    "mp_count": len(c["mps"]),
                    "vendor_count": len(c["vendors"]),
                    "recommended_works": rec,
                    "completed_works": comp,
                    "completion_pct": completion_pct,
                    "proofs": proofs,
                    "transparency_pct": transparency_pct,
                    "top1_vendor_pct": top1_pct,
                    "top3_vendor_pct": top3_pct,
                    "lift_vs_national": lift,
                }
            )

        categories.sort(key=lambda x: x["spent"], reverse=True)
        categories = categories[: max(1, min(int(limit), 200))]

        # Flags (heuristics)
        flags: list[dict] = []
        mp_total = max(1, len(all_mps))
        for c in categories:
            spent = c["spent"]
            mp_cov = c["mp_count"] / mp_total * 100
            if c["lift_vs_national"] is not None and c["lift_vs_national"] >= 2.0 and spent >= 2e7 and c["mp_count"] >= 5:
                flags.append(
                    {
                        "code": "state_lift",
                        "severity": "high" if c["lift_vs_national"] >= 3.0 else "warning",
                        "activity": c["activity"],
                        "title": "Category over-indexes in this state",
                        "detail": f"Share is {c['share_pct']:.1f}% with lift {c['lift_vs_national']:.1f}× vs national; used by {mp_cov:.1f}% of MPs in selection.",
                    }
                )
            if spent >= 2e7 and c["completed_works"] >= 10 and c["transparency_pct"] <= 30:
                flags.append(
                    {
                        "code": "high_spend_low_transparency",
                        "severity": "high" if c["transparency_pct"] <= 15 else "warning",
                        "activity": c["activity"],
                        "title": "High spend, low transparency",
                        "detail": f"₹{spent:,.0f} spent with transparency {c['transparency_pct']:.1f}%.",
                    }
                )
            if spent >= 2e7 and c["top3_vendor_pct"] >= 70 and c["vendor_count"] >= 3:
                flags.append(
                    {
                        "code": "vendor_concentration",
                        "severity": "high" if c["top3_vendor_pct"] >= 85 else "warning",
                        "activity": c["activity"],
                        "title": "Vendor concentration is high",
                        "detail": f"Top 3 vendors take {c['top3_vendor_pct']:.1f}% of category spend.",
                    }
                )

        return {
            "filters": {
                "state": state,
                "mp": mp,
                "vendor": vendor,
                "months": months,
                "from_date": from_date,
                "to_date": to_date,
            },
            "totals": {"total_spent": total_spend, "mp_count": len(all_mps)},
            "categories": categories,
            "flags": flags,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/category-radar/drilldown")
def get_category_radar_drilldown(
    activity: str,
    state: Optional[str] = None,
    mp: Optional[str] = None,
    vendor: Optional[str] = None,
    months: Optional[int] = 12,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Connection = Depends(get_db_connection),
):
    """Drilldown for a single category within filters."""
    try:
        from_dt = _parse_iso_date(from_date)
        to_dt = _parse_iso_date(to_date)
        if months is not None and months > 0:
            cutoff = _month_delta_cutoff(months)
            from_dt = max([d for d in [from_dt, cutoff] if d is not None], default=cutoff)

        where = ["ACTIVITY_NAME = :activity"]
        params: dict = {"activity": activity}
        if state:
            where.append("STATE_NAME = :state")
            params["state"] = state
        if mp:
            where.append("MP_NAME = :mp")
            params["mp"] = mp
        if vendor:
            where.append("VENDOR_NAME = :vendor")
            params["vendor"] = vendor
        where_sql = "WHERE " + " AND ".join(where)

        exp_rows = db.execute(
            text(
                f"""
                SELECT MP_NAME, VENDOR_NAME, FUND_DISBURSED_AMT, EXPENDITURE_DATE
                FROM expenditure
                {where_sql}
                """
            ),
            params,
        ).fetchall()

        from collections import defaultdict

        total_spent = 0.0
        mp_spend = defaultdict(float)
        vendor_spend = defaultdict(float)
        monthly = defaultdict(float)
        for r in exp_rows:
            mp_name = r[0] or ""
            vendor_name = r[1] or ""
            amt = float(r[2] or 0)
            dt = _parse_portal_date(r[3])
            if dt and not _dt_in_range(dt, from_dt, to_dt):
                continue
            total_spent += amt
            if mp_name:
                mp_spend[mp_name] += amt
            if vendor_name:
                vendor_spend[vendor_name] += amt
            if dt:
                monthly[_safe_month_key(dt)] += amt

        top_mps = [
            {"mp": k, "spent": v}
            for (k, v) in sorted(mp_spend.items(), key=lambda kv: kv[1], reverse=True)[:15]
        ]
        top_vendors = [
            {"vendor": k, "spent": v}
            for (k, v) in sorted(vendor_spend.items(), key=lambda kv: kv[1], reverse=True)[:15]
        ]
        monthly_spent = [{"month": m, "spent": monthly[m]} for m in sorted(monthly.keys())]

        # Completion + transparency within scope from completed/recommended
        rec_where = ["ACTIVITY_NAME = :activity"]
        rec_params = {"activity": activity}
        if state:
            rec_where.append("STATE_NAME = :state")
            rec_params["state"] = state
        if mp:
            rec_where.append("MP_NAME = :mp")
            rec_params["mp"] = mp
        rec_rows = db.execute(
            text(
                f"SELECT RECOMMENDATION_DATE FROM recommended WHERE {' AND '.join(rec_where)}"
            ),
            rec_params,
        ).fetchall()
        rec_count = 0
        for r in rec_rows:
            dt = _parse_portal_date(r[0])
            if dt and not _dt_in_range(dt, from_dt, to_dt):
                continue
            rec_count += 1

        comp_where = ["ACTIVITY_NAME = :activity"]
        comp_params = {"activity": activity}
        if state:
            comp_where.append("STATE_NAME = :state")
            comp_params["state"] = state
        if mp:
            comp_where.append("MP_NAME = :mp")
            comp_params["mp"] = mp
        comp_rows = db.execute(
            text(
                f"SELECT ACTUAL_END_DATE, ATTACH_ID FROM completed WHERE {' AND '.join(comp_where)}"
            ),
            comp_params,
        ).fetchall()
        comp_count = 0
        proof_count = 0
        for r in comp_rows:
            dt = _parse_portal_date(r[0])
            if dt and not _dt_in_range(dt, from_dt, to_dt):
                continue
            comp_count += 1
            attach_id = r[1]
            if attach_id is not None and str(attach_id).strip() != "":
                proof_count += 1

        completion_pct = (comp_count / rec_count * 100) if rec_count else 0.0
        transparency_pct = (proof_count / comp_count * 100) if comp_count else 0.0

        return {
            "activity": activity,
            "filters": {"state": state, "mp": mp, "vendor": vendor, "months": months, "from_date": from_date, "to_date": to_date},
            "summary": {
                "spent": total_spent,
                "recommended_works": rec_count,
                "completed_works": comp_count,
                "completion_pct": completion_pct,
                "proofs": proof_count,
                "transparency_pct": transparency_pct,
            },
            "monthly_spent": monthly_spent,
            "top_mps": top_mps,
            "top_vendors": top_vendors,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vendors")
def get_top_vendors(state: Optional[str] = None, limit: int = 50, db: Connection = Depends(get_db_connection)):
    """
    Returns top vendors by total amount received.
    """
    sql = text("""
        SELECT VENDOR_NAME, COUNT(DISTINCT MP_NAME) as mp_count, SUM(FUND_DISBURSED_AMT) as total_received
        FROM expenditure
        WHERE (:state IS NULL OR STATE_NAME = :state)
        GROUP BY VENDOR_NAME
        ORDER BY total_received DESC
        LIMIT :limit
    """)
    try:
        results = db.execute(sql, {"limit": limit, "state": state}).fetchall()
        return [
            {
                "name": r[0],
                "mp_count": r[1],
                "total_received": r[2]
            } for r in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vendors/{vendor_name}")
def get_vendor_details(vendor_name: str, db: Connection = Depends(get_db_connection)):
    """
    Returns detailed work history for a specific vendor.
    """
    try:
        sql = text("""
            SELECT 
                MP_NAME, 
                ACTIVITY_NAME, 
                FUND_DISBURSED_AMT, 
                EXPENDITURE_DATE, 
                STATE_NAME
            FROM expenditure
            WHERE VENDOR_NAME = :vendor_name
            ORDER BY EXPENDITURE_DATE DESC
            LIMIT 100
        """)
        results = db.execute(sql, {"vendor_name": vendor_name}).fetchall()
        
        return {
            "name": vendor_name,
            "works": [
                {
                    "mp_name": r[0],
                    "activity": r[1],
                    "amount": r[2],
                    "date": r[3],
                    "state": r[4]
                } for r in results
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/top-bottom")
def get_top_bottom_analytics(state: Optional[str] = None, db: Connection = Depends(get_db_connection)):
    """
    Returns lists for 'Heroes & Zeroes': Top Spenders, Low Spenders, High Transparency, etc.
    """
    try:
        # Common CTE for MP stats
        cte = """
        WITH mp_stats AS (
            SELECT 
                a.MP_NAME, 
                a.STATE_NAME,
                a.CONSTITUENCY,
                MAX(a.ALLOCATED_AMT) as allocated,
                COALESCE(SUM(e.FUND_DISBURSED_AMT), 0) as spent,
                (SELECT COUNT(*) FROM completed c WHERE c.MP_NAME = a.MP_NAME AND c.STATE_NAME = a.STATE_NAME) as completed_works,
                (SELECT COUNT(ATTACH_ID) FROM completed c WHERE c.MP_NAME = a.MP_NAME AND c.STATE_NAME = a.STATE_NAME) as proofs
            FROM allocated a
            LEFT JOIN expenditure e ON a.MP_NAME = e.MP_NAME AND e.STATE_NAME = a.STATE_NAME
            WHERE (:state IS NULL OR a.STATE_NAME = :state)
            GROUP BY a.MP_NAME
        )
        """
        
        # Top 10 Spenders
        top_spenders = db.execute(text(cte + "SELECT * FROM mp_stats ORDER BY spent DESC LIMIT 10"), {"state": state}).fetchall()
        
        # Bottom 10 Spenders (who have at least some allocation)
        zero_spenders = db.execute(text(cte + "SELECT * FROM mp_stats WHERE allocated > 0 ORDER BY spent ASC LIMIT 10"), {"state": state}).fetchall()
        
        # Top Transparency (Most proofs uploaded)
        top_transparent = db.execute(text(cte + "SELECT * FROM mp_stats ORDER BY proofs DESC LIMIT 10"), {"state": state}).fetchall()

        def fmt(rows):
            return [{
                "name": r[0], "state": r[1], "constituency": r[2], 
                "allocated": r[3], "spent": r[4], 
                "completed": r[5], "proofs": r[6],
                "utilization": (r[4]/r[3]*100) if r[3] else 0
            } for r in rows]

        return {
            "top_spenders": fmt(top_spenders),
            "zero_spenders": fmt(zero_spenders),
            "top_transparent": fmt(top_transparent)
        }
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/states")
def get_state_analytics(db: Connection = Depends(get_db_connection)):
    """
    Returns aggregated stats by State.
    """
    sql = text("""
        SELECT 
            a.STATE_NAME,
            SUM(a.ALLOCATED_AMT) as total_allocated,
            (SELECT SUM(FUND_DISBURSED_AMT) FROM expenditure e WHERE e.STATE_NAME = a.STATE_NAME) as total_spent,
            (SELECT COUNT(*) FROM recommended r WHERE r.STATE_NAME = a.STATE_NAME) as works_recommended,
            (SELECT COUNT(*) FROM completed c WHERE c.STATE_NAME = a.STATE_NAME) as works_completed
        FROM allocated a
        GROUP BY a.STATE_NAME
        ORDER BY total_allocated DESC
    """)
    try:
        results = db.execute(sql).fetchall()
        return [
            {
                "state": r[0],
                "allocated": r[1],
                "spent": r[2] or 0,
                "works_recommended": r[3] or 0,
                "works_completed": r[4] or 0,
                "utilization": ((r[2] or 0) / r[1] * 100) if r[1] else 0
            } for r in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/trends")
def get_trends(db: Connection = Depends(get_db_connection), months: int = 12, state: Optional[str] = None):
    """
    Returns monthly trends for spending and work completion.
    """
    # Note: Portal dates are strings (usually 'DD-Mon-YYYY').
    # We parse in Python to avoid SQLite date-extension complexity.
    
    try:
        # Fetch all expenditure dates and amounts
        exp_sql = text("SELECT EXPENDITURE_DATE, FUND_DISBURSED_AMT FROM expenditure WHERE (:state IS NULL OR STATE_NAME = :state)")
        exp_data = db.execute(exp_sql, {"state": state}).fetchall()
        
        # Fetch all completion dates
        comp_sql = text("SELECT ACTUAL_END_DATE FROM completed WHERE (:state IS NULL OR STATE_NAME = :state)")
        comp_data = db.execute(comp_sql, {"state": state}).fetchall()
        
        from collections import defaultdict

        monthly_spend = defaultdict(float)
        monthly_complete = defaultdict(int)

        now = datetime.now()

        for row in exp_data:
            dt = _parse_portal_date(row[0])
            if not dt or dt.year < 2000 or dt > now:
                continue
            monthly_spend[_safe_month_key(dt)] += float(row[1] or 0)

        for row in comp_data:
            dt = _parse_portal_date(row[0])
            if not dt or dt.year < 2000 or dt > now:
                continue
            monthly_complete[_safe_month_key(dt)] += 1

        all_months = sorted(set(monthly_spend.keys()) | set(monthly_complete.keys()))
        if not all_months:
            return []

        safe_months = max(1, min(months, 120))
        # Default: last N months of actual data bounds
        all_months = all_months[-safe_months:]

        return [
            {"month": m, "spent": monthly_spend.get(m, 0.0), "completed": monthly_complete.get(m, 0)}
            for m in all_months
        ]
        
    except Exception as e:
        print(f"Trend Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

import base64
import io
# ... existing imports ...

@app.get("/api/proxy/proof/{attach_id}")
def download_proof(attach_id: str):
    """
    Proxies the file download from the official portal.
    Handles Base64 decoding.
    """
    try:
        url = "https://mplads.mospi.gov.in/rest/PreLoginCitizenWorkRcmdRest/getAttachmentById"
        
        # Ensure ID is formatted as float-string "12345.0"
        try:
            val = float(attach_id)
            payload = f"{val:.1f}"
        except ValueError:
            payload = attach_id

        headers = {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Content-Type': 'application/json; charset=UTF-8',
            'Origin': 'https://mplads.mospi.gov.in',
            'Referer': 'https://mplads.mospi.gov.in/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest',
            'sec-ch-ua': '"Not;A=Brand";v="99", "Microsoft Edge";v="139", "Chromium";v="139"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"'
        }
        
        print(f"Fetching proof for ID: {payload}")
        
        req = requests.post(url, data=payload, headers=headers, timeout=30)
        
        if req.status_code != 200:
             print(f"Upstream Error: {req.status_code} - {req.text[:200]}")
             raise HTTPException(status_code=req.status_code, detail="Remote server error")
        
        # Parse JSON and extract Base64
        try:
            data = req.json()
            
            # Handle case where API returns a list [ { ... } ]
            if isinstance(data, list):
                if not data:
                    raise ValueError("Empty list received from upstream")
                data = data[0]
            
            # Debug: Print keys to understand structure
            print(f"Upstream Response Keys: {list(data.keys())}")

            b64_str = data.get("URL") # The field is named URL but contains Base64
            filename = data.get("FILE_NAME", f"proof_{attach_id}.pdf")
            
            if not b64_str:
                print("Keys found:", data.keys())
                raise ValueError("No 'URL' (Base64 content) found in response")
                
            pdf_bytes = base64.b64decode(b64_str)
            
        except Exception as e:
            print(f"Decoding Error: {e}")
            raise HTTPException(status_code=502, detail=f"Failed to decode file from upstream: {str(e)}")

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        print(f"Proxy Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
