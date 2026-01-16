from sqlalchemy import create_engine
import os
import logging

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "data/govwork.db"))
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

logger = logging.getLogger("govwork.db")

# check_same_thread=False is needed for SQLite with multi-threaded web servers
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

def get_db_connection():
    conn = engine.connect()
    logger.info("DB connection established: %s", DB_PATH)
    try:
        yield conn
    finally:
        conn.close()
