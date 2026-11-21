import type {
  FilterDimension,
  HouseFeatures,
  HouseRecord,
  MarketFilter,
} from "./types";

// Single source of truth for the 7 analysis dimensions and their fixed buckets.
// Must stay in sync with the Java backend's Dimension enum (plan.md §6.1).
export interface DimensionDef {
  key: FilterDimension;
  label: string;
  unit?: string;
  buckets: string[];
}

export const DIMENSIONS: DimensionDef[] = [
  { key: "bedrooms", label: "Bedrooms", buckets: ["2", "3", "4"] },
  { key: "bathrooms", label: "Bathrooms", buckets: ["1", "1.5", "2", "2.5", "3"] },
  { key: "year_built", label: "Year Built", buckets: ["<1980", "1980-1989", "1990-1999", "2000-2009", ">=2010"] },
  { key: "square_footage", label: "Square Footage", unit: "sq ft", buckets: ["<1000", "1000-1500", "1500-2000", ">=2000"] },
  { key: "lot_size", label: "Lot Size", unit: "sq ft", buckets: ["<5000", "5000-7000", "7000-9000", ">=9000"] },
  { key: "distance_to_city_center", label: "Distance to City Center", unit: "mi", buckets: ["<3", "3-5", "5-7", ">=7"] },
  { key: "school_rating", label: "School Rating", buckets: ["<7", "7-8", "8-9", ">=9"] },
];

export const DIMENSION_MAP = Object.fromEntries(
  DIMENSIONS.map((d) => [d.key, d]),
) as Record<FilterDimension, DimensionDef>;

export const EMPTY_FILTERS: MarketFilter = {
  bedrooms: [],
  bathrooms: [],
  year_built: [],
  square_footage: [],
  lot_size: [],
  distance_to_city_center: [],
  school_rating: [],
};

export function recordToFeatures(record: HouseRecord): HouseFeatures {
  return {
    square_footage: record.squareFootage,
    bedrooms: record.bedrooms,
    bathrooms: record.bathrooms,
    year_built: record.yearBuilt,
    lot_size: record.lotSize,
    distance_to_city_center: record.distanceToCityCenter,
    school_rating: record.schoolRating,
  };
}

export interface FeatureField {
  key: keyof HouseFeatures;
  label: string;
  unit?: string;
  step: number;
  min: number;
  max: number;
  hint: string;
}

export const FEATURE_FIELDS: FeatureField[] = [
  { key: "square_footage", label: "Square Footage", unit: "sq ft", step: 1, min: 100, max: 20000, hint: "100 – 20,000" },
  { key: "bedrooms", label: "Bedrooms", step: 1, min: 1, max: 10, hint: "1 – 10" },
  { key: "bathrooms", label: "Bathrooms", step: 0.5, min: 0.5, max: 8, hint: "0.5 – 8.0" },
  { key: "year_built", label: "Year Built", step: 1, min: 1800, max: 2026, hint: "1800 – 2026" },
  { key: "lot_size", label: "Lot Size", unit: "sq ft", step: 1, min: 500, max: 100000, hint: "500 – 100,000" },
  { key: "distance_to_city_center", label: "Distance to City Center", unit: "mi", step: 0.1, min: 0.1, max: 50, hint: "0.1 – 50.0" },
  { key: "school_rating", label: "School Rating", step: 0.1, min: 1, max: 10, hint: "1.0 – 10.0" },
];