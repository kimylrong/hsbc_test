import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from .client import ModelClient, ModelClientError
from .db import init_db, insert_estimate, list_history
from .observability import (
    SERVICE_NAME,
    configure_logging,
    http_request_duration,
    http_requests_total,
    trace_id_var,
)
from .schemas import EstimateRequest, PredictResponse
from .stats import compute_price_stats

logger = configure_logging()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATASET_PATH = PROJECT_ROOT / "resources" / "house_price_dataset.csv"
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "estimates.db"


def _config() -> dict:
    import os
    return {
        "dataset_path": Path(os.environ.get("DATASET_PATH", DEFAULT_DATASET_PATH)),
        "db_path": Path(os.environ.get("DB_PATH", DEFAULT_DB_PATH)),
        "model_api_url": os.environ.get("MODEL_API_URL", "http://localhost:8010"),
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = _config()
    price_stats = compute_price_stats(cfg["dataset_path"])
    init_db(cfg["db_path"])
    app.state.db_path = cfg["db_path"]
    app.state.price_stats = price_stats
    app.state.model_client = ModelClient(cfg["model_api_url"])
    logger.info("Loaded price_stats=%s from %s", price_stats.model_dump(), cfg["dataset_path"])
    try:
        yield
    finally:
        await app.state.model_client.close()


app = FastAPI(
    title="Property Value Estimator API",
    description=(
        "App 1 backend: validates features, calls the Task 1 model, "
        "persists estimates to SQLite."
    ),
    version="1.1.0",
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
    trace_id_var.set(trace_id)
    start = time.perf_counter()
    endpoint = request.url.path
    method = request.method

    if endpoint == "/metrics":
        trace_id_var.set(None)
        return await call_next(request)

    try:
        response = await call_next(request)
    except Exception:
        latency_ms = (time.perf_counter() - start) * 1000
        status = "500"
        http_requests_total.labels(SERVICE_NAME, endpoint, method, status).inc()
        http_request_duration.labels(SERVICE_NAME, endpoint, method, status).observe(latency_ms / 1000)
        logger.exception(
            "Unhandled exception method=%s path=%s latency_ms=%.1f",
            method, endpoint, latency_ms,
            extra={"method": method, "path": endpoint, "status_code": 500, "latency_ms": latency_ms},
        )
        raise

    latency_ms = (time.perf_counter() - start) * 1000
    status = str(response.status_code)
    http_requests_total.labels(SERVICE_NAME, endpoint, method, status).inc()
    http_request_duration.labels(SERVICE_NAME, endpoint, method, status).observe(latency_ms / 1000)

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
        loc = ".".join(str(p) for p in err["loc"] if p != "body")
        errors.append({"field": loc, "message": err["msg"]})
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


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
async def ready(request: Request):
    if getattr(request.app.state, "price_stats", None) is None:
        raise HTTPException(status_code=503, detail="Not ready")
    return {"status": "ready"}


@app.post("/api/estimator/predict", response_model=PredictResponse, tags=["estimator"])
async def predict(request: Request, features: EstimateRequest):
    try:
        predicted_price = await request.app.state.model_client.predict(features.model_dump())
    except ModelClientError as exc:
        logger.error(
            "Model service error: %s", exc,
            extra={"method": request.method, "path": request.url.path, "status_code": 502},
        )
        raise HTTPException(status_code=502, detail="Model service unavailable") from exc

    price_per_sqft = round(predicted_price / features.square_footage, 2)
    record = insert_estimate(request.app.state.db_path, features, predicted_price, price_per_sqft)

    return PredictResponse(
        predicted_price=predicted_price,
        price_per_sqft=price_per_sqft,
        price_stats=request.app.state.price_stats,
        record=record,
    )


@app.get("/api/estimator/history", tags=["estimator"])
async def history(request: Request):
    return list_history(request.app.state.db_path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=8020, reload=True)