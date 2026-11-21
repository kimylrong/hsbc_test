import json
import logging
import os
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from .models import (
    BatchPredictionRequest,
    BatchPredictionResponse,
    HouseFeatures,
    HousePrediction,
    FEATURE_COLUMNS,
)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            entry["request_id"] = request_id
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry)


class _SafeFormatter(logging.Formatter):
    def formatMessage(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return super().formatMessage(record)


if os.environ.get("LOG_FORMAT") == "json":
    _formatter = _JsonFormatter()
else:
    _formatter = _SafeFormatter(
        "%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s"
    )

_handler = logging.StreamHandler()
_handler.setFormatter(_formatter)

_root = logging.getLogger()
_root.handlers.clear()
_root.addHandler(_handler)
_root.setLevel(logging.INFO)

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "model.joblib"
METRICS_PATH = ARTIFACTS_DIR / "metrics.json"


class _RateLimiter:
    def __init__(self, max_requests: int = 12000, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._timestamps: deque = deque()

    def is_allowed(self) -> bool:
        now = time.monotonic()
        while self._timestamps and self._timestamps[0] <= now - self.window:
            self._timestamps.popleft()
        if len(self._timestamps) >= self.max_requests:
            return False
        self._timestamps.append(now)
        return True

    @property
    def current_count(self) -> int:
        return len(self._timestamps)


rate_limiter = _RateLimiter()


@asynccontextmanager
async def lifespan(app: FastAPI):
    pipeline = _load_model()
    metrics = _load_metrics()
    app.state.pipeline = pipeline
    app.state.metrics = metrics
    app.state.startup_time = time.monotonic()
    logger.info(
        "Loaded model=%s (train_samples=%d, cv_rmse=%.0f, cv_r2=%.4f)",
        metrics.get("model_name", "unknown"),
        metrics.get("train_samples", 0),
        metrics.get("cv_rmse", 0),
        metrics.get("cv_r2", 0),
    )
    try:
        yield
    finally:
        app.state.pipeline = None
        app.state.metrics = None
        logger.info("Shutdown complete")


def _load_model() -> Any:
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found: {MODEL_PATH}. Run train.py first.")
    logger.info("Loading model from %s", MODEL_PATH)
    return joblib.load(MODEL_PATH)


def _load_metrics() -> dict:
    if not METRICS_PATH.exists():
        raise RuntimeError(f"Metrics file not found: {METRICS_PATH}. Run train.py first.")
    logger.info("Loading metrics from %s", METRICS_PATH)
    with open(METRICS_PATH) as f:
        return json.load(f)


app = FastAPI(
    title="House Price Predictor API",
    description=(
        "A FastAPI service for predicting house prices based on 7 features "
        "(square footage, bedrooms, bathrooms, year built, lot size, "
        "distance to city center, school rating). "
        "Model: RandomForestRegressor selected via 5-fold cross-validation "
        "weighted ranking across RMSE, Std, and R²."
    ),
    version="1.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    excluded_handlers=["/docs", "/redoc", "/openapi.json"],
).instrument(app).expose(app)


@app.middleware("http")
async def _observability(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
    start = time.perf_counter()

    if not rate_limiter.is_allowed():
        latency_ms = (time.perf_counter() - start) * 1000
        logger.warning(
            "Rate limit exceeded path=%s latency_ms=%.1f count=%d",
            request.url.path, latency_ms, rate_limiter.current_count,
        )
        resp = JSONResponse(
            status_code=429,
            content={"detail": f"Rate limit exceeded ({rate_limiter.max_requests}/{rate_limiter.window}s)"},
        )
        resp.headers["X-Request-ID"] = request_id
        resp.headers["Retry-After"] = str(rate_limiter.window)
        return resp

    logging_adapter = logging.LoggerAdapter(logger, {"request_id": request_id})

    try:
        response = await call_next(request)
    except Exception:
        latency_ms = (time.perf_counter() - start) * 1000
        logging_adapter.exception(
            "Unhandled exception method=%s path=%s latency_ms=%.1f",
            request.method, request.url.path, latency_ms,
        )
        raise

    latency_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = f"{latency_ms:.2f}ms"

    logging_adapter.info(
        "%s %s status=%d latency_ms=%.1f",
        request.method, request.url.path, response.status_code, latency_ms,
    )

    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err["loc"])
        msg = err["msg"]
        errors.append({"field": loc, "message": msg})
    logger.warning("Validation error on %s: %s", request.url.path, errors)
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation failed", "errors": errors},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
    )


def _features_to_dataframe(features: list[HouseFeatures]) -> pd.DataFrame:
    rows = [f.model_dump() for f in features]
    df = pd.DataFrame(rows)
    return df[FEATURE_COLUMNS]


def _predict(pipeline: Any, df: pd.DataFrame) -> list[float]:
    preds = pipeline.predict(df)
    return [round(float(p), 2) for p in preds]


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
async def readiness_check(request: Request):
    pipeline = request.app.state.pipeline
    metrics = request.app.state.metrics
    if pipeline is None or metrics is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
    return {"status": "ready", "model": metrics.get("model_name")}


@app.get("/model-info", tags=["model"])
async def model_info(request: Request):
    metrics = request.app.state.metrics
    pipeline = request.app.state.pipeline
    model = pipeline.named_steps["model"]

    result = dict(metrics)
    result["model_hyperparams"] = {k: str(v) for k, v in model.get_params().items()}
    return result


@app.post("/predict", response_model=HousePrediction, tags=["predict"])
async def predict_single(request: Request, features: HouseFeatures):
    df = _features_to_dataframe([features])
    pipeline = request.app.state.pipeline
    preds = _predict(pipeline, df)
    logger.info(
        "Single prediction: sqft=%d bedrooms=%d bathrooms=%.1f year=%d lot=%d dist=%.1f school=%.1f → price=%.0f",
        features.square_footage, features.bedrooms, features.bathrooms,
        features.year_built, features.lot_size,
        features.distance_to_city_center, features.school_rating,
        preds[0],
    )
    return HousePrediction(price=preds[0])


@app.post("/predict/batch", response_model=BatchPredictionResponse, tags=["predict"])
async def predict_batch(request: Request, body: BatchPredictionRequest):
    if not body.houses:
        raise HTTPException(status_code=400, detail="houses list cannot be empty")
    df = _features_to_dataframe(body.houses)
    pipeline = request.app.state.pipeline
    preds = _predict(pipeline, df)
    logger.info(
        "Batch prediction: %d houses → prices=[%s]",
        len(preds),
        ", ".join(f"${p:,.0f}" for p in preds),
    )
    return BatchPredictionResponse(predictions=preds)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)