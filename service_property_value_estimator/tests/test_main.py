import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.client import ModelClientError
from src.main import app

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET = PROJECT_ROOT / "resources" / "house_price_dataset.csv"

VALID_FEATURES = {
    "square_footage": 2000,
    "bedrooms": 3,
    "bathrooms": 2.0,
    "year_built": 2000,
    "lot_size": 8000,
    "distance_to_city_center": 3.5,
    "school_rating": 8.0,
}


class FakeModelClient:
    async def predict(self, features: dict) -> float:
        return 265975.0

    async def close(self) -> None:
        pass


class FailingModelClient:
    async def predict(self, features: dict) -> float:
        raise ModelClientError("boom")

    async def close(self) -> None:
        pass


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    data_dir = tmp_path_factory.mktemp("data")
    os.environ["DB_PATH"] = str(data_dir / "estimates.db")
    os.environ["DATASET_PATH"] = str(DATASET)
    os.environ["MODEL_API_URL"] = "http://localhost:8000"
    with TestClient(app) as c:
        c.app.state.model_client = FakeModelClient()
        yield c


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_ready(client: TestClient):
    r = client.get("/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ready"}


def test_predict_success(client: TestClient):
    r = client.post("/api/estimator/predict", json=VALID_FEATURES)
    assert r.status_code == 200
    data = r.json()
    assert data["predicted_price"] == 265975.0
    assert data["price_per_sqft"] == round(265975.0 / 2000, 2)
    stats = data["price_stats"]
    assert set(stats.keys()) == {"min", "median", "mean", "max"}
    assert stats["min"] <= stats["median"] <= stats["max"]
    assert stats["min"] <= stats["mean"] <= stats["max"]
    record = data["record"]
    assert record["id"] >= 1
    assert record["square_footage"] == 2000
    assert record["predicted_price"] == 265975.0
    assert "created_at" in record


def test_predict_validation_error(client: TestClient):
    r = client.post("/api/estimator/predict", json={**VALID_FEATURES, "square_footage": 50})
    assert r.status_code == 422
    data = r.json()
    assert data["detail"] == "Validation failed"
    assert any(e["field"] == "square_footage" for e in data["errors"])


def test_predict_model_error(client: TestClient):
    original = client.app.state.model_client
    client.app.state.model_client = FailingModelClient()
    try:
        r = client.post("/api/estimator/predict", json=VALID_FEATURES)
        assert r.status_code == 502
        assert r.json()["detail"] == "Model service unavailable"
    finally:
        client.app.state.model_client = original


def test_history_contains_inserted_record(client: TestClient):
    r = client.get("/api/estimator/history")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["predicted_price"] == 265975.0