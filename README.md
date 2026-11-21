# HSBC Fullstack Challenge — Unified Property Intelligence Portal

A unified property intelligence portal hosting two independent sub-applications, reusing the house-price prediction model service from Task 1. `docker-compose.yml` builds, orchestrates, and starts all four services with a single command.

> Related documents: [Product Design](product_design.md) · [Technical Design](technical_design.md) · [Implementation Plan](plan.md)

---

## 1. Service Architecture

```text
                         Browser  (single entrypoint http://localhost:3000)
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────┐
│            web_portal · Next.js App Router (Port 3000)              │
│  Routes:  /  Home    /estimator  App 1   /market  App 2             │
│  Proxy:   /api/estimator/**  ──► Python backend                     │
│           /api/market/**     ──► Java backend                        │
└───────────────┬────────────────────────────────┬────────────────────┘
                │                                │
                ▼                                ▼
┌───────────────────────────────┐  ┌──────────────────────────────────┐
│ property-value-estimator      │  │ property-market-analysis          │
│ Python 3.12 + FastAPI + SQLite│  │ Java 21 + Spring Boot 3.4 + Cache │
│ (Port 8001)                   │  │ (Port 8080)                       │
└───────────────┬───────────────┘  └────────────────┬─────────────────┘
                │           POST /predict           │
                └────────────────┬──────────────────┘
                                 ▼
             ┌────────────────────────────────────────────┐
             │  task1-ml-api · FastAPI + Scikit-learn      │
             │  House-price prediction model (Port 8000)    │
             └────────────────────────────────────────────┘
```

| Service | Directory | Tech Stack | Port | Description |
| --- | --- | --- | --- | --- |
| Model service | `service_house_price_predictor/` | Python + FastAPI + Scikit-learn | 8000 | Task 1 prediction model; called only by the two backends |
| App 1 backend | `service_property_value_estimator/` | Python 3.12 + FastAPI + SQLite | 8001 | Single-property valuation, history |
| App 2 backend | `service_property_market_analysis/` | Java 21 + Spring Boot 3.4 + Caffeine | 8080 | 7-dimension filtered aggregation, What-if simulation |
| Unified portal | `web_portal/` | Next.js 16 + App Router + Tailwind | 3000 | Single browser entrypoint |

> Port mapping: host port = container port = documented port (1:1). Inter-service calls use Compose internal aliases (`task1-ml-api`, `property-value-estimator`, `property-market-analysis`); the browser only accesses port 3000.

---

## 2. Quick Start (Docker Compose)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2

### One-Click Build & Start

```bash
docker compose up -d --build
```

The first build pulls base images and compiles each service (the Java service uses an Aliyun Maven mirror to speed up dependency downloads). Once the build completes:

```bash
docker compose ps          # Check the four services (all should be healthy)
```

### Common Commands

```bash
docker compose up -d       # Start without rebuilding
docker compose down        # Stop and remove containers (volumes kept)
docker compose down -v     # Stop and remove containers + volumes (clears history)
docker compose logs -f web-portal   # Follow logs of a specific service
docker compose build <service>      # Rebuild a single service
```

---

## 3. Ports & Access Points

| Service | Host Port | How to Access |
| --- | --- | --- |
| Portal (only browser entrypoint) | 3000 | http://localhost:3000 |
| App 1 backend (debug/Swagger) | 8001 | http://localhost:8001/docs |
| App 2 backend (debug) | 8080 | http://localhost:8080 |
| Task 1 model (debug/Swagger) | 8000 | http://localhost:8000/docs |

- App 1 page: http://localhost:3000/estimator
- App 2 page: http://localhost:3000/market

---

## 4. API Overview

### Task 1 Model Service (8000)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/ready` / `/health` | Health check |
| GET | `/model-info` | Model information |
| POST | `/predict` | Single-property prediction, returns `{"price": <float>}` |
| POST | `/predict/batch` | Batch prediction |

### App 1 Python Backend (8001)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/ready` / `/health` | Health check |
| POST | `/api/estimator/predict` | Validate → call model → persist; returns predicted price, mean price, distribution reference, record |
| GET | `/api/estimator/history` | Historical valuation records |

### App 2 Java Backend (8080)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/ready` / `/health` | Health check |
| POST | `/api/market/analyze` | 7-dimension filtered segmented aggregation (`FilterCriteria`) |
| POST | `/api/market/what-if` | What-if simulation |

**7 house features** (consistent across all three services):

`square_footage`, `bedrooms`, `bathrooms`, `year_built`, `lot_size`, `distance_to_city_center`, `school_rating`

---

## 5. Local Development (Without Docker)

| Service | Command | Notes |
| --- | --- | --- |
| Task 1 | `cd service_house_price_predictor && uv sync && uvicorn src.main:app --port 8000` | Requires `uv` |
| App 1 | `cd service_property_value_estimator && uv sync && uvicorn src.main:app --port 8001` | Requires `uv` |
| App 2 | `cd service_property_market_analysis && mvn spring-boot:run` | Requires JDK 21 + Maven |
| Portal | `cd web_portal && npm install && npm run dev` | Requires Node.js 22 |

---

## 6. Image & Dependency Acceleration Notes

- **Docker Hub registry mirrors**: Host-level configuration under `~/.docker/daemon.json` (`registry-mirrors`). This is **not inside this repo** and **must not be committed**. Configure your own mirror or ensure direct access to Docker Hub when building on a new machine.
- **Maven dependency mirrors**: The Java service uses an Aliyun Maven mirror (`maven.aliyun.com`) during build via `service_property_market_analysis/settings.xml`. This file **is in the repo**, versioned with the code, so any machine can benefit.

---

## 7. Repository Structure

```text
hsbc_challenge/
├── service_house_price_predictor/      # Task 1 house-price prediction model service
├── service_property_value_estimator/   # App 1 backend: FastAPI + SQLite (8001)
├── service_property_market_analysis/   # App 2 backend: Spring Boot (8080)
├── web_portal/                         # Portal: Next.js App Router (3000)
├── docker-compose.yml                  # One-click orchestration: build images + internal network + volumes
├── product_design.md                   # Product design
├── technical_design.md                 # Technical design
├── plan.md                             # Implementation plan
└── README.md                           # This file
```