from pydantic import BaseModel, Field


FEATURE_COLUMNS = [
    "square_footage",
    "bedrooms",
    "bathrooms",
    "year_built",
    "lot_size",
    "distance_to_city_center",
    "school_rating",
]


class HouseFeatures(BaseModel):
    square_footage: int = Field(..., ge=100, le=20000, description="Total area in square feet")
    bedrooms: int = Field(..., ge=1, le=10, description="Number of bedrooms")
    bathrooms: float = Field(..., ge=0.5, le=8.0, description="Number of bathrooms")
    year_built: int = Field(..., ge=1800, le=2026, description="Year the house was built")
    lot_size: int = Field(..., ge=500, le=100000, description="Lot size in square feet")
    distance_to_city_center: float = Field(..., ge=0.1, le=50.0, description="Distance to city center in miles")
    school_rating: float = Field(..., ge=1.0, le=10.0, description="School rating 1-10")


class HousePrediction(BaseModel):
    price: float = Field(..., description="Predicted house price in USD")


class BatchPredictionRequest(BaseModel):
    houses: list[HouseFeatures]


class BatchPredictionResponse(BaseModel):
    predictions: list[float]


class ModelInfo(BaseModel):
    model_name: str
    train_samples: int
    cv_rmse: float
    cv_rmse_std: float
    cv_r2: float
    best_params: dict
    feature_names: list[str]
    feature_stats: list[float] | None
    model_comparison: list[dict]