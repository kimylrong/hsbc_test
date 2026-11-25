# HSBC Fullstack Challenge — Unified Property Intelligence Portal

A unified property intelligence portal hosting two independent sub-applications, backed by a shared ML prediction service.

> Related documents: [Product Design](product_design.md) · [Technical Design](technical_design.md) · [Implementation Plan](plan.md)

---

## 1. Service Architecture

```text
                         Browser  (single entrypoint)
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────┐
│            web_portal · Next.js App Router (port 8000)             │
│  Routes:  /  Home    /estimator  App 1   /market  App 2             │
│  Proxy:   /api/estimator/**  ──► Python backend                     │
│           /api/market/**     ──► Java backend                        │
└───────────────┬────────────────────────────────┬────────────────────┘
                │                                │
                ▼                                ▼
┌───────────────────────────────┐  ┌──────────────────────────────────┐
│ property-value-estimator      │  │ property-market-analysis          │
│ Python 3.12 + FastAPI + SQLite│  │ Java 21 + Spring Boot 3.4 + Cache │
│ (port 8020)                   │  │ (port 8030)                       │
└───────────────┬───────────────┘  └────────────────┬─────────────────┘
                │           POST /predict           │
                └────────────────┬──────────────────┘
                                 ▼
             ┌────────────────────────────────────────────┐
             │  ml-predictor-api · FastAPI + Scikit-learn  │
             │  House-price prediction model (port 8010)    │
             └────────────────────────────────────────────┘
```

| Service | Directory | Tech Stack | Port | Description |
| --- | --- | --- | --- | --- |
| ml-predictor-api | `service_house_price_predictor/` | Python + FastAPI + Scikit-learn | 8010 | House-price prediction model; called only by the two backends |
| property-value-estimator | `service_property_value_estimator/` | Python 3.12 + FastAPI + SQLite | 8020 | Single-property valuation, history |
| property-market-analysis | `service_property_market_analysis/` | Java 21 + Spring Boot 3.4 + Caffeine | 8030 | 7-dimension filtered aggregation, What-if simulation |
| web-portal | `web_portal/` | Next.js 16 + App Router + Tailwind | 8000 | Single browser entrypoint |

---

## 2. Port Plan

All services use port `8xxx` internally (inside the process or container). When running under Docker, the host-facing port is shifted by **+1000** to `9xxx` to avoid conflicts with developer-mode processes.

| Service | Internal Port (dev & Docker container) | Docker Host Port |
| --- | :---: | :---: |
| web-portal | 8000 | 9000 |
| ml-predictor-api | 8010 | 9010 |
| property-value-estimator | 8020 | 9020 |
| property-market-analysis | 8030 | 9030 |

**Rule of thumb**: dev mode → use 8xxx directly. Docker → add 1000 for browser access.

---

## 3. Quick Start — Two Modes

### Mode A: Docker Compose (production-like, full isolation)

Prerequisites: [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2

```bash
docker compose up -d --build
```

First build pulls base images and compiles each service. Once healthy:

```bash
docker compose ps                         # Check status
docker compose logs -f web-portal         # Follow specific service logs
docker compose down                       # Stop (volumes kept)
docker compose down -v                    # Stop + clear all data volumes
docker compose build <service>            # Rebuild a single service
```

**Access (Docker host ports):**

| Service | URL |
| --- | --- |
| Portal (browser) | http://localhost:9000 |
| ml-predictor-api Swagger | http://localhost:9010/docs |
| property-value-estimator Swagger | http://localhost:9020/docs |
| property-market-analysis Swagger | http://localhost:9030/swagger-ui.html |

### Mode B: Developer Mode (local processes, hot reload)

Prerequisites per service:
- **Python services**: Python 3.12 + `uv sync` already done (venv exists in each service dir)
- **Java service**: JDK 21 + Maven
- **Portal**: Node.js 22 + `npm install` already done

```bash
./dev.sh
```

This one script starts all four services as local foreground processes with hot reload enabled (FastAPI `--reload`, Next.js `npm run dev`). Press `Ctrl+C` to **stop all services cleanly** — the script traps SIGINT and kills every process listening on ports 8000/8010/8020/8030 before exiting.

If the script exits unexpectedly (e.g. your terminal closes), leftover processes are killed automatically the next time you run `./dev.sh` (it cleans the four ports before starting).

**Access (developer ports, no offset):**

| Service | URL |
| --- | --- |
| Portal (browser) | http://localhost:8000 |
| ml-predictor-api Swagger | http://localhost:8010/docs |
| property-value-estimator Swagger | http://localhost:8020/docs |
| property-market-analysis Swagger | http://localhost:8030/swagger-ui.html |

### Starting Individual Services Manually

If you only need to restart one service:

```bash
# ml-predictor-api
cd service_house_price_predictor
.venv/bin/python -m uvicorn src.main:app --host 0.0.0.0 --port 8010 --reload

# property-value-estimator
cd service_property_value_estimator
MODEL_API_URL=http://localhost:8010 \
.venv/bin/python -m uvicorn src.main:app --host 0.0.0.0 --port 8020 --reload

# property-market-analysis
cd service_property_market_analysis
MODEL_API_URL=http://localhost:8010 \
mvn spring-boot:run -Dspring-boot.run.arguments="--server.port=8030"

# web-portal
cd web_portal
PY_BACKEND_URL=http://localhost:8020 JAVA_BACKEND_URL=http://localhost:8030 \
npm run dev -- -p 8000
```

---

## 4. API Overview

### ml-predictor-api (internal port 8010)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/ready` / `/health` | Health check |
| GET | `/model-info` | Model information |
| POST | `/predict` | Single-property prediction, returns `{"price": <float>}` |
| POST | `/predict/batch` | Batch prediction |

Interactive docs at `/docs` (FastAPI Swagger UI).

### property-value-estimator (internal port 8020)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/ready` / `/health` | Health check |
| POST | `/api/estimator/predict` | Validate → call model → persist |
| GET | `/api/estimator/history` | Historical valuation records |

Interactive docs at `/docs` (FastAPI Swagger UI).

### property-market-analysis (internal port 8030)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/ready` / `/health` | Health check |
| POST | `/api/market/analyze` | 7-dimension filtered segmented aggregation |
| POST | `/api/market/what-if` | What-if simulation |

Interactive docs at `/swagger-ui.html` (SpringDoc Swagger UI).

**7 house features** (consistent across all three services):

`square_footage`, `bedrooms`, `bathrooms`, `year_built`, `lot_size`, `distance_to_city_center`, `school_rating`

---

## 5. Image & Dependency Acceleration Notes

- **Docker Hub registry mirrors**: Configure at host level under `~/.docker/daemon.json` (`registry-mirrors`). This is **not inside this repo** and **must not be committed**.
- **Maven dependency mirrors**: The Java service uses an Aliyun Maven mirror via `service_property_market_analysis/settings.xml`. Versioned with the code.

---

## 6. Repository Structure

```text
hsbc_challenge/
├── service_house_price_predictor/      # ml-predictor-api: FastAPI + Scikit-learn (8010)
├── service_property_value_estimator/   # property-value-estimator: FastAPI + SQLite (8020)
├── service_property_market_analysis/   # property-market-analysis: Spring Boot (8030)
├── web_portal/                         # Portal: Next.js App Router (8000)
├── docker-compose.yml                  # One-click Docker orchestration
├── dev.sh                              # One-click developer-mode startup
├── product_design.md
├── technical_design.md
├── plan.md
└── README.md
```
