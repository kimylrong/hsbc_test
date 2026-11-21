// Shared frontend types mirroring the backend contracts
// (App 1 FastAPI on :8001 and App 2 Spring Boot on :8080).

export interface HouseFeatures {
  square_footage: number;
  bedrooms: number;
  bathrooms: number;
  year_built: number;
  lot_size: number;
  distance_to_city_center: number;
  school_rating: number;
}

export type FilterDimension =
  | "bedrooms"
  | "bathrooms"
  | "year_built"
  | "square_footage"
  | "lot_size"
  | "distance_to_city_center"
  | "school_rating";

export type MarketFilter = Record<FilterDimension, string[]>;

export interface Bucket {
  key: string;
  label: string;
  order: number;
  count: number;
  avgPrice: number | null;
  avgPricePerSqft: number | null;
}

export interface ChartData {
  dimension: string;
  buckets: Bucket[];
}

export interface HouseRecord {
  id: number;
  squareFootage: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt: number;
  lotSize: number;
  distanceToCityCenter: number;
  schoolRating: number;
  price: number;
  pricePerSqft: number;
}

export interface AnalyzeResponse {
  charts: ChartData[];
  records: HouseRecord[];
}

export interface WhatIfResponse {
  baselinePrice: number;
  modifiedPrice: number;
  deltaPrice: number;
  deltaPercent: number;
}

export interface PriceStats {
  min: number;
  median: number;
  mean: number;
  max: number;
}

export interface EstimateRecord extends HouseFeatures {
  id: number;
  predicted_price: number;
  price_per_sqft: number;
  created_at: string;
}

export interface PredictResponse {
  predicted_price: number;
  price_per_sqft: number;
  price_stats: PriceStats;
  record: EstimateRecord;
}