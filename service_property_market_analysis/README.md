# Property Market Analysis Backend

Java 21 + Spring Boot 3.4.4 backend for **App 2 — Property Market Analysis** in the unified HSBC Property Intelligence Portal. It loads the property dataset at startup, aggregates and segments it across 7 house-feature dimensions, and supports filtered bar + line combination charts, detail-table views, and lightweight What-if simulations.

Data aggregation and statistics are computed directly against the loaded CSV dataset. The ML model is **only** invoked for What-if requests (single-property parameter tweaks).

> Related: root [README](../README.md) · [Product Design](../product_design.md) · [Technical Design](../technical_design.md)

---

## Overview

```text
Frontend  ──►  This Service  ──►  Task 1 Model (8000)  ← only for What-if
  (3000)         (8080)
                │
                └─ house_price_dataset.csv  (loaded once at startup)
                   + Caffeine cache         (analyze responses)
```

| Concern | Implementation |
|---------|----------------|
| Framework | Spring Boot 3.4.4 (`spring-boot-starter-web` + `spring-boot-starter-cache`) |
| Language | Java 21 |
| Build tool | Maven 3.9 |
| Cache | Caffeine (`maximumSize=500`, `expireAfterWrite=10m`) |
| CSV parsing | Apache Commons CSV 1.11.0 |
| Dataset reference | `src/main/resources/house_price_dataset.csv` |
| Container base | Multi-stage — `maven:3.9-eclipse-temurin-21` build → `eclipse-temurin:21-jre` runtime |
| Port | 8080 |

---

## Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe |

### Market Analysis

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/market/analyze` | 7-dimension filtered aggregation — returns bucketed counts, means, medians, and detail rows for the frontend charts + table |
| POST | `/api/market/what-if` | Load a property row from the dataset, apply user-modified features, call the Task 1 model, return baseline vs. modified predictions with delta |

---

## Filter Dimensions

All 7 house features are supported as optional filters. The backend uses the `Dimension` enum to define per-dimension bucket rules — exact-match, range, and threshold (`<`, `>=`). Frontend and backend bucket definitions are kept in sync (see the `BucketDef` values in `Dimension.java`).

| Dimension | Bucket Examples |
|-----------|----------------|
| `bedrooms` | `2`, `3`, `4` |
| `bathrooms` | `1`, `1.5`, `2`, `2.5`, `3` |
| `year_built` | `<1980`, `1980-1989`, `1990-1999`, `2000-2009`, `>=2010` |
| `square_footage` | `<1000`, `1000-1500`, `1500-2000`, `>=2000` |
| `lot_size` | `<5000`, `5000-7000`, `7000-9000`, `>=9000` |
| `distance_to_city_center` | `<3`, `3-5`, `5-7`, `>=7` |
| `school_rating` | `<7`, `7-8`, `8-9`, `>=9` |

A filter value of `null` (or the dimension absent from the request) means "no filter on this dimension" — all records pass.

---

## Request / Response Shapes

### `POST /api/market/analyze`

**Request body** (`FilterCriteria` — all fields optional):
```json
{
  "bedrooms": "3",
  "year_built": ">=2010",
  "square_footage": null,
  "bathrooms": null,
  "lot_size": null,
  "distance_to_city_center": null,
  "school_rating": null
}
```

**Response** (`AnalyzeResponse` — abridged):
```json
{
  "totalCount": 12,
  "priceStats": { "min": 210000, "max": 395000, "mean": 298500, "median": 287000 },
  "buckets": {
    "bedrooms":       [ { "key": "2",   "count": 5, "meanPrice": 240000 }, { "key": "3",   "count": 12, "meanPrice": 298500 } ],
    "bathrooms":      [ { "key": "1.5", "count": 3, "meanPrice": 225000 }, { "key": "2",   "count": 8,  "meanPrice": 295000 } ],
    "year_built":     [ { "key": ">=2010", "count": 6, "meanPrice": 335000 } ]
  },
  "detailRows": [
    { "id": 7, "squareFootage": 2100, "bedrooms": 3, "bathrooms": 2.5, "yearBuilt": 2015,
      "lotSize": 8000, "distanceToCityCenter": 3.2, "schoolRating": 8.8, "actualPrice": 345000 }
  ]
}
```

The response always returns bucket breakdowns for **all 7 dimensions**, even when some are used as filters — the frontend uses them to draw each of the 7 chart cards.

### `POST /api/market/what-if`

**Request body** (`WhatIfRequest`):
```json
{
  "rowId": 7,
  "modifiedFeatures": {
    "square_footage": 2400,
    "school_rating": 9.2
  }
}
```

**Response** (`WhatIfResponse`):
```json
{
  "baselinePrice": 310500.0,
  "modifiedPrice": 342100.0,
  "delta": 31600.0,
  "deltaPercent": 10.18,
  "actualPrice": 345000.0
}
```

`actualPrice` is returned as a reference column only — it is **not** used in the delta calculation.

---

## Architecture Breakdown

```
controller/          # Three REST controllers
  HealthController     GET /health, GET /ready
  AnalyzeController    POST /api/market/analyze
  WhatIfController     POST /api/market/what-if

service/             # Core business logic
  DatasetService       Loads CSV → List<HouseRecord> at startup; immutable for the process lifetime
  MarketService        Filter matching + 7-dimension bucketed aggregation + Caffeine cache
  WhatIfService        Baseline predict → merge modified features → model predict → compute delta

model/               # Records, enums, request/response DTOs
  Dimension           7-dimension enum with per-dimension BucketDef rules
  BucketDef           exact / range / lessThan / atLeast
  HouseRecord         Immutable record class for one CSV row
  FilterCriteria      Pojo mapping optional filter per dimension
  AnalyzeResponse     Aggregated response with bucket breakdowns + detail rows
  WhatIfRequest / WhatIfResponse
  ...

config/
  AppConfig           @EnableCaching + model API url bean
```

---

## File Layout

```
service_property_market_analysis/
├── src/
│   ├── main/
│   │   ├── java/com/hsbc/marketanalysis/
│   │   │   ├── MarketAnalysisApplication.java   # @SpringBootApplication entrypoint
│   │   │   ├── config/                           # AppConfig (caching, model API url)
│   │   │   ├── controller/                       # 3 REST controllers
│   │   │   ├── model/                            # DTOs, Dimension enum, BucketDef, HouseRecord
│   │   │   └── service/                          # DatasetService, MarketService, WhatIfService
│   │   └── resources/
│   │       ├── application.yml
│   │       └── house_price_dataset.csv           # Reference dataset (same as Task 1 training set)
│   └── test/java/com/hsbc/marketanalysis/service/
│       ├── MarketServiceTest.java
│       └── WhatIfServiceTest.java
├── pom.xml
├── settings.xml        # Aliyun Maven mirror — speeds up dependency download in China
├── Dockerfile
├── .dockerignore
├── .gitignore
└── README.md
```

---

## Local Development

Prerequisites: JDK 21, Maven 3.9+

```bash
mvn spring-boot:run
```

The service also needs the Task 1 model service running (default `http://localhost:8000`) — required only for What-if endpoints.

Run tests:
```bash
mvn test
```

Package (skip tests for fast iteration, but please run tests before committing):
```bash
mvn package
```

---

## Docker

Multi-stage build:
```bash
docker build -t property-market-analysis .
docker run -p 8080:8080 \
  -e MODEL_API_URL=http://host.docker.internal:8000 \
  property-market-analysis
```

Or via the root `docker-compose.yml`:
```bash
cd .. && docker compose up -d --build property-market-analysis
```

---

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `MODEL_API_URL` | `http://localhost:8000` | Base URL of the Task 1 model service (only used for What-if) |

Cache config (in `application.yml`, not env):
- `spring.cache.caffeine.spec: maximumSize=500,expireAfterWrite=10m` — aggregated analyze responses are keyed by serialized filter criteria and cached for 10 minutes. This keeps the dashboard snappy when users flip through filter combinations.

---

## Notes on Data & Caching

- The CSV is loaded **once** at startup into an in-memory `List<HouseRecord>` and never re-read. For the 50-row demo dataset this is zero-cost — but it means changes to the CSV require a container restart.
- What-if requests always hit the live Task 1 model — they are **not** cached, because each What-if uses a fresh set of modified features.
- Bucket labels for `bathrooms` use integer form for whole baths (`1`, `2`, `3`) and decimals for half-baths (`1.5`, `2.5`) to match real-estate conventions. The frontend `constants.ts` mirrors this definition — if you change `Dimension.java`, update the frontend constants accordingly.