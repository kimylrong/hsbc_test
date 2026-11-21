import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .client import ModelClient, ModelClientError
from .db import init_db, insert_estimate, list_history
from .schemas import EstimateRequest, PredictResponse
from .stats import compute_price_stats

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATASET_PATH = PROJECT_ROOT / "resources" / "house_price_dataset.csv"
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "estimates.db"


def _config() -> dict:
    return {
        "dataset_path": Path(os.environ.get("DATASET_PATH", DEFAULT_DATASET_PATH)),
        "db_path": Path(os.environ.get("DB_PATH", DEFAULT_DB_PATH)),
        "model_api_url": os.environ.get("MODEL_API_URL", "http://localhost:8000"),
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
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err["loc"] if p != "body")
        errors.append({"field": loc, "message": err["msg"]})
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation failed", "errors": errors},
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
        logger.error("Model service error: %s", exc)
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

    uvicorn.run("src.main:app", host="0.0.0.0", port=8001, reload=True)