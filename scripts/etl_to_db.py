import json
import os
import sqlite3
import pandas as pd
import argparse
import shutil

DEFAULT_DATA_DIR = "data/raw"
DEFAULT_DB_PATH = "data/govwork.db"
DEFAULT_BACKEND_DB_PATH = os.path.join("src", "backend", "data", "govwork.db")

FILES = {
    "allocated_limit": {"key": "Allocated Limit", "table": "allocated"},
    "total_expenditure": {"key": "Total Expenditure", "table": "expenditure"},
    "total_works_recommended": {"key": "Total Works Recommended", "table": "recommended"},
    "total_works_completed": {"key": "Total Works Completed", "table": "completed"}
}

def load_data(
    data_dir: str = DEFAULT_DATA_DIR,
    db_path: str = DEFAULT_DB_PATH,
    copy_to_backend: bool = True,
    backend_db_path: str = DEFAULT_BACKEND_DB_PATH,
):
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    
    for filename, config in FILES.items():
        filepath = os.path.join(data_dir, f"{filename}.json")
        print(f"Processing {filename} -> table '{config['table']}'...")
        
        try:
            with open(filepath, 'r') as f:
                raw_data = json.load(f)
            
            # Extract inner JSON string
            inner_json = raw_data.get(config['key'])
            if not inner_json:
                print(f"Skipping {filename}: Key not found.")
                continue
                
            data_list = json.loads(inner_json)
            df = pd.DataFrame(data_list)
            
            # Basic cleaning
            # Convert columns to appropriate types if needed (pandas does a decent job automatically)
            # Ensure column names are clean (remove spaces if any, though the source seems okay)
            
            # Write to SQLite
            df.to_sql(config['table'], conn, if_exists="replace", index=False)
            print(f"Loaded {len(df)} rows into '{config['table']}'.")
            
            # Add Indexes for performance
            cursor = conn.cursor()
            if 'MP_NAME' in df.columns:
                cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{config['table']}_mp ON {config['table']} (MP_NAME)")
            if 'STATE_NAME' in df.columns:
                cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{config['table']}_state ON {config['table']} (STATE_NAME)")
            if 'WORK_RECOMMENDATION_DTL_ID' in df.columns:
                cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{config['table']}_work_id ON {config['table']} (WORK_RECOMMENDATION_DTL_ID)")
            
            conn.commit()
            
        except Exception as e:
            print(f"Error processing {filename}: {e}")

    conn.close()
    print("ETL Complete. Database ready.")

    if copy_to_backend:
        os.makedirs(os.path.dirname(backend_db_path), exist_ok=True)
        shutil.copyfile(db_path, backend_db_path)
        print(f"Copied DB to backend runtime path: {backend_db_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load raw MPLADS JSONs into SQLite and create indices.")
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR, help="Directory containing raw JSON files")
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH, help="Output SQLite DB path")
    parser.add_argument(
        "--no-copy-to-backend",
        action="store_true",
        help="Do not copy the generated DB into src/backend/data/govwork.db",
    )
    parser.add_argument(
        "--backend-db-path",
        default=DEFAULT_BACKEND_DB_PATH,
        help="Backend runtime DB destination path",
    )
    args = parser.parse_args()
    load_data(
        data_dir=args.data_dir,
        db_path=args.db_path,
        copy_to_backend=(not args.no_copy_to_backend),
        backend_db_path=args.backend_db_path,
    )
