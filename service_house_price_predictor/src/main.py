import contextvars
import json
import logging
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, CONTENT_TYPE_LATEST, generate_latest

from .models import (
    BatchPredictionRequest,
    BatchPredictionResponse,
    HouseFeatures,
    HousePrediction,
    FEATURE_COLUMNS,
)

SERVICE_NAME = "ml-predictor-api"
_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0, 30.0, 60.0)

_trace_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("trace_id", default=None)

_http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["service", "endpoint", "method", "status_code"],
)

_http_request_duration = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["service", "endpoint", "method", "status_code"],
    buckets=_BUCKETS,
)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "service": SERVICE_NAME,
            "logger": record.name,
            "file.name": record.filename,
            "line.number": record.lineno,
            "function.name": record.funcName,
            "message": record.getMessage(),
        }
        for field in ("trace_id", "method", "path", "status_code", "latency_ms"):
            value = getattr(record, field, None)
            if value is not None:
                entry[field] = value
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry)


class _TraceAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        extra = kwargs.setdefault("extra", {})
        if "trace_id" not in extra:
            extra["trace_id"] = _trace_id_var.get() or None
        return msg, kwargs


_handler = logging.StreamHandler()
_handler.setFormatter(_JsonFormatter())

_root = logging.getLogger()
_root.handlers.clear()
_root.addHandler(_handler)
_root.setLevel(logging.INFO)

_logger = logging.getLogger(__name__)
logger = _TraceAdapter(_logger, {})

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


@app.middleware("http")
async def _observability(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-ID") or uuid.uuid4().hex[:12]
    _trace_id_var.set(trace_id)
    start = time.perf_counter()
    endpoint = request.url.path
    method = request.method

    if endpoint == "/metrics":
        _trace_id_var.set(None)
        return await call_next(request)

    if not rate_limiter.is_allowed():
        latency_ms = (time.perf_counter() - start) * 1000
        status = "429"
        _http_requests_total.labels(SERVICE_NAME, endpoint, method, status).inc()
        _http_request_duration.labels(SERVICE_NAME, endpoint, method, status).observe(latency_ms / 1000)
        logger.warning(
            "Rate limit exceeded method=%s path=%s latency_ms=%.1f count=%d",
            method, endpoint, latency_ms, rate_limiter.current_count,
            extra={"method": method, "path": endpoint, "status_code": 429, "latency_ms": latency_ms},
        )
        resp = JSONResponse(
            status_code=429,
            content={"detail": f"Rate limit exceeded ({rate_limiter.max_requests}/{rate_limiter.window}s)"},
        )
        resp.headers["X-Trace-ID"] = trace_id
        resp.headers["Retry-After"] = str(rate_limiter.window)
        return resp

    try:
        response = await call_next(request)
    except Exception:
        latency_ms = (time.perf_counter() - start) * 1000
        status = "500"
        _http_requests_total.labels(SERVICE_NAME, endpoint, method, status).inc()
        _http_request_duration.labels(SERVICE_NAME, endpoint, method, status).observe(latency_ms / 1000)
        logger.exception(
            "Unhandled exception method=%s path=%s latency_ms=%.1f",
            method, endpoint, latency_ms,
            extra={"method": method, "path": endpoint, "status_code": 500, "latency_ms": latency_ms},
        )
        raise

    latency_ms = (time.perf_counter() - start) * 1000
    status = str(response.status_code)
    _http_requests_total.labels(SERVICE_NAME, endpoint, method, status).inc()
    _http_request_duration.labels(SERVICE_NAME, endpoint, method, status).observe(latency_ms / 1000)

    response.headers["X-Trace-ID"] = trace_id
    response.headers["X-Response-Time"] = f"{latency_ms:.2f}ms"

    logger.info(
        "%s %s status=%s latency_ms=%.1f",
        method, endpoint, status, latency_ms,
        extra={"method": method, "path": endpoint, "status_code": response.status_code, "latency_ms": latency_ms},
    )

    return response


@app.get("/metrics", include_in_schema=False)
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err["loc"])
        msg = err["msg"]
        errors.append({"field": loc, "message": msg})
    logger.warning(
        "Validation error on %s: %s", request.url.path, errors,
        extra={"method": request.method, "path": request.url.path, "status_code": 422},
    )
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation failed", "errors": errors},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled error on %s", request.url.path,
        extra={"method": request.method, "path": request.url.path, "status_code": 500},
    )
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
    uvicorn.run("src.main:app", host="0.0.0.0", port=8010, reload=True)