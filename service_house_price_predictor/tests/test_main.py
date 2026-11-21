import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_ready(client: TestClient):
    r = client.get("/ready")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ready"
    assert data["model"] == "RandomForestRegressor"


def test_app_metrics(client: TestClient):
    client.get("/health")
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "text/plain" in r.headers["content-type"]
    body = r.text
    assert "http_requests_total" in body
    assert 'handler="/health"' in body
    assert "http_request_duration_seconds_bucket" in body
    assert 'le="0.1"' in body
    assert 'le="1.0"' in body
    assert 'le="+Inf"' in body


def test_model_info(client: TestClient):
    r = client.get("/model-info")
    assert r.status_code == 200
    data = r.json()
    assert data["model_name"] == "RandomForestRegressor"
    assert data["cv_rmse"] < 10000
    assert data["cv_r2"] > 0.9
    assert "best_params" in data
    assert "model_comparison" in data
    assert len(data["model_comparison"]) >= 24
    assert "feature_stats" in data
    assert data["feature_stats"][0].keys() == {"feature", "importance"}


def test_predict_single_success(client: TestClient):
    r = client.post("/predict", json={
        "square_footage": 2000,
        "bedrooms": 3,
        "bathrooms": 2.0,
        "year_built": 2000,
        "lot_size": 8000,
        "distance_to_city_center": 3.5,
        "school_rating": 8.0,
    })
    assert r.status_code == 200
    data = r.json()
    assert "price" in data
    assert 100_000 <= data["price"] <= 500_000


def test_predict_single_validation_error(client: TestClient):
    r = client.post("/predict", json={
        "square_footage": 50,
        "bedrooms": 3,
        "bathrooms": 2.0,
        "year_built": 2000,
        "lot_size": 8000,
        "distance_to_city_center": 3.5,
        "school_rating": 8.0,
    })
    assert r.status_code == 422
    data = r.json()
    assert data["detail"] == "Validation failed"
    assert len(data["errors"]) >= 1
    assert any(e["field"] == "body.square_footage" for e in data["errors"])


def test_predict_single_missing_field(client: TestClient):
    r = client.post("/predict", json={
        "square_footage": 2000,
        "bedrooms": 3,
    })
    assert r.status_code == 422


def test_predict_batch_success(client: TestClient):
    r = client.post("/predict/batch", json={
        "houses": [
            {"square_footage": 1550, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1997,
             "lot_size": 6800, "distance_to_city_center": 4.1, "school_rating": 7.6},
            {"square_footage": 2200, "bedrooms": 4, "bathrooms": 2.5, "year_built": 2008,
             "lot_size": 9600, "distance_to_city_center": 7.0, "school_rating": 8.8},
        ]
    })
    assert r.status_code == 200
    data = r.json()
    assert len(data["predictions"]) == 2
    for p in data["predictions"]:
        assert 100_000 <= p <= 500_000


def test_predict_batch_empty(client: TestClient):
    r = client.post("/predict/batch", json={"houses": []})
    assert r.status_code == 400
    assert "cannot be empty" in r.json()["detail"]


def test_response_headers(client: TestClient):
    r = client.get("/health")
    assert "X-Request-ID" in r.headers
    assert "X-Response-Time" in r.headers


def test_cors_headers(client: TestClient):
    r = client.get("/health", headers={"Origin": "http://example.com"})
    assert r.headers.get("access-control-allow-origin") == "*"