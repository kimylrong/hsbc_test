# Property Value Estimator Backend

Python 3.12 + FastAPI + SQLite backend for **App 1 — Property Value Estimator** in the unified HSBC Property Intelligence Portal. This service handles single-property valuation requests, persists estimation history in a local SQLite DB, and computes dataset-wide distribution statistics used by the frontend reference chart.

It calls the [Task 1 model service](../service_house_price_predictor/) (`POST /predict`) to obtain the actual price prediction.

> Related: root [README](../README.md) · [Product Design](../product_design.md) · [Technical Design](../technical_design.md)

---

## Overview

```text
Frontend  ──►  This Service  ──►  Task 1 Model (8000)
  (3000)         (8001)               │
                │                      └─ Scikit-learn Pipeline
                └─ SQLite history (.db)
                   + dataset CSV stats
```

| Concern | Implementation |
|---------|----------------|
| Framework | FastAPI 0.165+ |
| Language | Python 3.12 |
| HTTP client | httpx (async, calls model service) |
| Persistence | SQLite (`property_history.db`, auto-created on startup) |
| Dataset reference | `resources/house_price_dataset.csv` (loaded once at startup) |
| Dev dependencies | pytest, ruff |
| Container base | `python:3.12-slim` |
| Port | 8001 |

---

## Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe — returns `{"status": "ok"}` |
| GET | `/ready` | Readiness probe — also verifies SQLite file is accessible |

### Estimator

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/estimator/predict` | Validate input → call Task 1 model → compute distribution stats → persist record |
| GET | `/api/estimator/history` | Return all previously saved estimation records (newest first) |

### Swagger UI

Swagger UI is enabled by default at `/docs` — handy for manual testing.

---

## Request / Response Shapes

### `POST /api/estimator/predict`

**Request body** (`EstimateRequest`):
```json
{
  "square_footage": 2000,
  "bedrooms": 3,
  "bathrooms": 2.0,
  "year_built": 2005,
  "lot_size": 7500,
  "distance_to_city_center": 4.5,
  "school_rating": 8.5
}
```

**Response** (`PredictResponse`):
```json
{
  "predicted_price": 285000.0,
  "distribution": {
    "min": 160000.0,
    "max": 410000.0,
    "mean": 275500.0,
    "median": 268000.0
  },
  "record": {
    "id": 42,
    "features": { "...": "..." },
    "predicted_price": 285000.0,
    "created_at": "2026-11-21T10:30:00Z"
  }
}
```

All 7 features are required. Input is strictly validated via Pydantic (returns 422 with a structured message on failure).

---

## File Layout

```
service_property_value_estimator/
├── src/
│   ├── main.py          # FastAPI app, lifespan, routes, exception handlers
│   ├── schemas.py       # Pydantic request/response models
│   ├── client.py        # Async httpx wrapper for the Task 1 model service
│   ├── db.py            # SQLite init + CRUD (history persistence)
│   └── stats.py         # Min / max / mean / median over the reference CSV
├── resources/
│   └── house_price_dataset.csv   # The reference dataset (same as Task 1 training set)
├── tests/
│   └── test_main.py
├── pyproject.toml
├── Dockerfile
├── .dockerignore
├── .gitignore
└── README.md
```

---

## Local Development

Prerequisites: Python 3.12+, [`uv`](https://docs.astral.sh/uv/)

```bash
uv sync
uv run uvicorn src.main:app --reload --port 8001
```

The service expects the Task 1 model service to be reachable. By default it calls `http://localhost:8000` — you can override it with the `MODEL_API_URL` environment variable.

Run tests:
```bash
uv run pytest
```

Lint / format:
```bash
uv run ruff check src
uv run ruff format src
```

---

## Docker

```bash
docker build -t property-value-estimator .
docker run -p 8001:8001 \
  -e MODEL_API_URL=http://host.docker.internal:8000 \
  property-value-estimator
```

Or — the recommended way — let the root `docker-compose.yml` orchestrate everything together:

```bash
cd .. && docker compose up -d --build property-value-estimator
```

---

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `MODEL_API_URL` | `http://localhost:8000` | Base URL of the Task 1 model service |
| `SQLITE_PATH` | `property_history.db` | Path to the SQLite file (created on startup) |

---

## How the Distribution Stats Work

On startup the service loads `resources/house_price_dataset.csv` into memory and computes the min / max / mean / median of the `price` column. These are returned alongside every prediction so the frontend can draw a "where does this prediction sit in the overall dataset" reference chart. Stats are computed once and cached for the lifetime of the process — the CSV is not re-read per request.