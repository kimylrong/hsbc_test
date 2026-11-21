# Task 2 Implementation Plan: Unified Property Intelligence Portal (Next.js Portal)

> This plan is fully aligned with `product_design.md` (product design) and `technical_design.md` (technical design). It is the phased execution checklist before coding begins.
> Prerequisite: Task 1 (house price prediction model API) is already complete, located at `service_house_price_predictor/`.

---

## 0. Goals & Scope

Build a unified Next.js portal hosting two independent sub-applications:

| Sub-Application | Frontend Route | Backend Tech | Port | Core Capabilities |
| --- | --- | --- | --- | --- |
| App 1: Property Value Estimator | `/estimator` | Python 3.12 + FastAPI | 8001 | Single-property valuation, distribution reference chart, history, side-by-side comparison |
| App 2: Property Market Analysis | `/market` | Java 21 + Spring Boot 3.4.4 | 8080 | 7-dimension filtered aggregation, bar+line combination charts, detail table, CSV/PDF export, What-if simulation |
| Unified Portal | `/` | Next.js App Router | 3000 | Shared layout & nav, `/api/*` forwarding, loading/error fallback |
| Task 1 Model Service | — | FastAPI + Scikit-learn | 8000 | Ready — only called by the two backends |

**Out of scope**: Task 1 model retraining, authentication/authorization, multi-tenancy, production-grade CI/CD.

---

## 1. Prerequisites & Status Check

1. Task 1 service is runnable: `GET /health`, `GET /ready`, `GET /model-info`, `POST /predict`, `POST /predict/batch` are all implemented.
2. Key interface facts (treat these as canonical when coding — do not copy blindly from README):
   - `POST /predict`: takes 7 fields, returns `{"price": <float>}`.
   - `POST /predict/batch`: takes `{"houses": [ {7 fields}, ... ]}`, returns `{"predictions": [<float>, ...]}`.
   - Validation boundaries (`src/models.py` is the single source of truth): square_footage 100–20000, bedrooms 1–10, bathrooms 0.5–8.0, year_built 1800–2026, lot_size 500–100000, distance_to_city_center 0.1–50.0, school_rating 1.0–10.0.
3. **Suggested quick fix**: The "Input Field Constraints" table in Task 1 `README.md` does not match `models.py`. Before starting, one small commit should correct it to the boundaries above (non-blocking).
4. Dataset `docs/House Price Dataset.csv`: 50 rows, first column has UTF-8 BOM (`\ufeffid`) — must be stripped during Java parsing.

---

## 2. Deliverables Checklist (Mapped to PDF)

| # | PDF Requirement | Deliverable | Phase Covered |
| --- | --- | --- | --- |
| 1 | Unified nav & layout, design system, loading/error | Portal layout + design tokens + loading/error.tsx | Phase 3 |
| 2 | App 1 form + client validation + table + chart | EstimatorForm + ResultChart + result table | Phase 3 |
| 3 | App 1 history + side-by-side comparison | HistoryTable + CompareModal | Phase 3 |
| 4 | App 1 backend: submit/validate/forward to model | FastAPI endpoints + SQLite | Phase 1 |
| 5 | App 2 interactive dashboard + filters + combo charts | FilterBar + ComposedChartGrid | Phase 3 |
| 6 | App 2 What-if tool | WhatIfDrawer + `/what-if` | Phase 2 + 3 |
| 7 | App 2 CSV/PDF export + responsive table | MarketTable + `lib/export.ts` | Phase 3 |
| 8 | App 2 backend: REST + aggregation + caching | Spring Boot endpoints + @Cacheable | Phase 2 |
| 9 | Next.js tech items (RSC/data fetch/hooks/state/transitions) | See Phase 3 detail | Phase 3 |
| 10 | One-command startup + demo readiness | docker-compose.yml | Phase 4 |

---

## 3. Final Repository Structure

```
hsbc_challenge/
├── service_house_price_predictor/      # Task 1 (already done)
├── service_property_value_estimator/   # App 1 backend: FastAPI + SQLite (Port 8001)
├── service_property_market_analysis/   # App 2 backend: Spring Boot 3.4.4 (Port 8080)
├── web_portal/                         # Portal: Next.js App Router + Tailwind (Port 3000)
├── docker-compose.yml                  # Local test/demo orchestration: build images + internal network + data volume
├── product_design.md                   # Product design (done)
├── technical_design.md                 # Technical design (done)
└── plan.md                             # This file
```

> Directory names (underscored) map to compose service names (internal-network aliases, hyphenated): `service_house_price_predictor` → `task1-ml-api`, `service_property_value_estimator` → `property-value-estimator`, `service_property_market_analysis` → `property-market-analysis`, `web_portal` → `web-portal`.

### 3.1 Port Plan (globally unique — no README / script / Dockerfile may deviate)

> Principle: **host port = container port = documented port (1:1 mapping)**. All inter-service calls use compose internal-network aliases + container ports — no extra host ports. Once a host port is reserved here, no `docker run` example or script may reuse it.

| Service | Compose service name (internal alias) | Container port | Host port | Browser/external required? |
| --- | --- | --- | --- | --- |
| Task 1 model | `task1-ml-api` | 8000 | 8000 | No (debug/Swagger only) |
| App 1 Python backend | `property-value-estimator` | 8001 | 8001 | No (debug/Swagger only) |
| App 2 Java backend | `property-market-analysis` | 8080 | 8080 | No (debug/Swagger only) |
| Unified portal | `web-portal` | 3000 | 3000 | **Yes (the only browser entry)** |

- Container/internal calls: `http://task1-ml-api:8000`, `http://property-value-estimator:8001`, `http://property-market-analysis:8080`.
- Direct host access (local dev): `localhost:8000` / `8001` / `8080` / `3000`.
- Standalone `docker run` of Task 1 always uses `-p 8000:8000` (README corrected). **Must NOT occupy 8001 / 8080 / 3000**.

---

## 4. API Contract Overview

### 4.1 App 1 Python Backend (`service_property_value_estimator`, Port 8001)

**`POST /api/estimator/predict`**
- Request: 7 fields (Pydantic schema mirrors Task 1 exactly; 422 on invalid input).
- Flow: Pydantic validation → call Task 1 `POST /predict` → compute `price_per_sqft` → write SQLite → return.
- Response:
```json
{
  "predicted_price": 265975.0,
  "price_per_sqft": 132.99,
  "price_stats": { "min": 160000.0, "median": 245000.0, "mean": 264600.0, "max": 410000.0 },
  "record": { "id": 1, "square_footage": 2000, "created_at": "2026-11-20T12:00:00Z" }
}
```

**`GET /api/estimator/history`**
- Response: array of history records ordered by `created_at DESC` (includes 7 features + predicted_price + price_per_sqft + created_at).

> `price_stats` is precomputed from the CSV at startup and kept in memory, so one frontend request renders both chart and result table (no second endpoint needed).

### 4.2 App 2 Java Backend (`service_property_market_analysis`, Port 8080)

**`POST /api/market/analyze`**
- Request: only 7-dimension filter conditions (discrete fields: multi-select value lists; continuous fields: multi-select **bucket key lists**, same source as `§6.1` bucket boundaries). Detail table is **not paginated, sorting done client-side** — backend provides no sort/pagination parameters.
- Response:
```json
{
  "charts": [
    { "dimension": "bedrooms", "buckets": [ { "key":"2","label":"2","order":1,"count":12,"avgPrice":205000.0,"avgPricePerSqft":148.2 } ] },
    { "dimension": "year_built", "buckets": [] }
  ],
  "records": [ { "id":1, "price":185000.0, "pricePerSqft":148.0 } ]
}
```

**`POST /api/market/what-if`**
- Request: `{ "baseline": {7 fields}, "modified": {7 fields} }`.
- Flow: use `RestClient` to call Task 1 `POST /predict/batch` with `houses = [baseline, modified]`.
- Response: `{ "baselinePrice": ..., "modifiedPrice": ..., "deltaPrice": ..., "deltaPercent": ... }`. The actual sale price is **not** returned here — the frontend takes it from the current detail row (`records[].price` from `/api/market/analyze`) as a reference column.

### 4.3 Portal (`web_portal`, Port 3000)

- Pages: `/` (entry/nav cards), `/estimator`, `/market`.
- Forwarding: `/api/estimator/*` → Python 8001; `/api/market/*` → Java 8080 (Next.js `rewrites`, 1:1 pass-through).
- RSC server-side prefetch: Server Components call the backend internal-network addresses directly (`PY_BACKEND_URL` / `JAVA_BACKEND_URL`) — no CORS issues server-side.

---

## 5. Phased Execution Plan

### Phase 0: Scaffolding & Frontend Cleanup (est. 0.5 day)

| Step | Content | Deliverable / Acceptance |
| --- | --- | --- |
| 0.1 | Fix Task 1 README validation-boundary table (align with `models.py`) | One small commit, README table correct |
| 0.2 | Scaffold the three Task 2 directories (py / java / portal) | Empty project compiles and runs a hello version |
| 0.3 | Write root `docker-compose.yml` skeleton (Task 1 + network only) | `docker compose up` brings up Task 1 |

**Acceptance**: Task 1 container reachable via compose internal-network address `http://task1-ml-api:8000/health`.

---

### Phase 1: App 1 Python Backend (`service_property_value_estimator`)

| Step | Content | Key Implementation Points |
| --- | --- | --- |
| 1.1 | `pyproject.toml` + `Dockerfile` | Deps: fastapi, uvicorn, pydantic, httpx, pandas; dev: pytest, ruff. Image: python:3.12-slim |
| 1.2 | `src/schemas.py` | 7-field Pydantic, boundaries identical to Task 1 models.py |
| 1.3 | `src/db.py` | Single SQLite table `estimates` (columns per technical design), stdlib `sqlite3`, create table at startup |
| 1.4 | `src/stats.py` | Read CSV at startup (strip BOM), precompute min/median/mean/max of price, keep in memory |
| 1.5 | `src/client.py` | `httpx` wrapper calling Task 1 `POST /predict` (`MODEL_API_URL` env var, timeout + error handling) |
| 1.6 | `src/main.py` | Implement `POST /api/estimator/predict`, `GET /api/estimator/history`; lifespan loads stats + creates table; 422 friendly errors |
| 1.7 | Unit tests + manual verification | pytest covers validation / stats computation / SQLite writes; curl smoke-test response contract |

**Acceptance**: Start locally with `MODEL_API_URL=http://localhost:8000`. `POST /api/estimator/predict` returns predicted_price + price_per_sqft + price_stats + record; `GET /history` includes new records.

---

### Phase 2: App 2 Java Backend (`service_property_market_analysis`)

| Step | Content | Key Implementation Points |
| --- | --- | --- |
| 2.1 | Maven + `pom.xml` | Spring Boot 3.4.4 (parent), Java 21, spring-boot-starter-web, spring-boot-starter-cache + caffeine, opencsv (or commons-csv) |
| 2.2 | `HouseRecord` model + data loading | `@PostConstruct` reads CSV (strip `\uFEFF`), precomputes `pricePerSqft`, stores in immutable in-memory list |
| 2.3 | Bucket definitions | Per `§6` fixed boundaries (discrete = unique values; continuous = predefined intervals). Each bucket contains key/label/order/count/avgPrice/avgPricePerSqft |
| 2.4 | `MarketService` aggregation | Filter by 7 dimensions → group and aggregate per dimension; buckets with no data return null/0 |
| 2.5 | `AnalyzeController` | `POST /api/market/analyze`, returns charts + records; accepts sort field / direction |
| 2.6 | `WhatIfController` | `POST /api/market/what-if`, uses `RestClient` to call Task 1 `/predict/batch`, computes deltaPrice/deltaPercent |
| 2.7 | Caching | `@EnableCaching` + `@Cacheable` on analyze results (key = normalized filter conditions) |
| 2.8 | Config + tests | `MODEL_API_URL`, `application.yml`; JUnit/integration tests covering aggregation and what-if |

**Acceptance**: Start locally. `POST /api/market/analyze` returns 7-dimension charts + detail records; `POST /api/market/what-if` returns delta; repeated filter hits the cache.

---

### Phase 3: Next.js Portal Frontend (`web_portal`)

| Step | Content | Key Implementation Points |
| --- | --- | --- |
| 3.1 | Scaffolding | `create-next-app` (TS + Tailwind + App Router); install TanStack Query, React Hook Form, @hookform/resolvers, zod, recharts, jspdf + jspdf-autotable |
| 3.2 | Layout & design system | `layout.tsx` top-bar nav (estimator/market); Tailwind design tokens; `loading.tsx`/`error.tsx` global fallback |
| 3.3 | `lib/api.ts` + `lib/export.ts` | API wrapper (fetch + timeout + unified errors); CSV (Blob + UTF-8 BOM) and PDF (jspdf-autotable) export |
| 3.4 | `lib/hooks/*` | useDebouncedValue / useEstimatorHistory / useMarketAnalysis / useWhatIf / useFocusTrap |
| 3.5 | App 1 pages | `estimator/page.tsx` (RSC prefetch history); EstimatorForm (RHF+Zod); EstimateResult + ResultChart (distribution reference + highlighted prediction); HistoryTable + CompareModal (transposed comparison) |
| 3.6 | App 2 pages | `market/page.tsx` (RSC prefetch initial aggregate); FilterBar (controlled + debounced, global 7-dimension filter); ComposedChartGrid (7 bar+line combo charts, dual Y-axes); MarketTable (reuses global filter, client-side sort, CSV/PDF export, What-if button); WhatIfDrawer |
| 3.7 | State management & transitions | QueryClient injects initialData; View Transitions for page changes; `prefers-reduced-motion` degradation |
| 3.8 | Accessibility | Label association, focus states, focus trap + Esc, WCAG 2.1 AA contrast |

**Acceptance**: `/estimator` full loop (fill → submit → chart + table → history → compare); `/market` full loop (filter → 7 charts + detail → export → What-if).

---

### Phase 4: Docker Compose Orchestration & Integration

> Each service **keeps its own Dockerfile** (microservice standard, buildable/deployable independently). `docker-compose.yml` is the **local test/demo** orchestration layer — one-off image build, internal network, brings up 4 services. The two complement, do not conflict.

| Step | Content | Key Implementation Points |
| --- | --- | --- |
| 4.1 | One Dockerfile per Task 2 service | Python: uv/pip deps; Java: multi-stage build (maven→jre); Next.js: standalone output |
| 4.2 | Complete `docker-compose.yml` | 4 services + internal network; env vars MODEL_API_URL/PY_BACKEND_URL/JAVA_BACKEND_URL; Python mount SQLite data volume |
| 4.3 | Integration | After `docker compose up`, browser http://localhost:3000 runs full flows for both apps |
| 4.4 | Dependency health checks | Task 1 exposes `/ready` as readiness; backends start in dependency order |

**Acceptance**: One-command startup — no local Python/Java/Node install needed for a full demo.

---

### Phase 5: Acceptance & Demo Prep

| Step | Content |
| --- | --- |
| 5.1 | Walk through PDF (§2 checklist + Technical Requirements) item by item, confirm no gaps |
| 5.2 | Walk the demo script: valuation → history compare → market filter → What-if → export |
| 5.3 | Push to GitHub (4 service source + Dockerfiles + compose) |

---

## 6. Key Design Decision Quick Reference

### 6.1 Bucket Boundaries (based on actual 50-row distribution, balanced buckets, stable X-axis)

| Dimension | Bucketing Rule | Notes |
| --- | --- | --- |
| bedrooms | Discrete `2 / 3 / 4` | Unique values |
| bathrooms | Discrete `1.0 / 1.5 / 2.0 / 2.5 / 3.0` | Unique values |
| year_built | `1978–1989 / 1990–1999 / 2000–2012` | 10-year decades |
| square_footage | `<1350 / 1350–1700 / 1700–2050 / >2050` | Quartile-based |
| lot_size | `<5800 / 5800–7200 / 7200–9000 / >9000` | Quartile-based |
| distance_to_city_center | `<3.2 / 3.2–4.5 / 4.5–6.5 / >6.5` | Quartile-based |
| school_rating | `<7.2 / 7.2–7.8 / 7.8–8.5 / >8.5` | Quartile-based |

### 6.2 Tech Stack & Ports

| Item | Choice |
| --- | --- |
| Frontend data fetching | RSC initial load + TanStack Query (initialData injected) |
| Forms | React Hook Form + Zod (aligned with Pydantic) |
| Styling / motion | Tailwind design tokens + View Transitions + `prefers-reduced-motion` |
| Charts | Recharts (bar+line combo, independent dual Y-axes) |
| Export | Frontend: CSV (Blob+BOM), PDF (jspdf-autotable) |
| Java HTTP | Spring 6 `RestClient` (batch calls to Task 1) |
| Java caching | Spring Cache + Caffeine |

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Task 1 README boundary table doesn't match reality | Misleads subsequent development | Fix in Phase 0.1; treat models.py as source of truth |
| BOM in first CSV column causes Java parse failure | Field misalignment / parse error | Strip `\uFEFF` on load (Phase 2.2) |
| Uneven bucket sample sizes | Some chart buckets empty / anomalous | Use `§6.1` quartile boundaries; empty buckets return null and render gracefully |
| Client-side PDF export styling hard to control | Poor export UX | jspdf-autotable with fixed table styles; consistent title/headers |
| Service network addresses differ between host and container | Integration failure | All addresses from env vars + compose internal aliases |
| Next.js standalone build size / memory | Slow container startup | Standalone output + multi-stage build for slim image |

---

## 8. Final Acceptance Criteria

- [ ] `docker compose up` brings up all 4 services with one command; `http://localhost:3000` opens the unified portal
- [ ] `/estimator`: 7-field form validation (frontend/backend semantics match), submit returns predicted value + distribution reference chart (prediction highlighted) + same-reference table; history persisted; multi-select compare modal shows transposed layout
- [ ] `/market`: 7 global filters drive refresh of all 7 "bar+line" combo charts + detail table; table not paginated, reuses global filter, client-side column sort; CSV and PDF export work; each row What-if returns delta and percent change
- [ ] Layout-level loading/error fallback active, no page crashes; accessibility meets WCAG 2.1 AA (labels, focus, focus trap, Esc)
- [ ] Every Portal Structure + Technical Requirements item from the PDF has a corresponding implementation — no gaps
- [ ] Source + Dockerfiles + compose pushed to GitHub; Swagger and full browser demo available on-site