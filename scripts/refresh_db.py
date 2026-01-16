import argparse

from scripts.fetch_data import fetch_data
from scripts.etl_to_db import load_data


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Refresh GovWork database from MoSPI (fetch raw JSON -> ETL -> copy DB into backend runtime path)."
        )
    )
    parser.add_argument("--force-fetch", action="store_true", help="Overwrite existing raw JSON files")
    parser.add_argument("--data-dir", default="data/raw", help="Raw JSON output directory")
    parser.add_argument("--db-path", default="data/govwork.db", help="ETL output DB path")
    parser.add_argument(
        "--backend-db-path",
        default="src/backend/data/govwork.db",
        help="Where the API reads the DB from at runtime",
    )
    args = parser.parse_args()

    fetch_data(data_dir=args.data_dir, force=args.force_fetch)
    load_data(data_dir=args.data_dir, db_path=args.db_path, copy_to_backend=True, backend_db_path=args.backend_db_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
