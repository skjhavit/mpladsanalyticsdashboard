from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.engine import Connection
from .database import get_db_connection
from typing import List, Optional
import pandas as pd
import requests

app = FastAPI(title="GovWork API", description="MPLADS Data Analysis API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, you can replace "*" with your Cloudflare domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    Search for MPs or Constituencies.
    """
    if len(q) < 2:
        return []
        
    sql = text("""
        SELECT DISTINCT MP_NAME, STATE_NAME, CONSTITUENCY 
        FROM allocated
        WHERE MP_NAME LIKE :q OR CONSTITUENCY LIKE :q
        LIMIT 20
    """)
    try:
        results = db.execute(sql, {"q": f"%{q}%"}).fetchall()
        return [
            {"name": r[0], "state": r[1], "constituency": r[2], "type": "MP"}
            for r in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vendors")
def get_top_vendors(limit: int = 50, db: Connection = Depends(get_db_connection)):
    """
    Returns top vendors by total amount received.
    """
    sql = text("""
        SELECT VENDOR_NAME, COUNT(DISTINCT MP_NAME) as mp_count, SUM(FUND_DISBURSED_AMT) as total_received
        FROM expenditure
        GROUP BY VENDOR_NAME
        ORDER BY total_received DESC
        LIMIT :limit
    """)
    try:
        results = db.execute(sql, {"limit": limit}).fetchall()
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
def get_top_bottom_analytics(db: Connection = Depends(get_db_connection)):
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
                (SELECT COUNT(*) FROM completed c WHERE c.MP_NAME = a.MP_NAME) as completed_works,
                (SELECT COUNT(ATTACH_ID) FROM completed c WHERE c.MP_NAME = a.MP_NAME) as proofs
            FROM allocated a
            LEFT JOIN expenditure e ON a.MP_NAME = e.MP_NAME
            GROUP BY a.MP_NAME
        )
        """
        
        # Top 10 Spenders
        top_spenders = db.execute(text(cte + "SELECT * FROM mp_stats ORDER BY spent DESC LIMIT 10")).fetchall()
        
        # Bottom 10 Spenders (who have at least some allocation)
        zero_spenders = db.execute(text(cte + "SELECT * FROM mp_stats WHERE allocated > 0 ORDER BY spent ASC LIMIT 10")).fetchall()
        
        # Top Transparency (Most proofs uploaded)
        top_transparent = db.execute(text(cte + "SELECT * FROM mp_stats ORDER BY proofs DESC LIMIT 10")).fetchall()

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
def get_trends(db: Connection = Depends(get_db_connection)):
    """
    Returns monthly trends for spending and work completion.
    """
    # Note: SQLite dates are strings. We need to parse 'DD-Mon-YYYY'.
    # This is tricky in pure SQLite without extensions. 
    # For MVP, we will fetch raw dates and aggregate in Python for safety/speed.
    
    try:
        # Fetch all expenditure dates and amounts
        exp_sql = text("SELECT EXPENDITURE_DATE, FUND_DISBURSED_AMT FROM expenditure")
        exp_data = db.execute(exp_sql).fetchall()
        
        # Fetch all completion dates
        comp_sql = text("SELECT ACTUAL_END_DATE FROM completed")
        comp_data = db.execute(comp_sql).fetchall()
        
        # Python aggregation
        from collections import defaultdict
        from datetime import datetime
        
        monthly_spend = defaultdict(float)
        monthly_complete = defaultdict(int)
        
        # Helper to parse "06-Oct-2025"
        def parse_date(d_str):
            try:
                return datetime.strptime(d_str, "%d-%b-%Y")
            except:
                return None

        for row in exp_data:
            dt = parse_date(row[0])
            if dt:
                key = dt.strftime("%Y-%m")
                monthly_spend[key] += row[1]
                
        for row in comp_data:
            dt = parse_date(row[0])
            if dt:
                key = dt.strftime("%Y-%m")
                monthly_complete[key] += 1
                
        # Merge and Sort
        all_months = sorted(set(monthly_spend.keys()) | set(monthly_complete.keys()))
        
        trends = []
        for m in all_months:
            trends.append({
                "month": m,
                "spent": monthly_spend[m],
                "completed": monthly_complete[m]
            })
            
        return trends
        
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
