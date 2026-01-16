import json
import os
import sqlite3
import pandas as pd

DATA_DIR = "data/raw"
DB_PATH = "data/govwork.db"

FILES = {
    "allocated_limit": {"key": "Allocated Limit", "table": "allocated"},
    "total_expenditure": {"key": "Total Expenditure", "table": "expenditure"},
    "total_works_recommended": {"key": "Total Works Recommended", "table": "recommended"},
    "total_works_completed": {"key": "Total Works Completed", "table": "completed"}
}

def load_data():
    conn = sqlite3.connect(DB_PATH)
    
    for filename, config in FILES.items():
        filepath = os.path.join(DATA_DIR, f"{filename}.json")
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

if __name__ == "__main__":
    load_data()
