from pydantic import BaseModel, Field


class EstimateRequest(BaseModel):
    """7 个房屋特征，校验边界与 Task 1 models.py 完全一致。"""

    square_footage: int = Field(..., ge=100, le=20000)
    bedrooms: int = Field(..., ge=1, le=10)
    bathrooms: float = Field(..., ge=0.5, le=8.0)
    year_built: int = Field(..., ge=1800, le=2026)
    lot_size: int = Field(..., ge=500, le=100000)
    distance_to_city_center: float = Field(..., ge=0.1, le=50.0)
    school_rating: float = Field(..., ge=1.0, le=10.0)


class PriceStats(BaseModel):
    min: float
    median: float
    mean: float
    max: float


class EstimateRecord(BaseModel):
    id: int
    square_footage: int
    bedrooms: int
    bathrooms: float
    year_built: int
    lot_size: int
    distance_to_city_center: float
    school_rating: float
    predicted_price: float
    price_per_sqft: float
    created_at: str


class PredictResponse(BaseModel):
    predicted_price: float
    price_per_sqft: float
    price_stats: PriceStats
    record: EstimateRecord