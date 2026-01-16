# System Architecture

## Overview
A full-stack web application to visualize MPLADS data.
*   **Backend:** Python (FastAPI) + SQLite.
*   **Frontend:** React (Vite) + Tailwind CSS + Recharts.
*   **Deployment:** Designed for containerized deployment (Docker).

## Technology Stack

### Backend
*   **Language:** Python 3.9+
*   **Framework:** FastAPI
*   **Database:** SQLite (Embedded, zero-conf)
*   **ORM:** SQLModel (SQLAlchemy wrapper) or raw SQL for complex analytic queries.
*   **Data Processing:** Pandas (for initial ETL).

### Frontend
*   **Framework:** React 18
*   **Build Tool:** Vite
*   **Styling:** Tailwind CSS (Shadcn/ui for components if needed, or raw Tailwind).
*   **State Management:** React Query (TanStack Query) - essential for caching API responses on client.
*   **Visualization:** Recharts (reliable, composable).

## Data Flow

1.  **Ingestion (ETL):**
    *   `scripts/fetch_data.py`: Downloads raw JSONs from MoSPI.
    *   `scripts/etl_to_db.py`: Reads JSONs, cleanses data, inserts into SQLite `data/govwork.db`.
    *   *Frequency:* Manual or cron (daily/weekly).

2.  **API Layer:**
    *   `GET /api/stats/summary`: Global stats.
    *   `GET /api/mps`: List of MPs with computed scores (spending, completion, transparency).
    *   `GET /api/mps/{id}`: Detailed view of an MP.
    *   `GET /api/vendors`: Top vendors.

3.  **Presentation Layer:**
    *   Single Page Application (SPA).
    *   Fetches JSON from API.
    *   Renders interactive dashboards.

## Directory Structure

```
/
├── data/
│   ├── raw/             # JSON files
│   └── govwork.db       # SQLite DB
├── docs/                # Documentation
├── scripts/             # ETL & Fetch scripts
├── src/
│   ├── backend/         # FastAPI app
│   │   ├── main.py
│   │   └── database.py
│   └── frontend/        # React app
│       ├── public/
│       └── src/
├── requirements.txt
└── README.md
```

## Performance Considerations
*   **Backend:** SQLite is extremely fast for read-heavy workloads (which this is). We will add indices on `WORK_RECOMMENDATION_DTL_ID`, `MP_NAME`, `STATE_NAME`.
*   **Frontend:** React Query will handle caching to avoid hitting the backend repeatedly for the same data during a session.
*   **Hosting:** The SQLite file makes it easy to deploy on a simple VPS or even serverless (using something like Turso or just copying the db file to the container).
