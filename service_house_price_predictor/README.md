# House Price Predictor

A FastAPI-based house price prediction API backed by a trained RandomForest model.

## Project Structure

```
.
├── src/
│   ├── train.py          # Model training: 5-fold CV + multi-model comparison + final fit
│   ├── models.py         # Pydantic data models (input validation + output schemas)
│   └── main.py           # FastAPI app entrypoint (endpoints + exception handlers + lifespan)
├── artifacts/
│   ├── model.joblib      # Trained Pipeline (StandardScaler + RandomForest)
│   └── metrics.json      # Model metrics + feature importance + 26-model comparison table
├── docs/
│   ├── House Price Dataset.csv        # 50 training samples
│   └── Test Data For Prediction.csv   # 10 test samples
├── Dockerfile
├── .dockerignore
├── pyproject.toml
└── uv.lock
```

## Model Overview

| Metric | Value |
|--------|-------|
| Best Model | RandomForestRegressor |
| Best Params | `n_estimators=200, max_depth=None` |
| CV RMSE | 5896 |
| CV R² | 0.9939 |
| CV Stability (std/mean) | 24.8% |
| Training Samples | 50 |

### Feature Importance

| Feature | Importance |
|---------|------------|
| square_footage | 18.95% |
| distance_to_city_center | 17.08% |
| year_built | 15.91% |
| lot_size | 14.49% |
| school_rating | 13.38% |
| bathrooms | 10.28% |
| bedrooms | 9.91% |

### Model Selection Process

Five model families (LinearRegression, Ridge, Lasso, RandomForest, GradientBoosting) across 26 hyperparameter combinations were evaluated with 5-fold cross-validation. The best candidate was selected via a weighted ranking scheme:

- **Weights**: mean_RMSE × 0.6 + std_RMSE × 0.25 + mean_R² × 0.15
- **Ranking**: scipy.stats.rankdata(method="min"), lower is better
- RandomForest took the top 4 spots (combined_score 2.75 ~ 5.75)

## Quick Start

### Prerequisites

- Python >= 3.12
- [uv](https://github.com/astral-sh/uv) (package manager)
- Docker (optional, for containerized deployment)

### Local Run

```bash
# Install dependencies
uv sync

# Retrain the model (optional, pretrained artifacts are provided)
uv run python -m src.train

# Start the API server
uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

Open http://localhost:8000/docs for the Swagger UI.

### Docker Run

```bash
# Build the image
docker build -t house-price-predictor .

# Start a container (host 8000 -> container 8000, aligned with the global port plan)
docker run -d --name hpp -p 8000:8000 house-price-predictor

# View logs
docker logs -f hpp

# Clean up
docker rm -f hpp
```

## API Endpoints

### GET /health

Liveness probe.

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

### GET /ready

Readiness probe — checks whether the model has finished loading.

```bash
curl http://localhost:8000/ready
# {"status":"ready","model":"RandomForestRegressor"}
```

### GET /model-info

Model metadata: name, CV metrics, best parameters, feature importance, and the full model comparison table.

```bash
curl http://localhost:8000/model-info
```

### GET /metrics

Prometheus-compatible metrics endpoint (Counter + Histogram). Use with Prometheus/Grafana for QPS, error rate, and latency percentiles (P50/P90/P99).

```bash
curl http://localhost:8000/metrics
```

### POST /predict

Single prediction.

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "square_footage": 2000,
    "bedrooms": 3,
    "bathrooms": 2.0,
    "year_built": 2000,
    "lot_size": 8000,
    "distance_to_city_center": 3.5,
    "school_rating": 8.0
  }'
# {"price":265975.0}
```

### POST /predict/batch

Batch prediction.

```bash
curl -X POST http://localhost:8000/predict/batch \
  -H "Content-Type: application/json" \
  -d '{
    "houses": [
      {"square_footage":1550,"bedrooms":3,"bathrooms":2.0,"year_built":1997,"lot_size":6800,"distance_to_city_center":4.1,"school_rating":7.6},
      {"square_footage":2200,"bedrooms":4,"bathrooms":2.5,"year_built":2008,"lot_size":9600,"distance_to_city_center":7.0,"school_rating":8.8}
    ]
  }'
# {"predictions":[237950.0,369925.0]}
```

## Input Field Constraints

| Field | Type | Constraint |
|-------|------|-----------|
| square_footage | int | 100 ~ 20000 |
| bedrooms | int | 1 ~ 10 |
| bathrooms | float | 0.5 ~ 8.0 |
| year_built | int | 1800 ~ 2026 |
| lot_size | int | 500 ~ 100000 |
| distance_to_city_center | float | 0.1 ~ 50.0 |
| school_rating | float | 1.0 ~ 10.0 |

Validation failures return HTTP 422 with a structured `errors` array listing each offending field.