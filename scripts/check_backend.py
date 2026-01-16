import sys
import os

# Add src to path so we can import backend
sys.path.append(os.getcwd())

try:
    from src.backend.main import app
    from src.backend.database import engine
    from sqlalchemy import text
    
    print("Imports successful.")
    
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1")).fetchone()
        print(f"DB Connection successful: {result[0]}")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
