from sqlalchemy import create_engine
import os

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/govwork.db"))
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False is needed for SQLite with multi-threaded web servers
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

def get_db_connection():
    conn = engine.connect()
    try:
        yield conn
    finally:
        conn.close()
