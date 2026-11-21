import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from .schemas import EstimateRecord, EstimateRequest

_SCHEMA = """
CREATE TABLE IF NOT EXISTS estimates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    square_footage INTEGER NOT NULL,
    bedrooms INTEGER NOT NULL,
    bathrooms REAL NOT NULL,
    year_built INTEGER NOT NULL,
    lot_size INTEGER NOT NULL,
    distance_to_city_center REAL NOT NULL,
    school_rating REAL NOT NULL,
    predicted_price REAL NOT NULL,
    price_per_sqft REAL NOT NULL,
    created_at TEXT NOT NULL
);
"""

_COLUMNS = [
    "square_footage",
    "bedrooms",
    "bathrooms",
    "year_built",
    "lot_size",
    "distance_to_city_center",
    "school_rating",
    "predicted_price",
    "price_per_sqft",
    "created_at",
]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


@contextmanager
def _connection(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: Path) -> None:
    with _connection(db_path) as conn:
        conn.execute(_SCHEMA)


def insert_estimate(
    db_path: Path,
    features: EstimateRequest,
    predicted_price: float,
    price_per_sqft: float,
) -> EstimateRecord:
    values = {
        **features.model_dump(),
        "predicted_price": predicted_price,
        "price_per_sqft": price_per_sqft,
        "created_at": _now_iso(),
    }
    cols = ", ".join(_COLUMNS)
    placeholders = ", ".join(f":{c}" for c in _COLUMNS)
    with _connection(db_path) as conn:
        cur = conn.execute(f"INSERT INTO estimates ({cols}) VALUES ({placeholders})", values)
        row_id = cur.lastrowid
    return EstimateRecord(id=row_id, **values)


def list_history(db_path: Path, limit: int | None = None) -> list[EstimateRecord]:
    query = "SELECT id, " + ", ".join(_COLUMNS) + " FROM estimates ORDER BY id DESC"
    if limit is not None:
        query += f" LIMIT {limit}"
    with _connection(db_path) as conn:
        rows = conn.execute(query).fetchall()
    return [EstimateRecord(**dict(row)) for row in rows]