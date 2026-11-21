Below is the **Task 2 Technical Design**, fully aligned with the **product design** document above. (Task 1 model-inference service is already complete; this document focuses on the Next.js portal, the Python FastAPI backend, the Java 21 + Spring Boot 3.4.4 backend, and containerized integration.)

---

# Task 2 Technical Design: Unified Property Intelligence Portal (Next.js Portal)

## 1. Overall Architecture & Request Flow

### 1.1 Service Topology & Port Allocation

A lightweight architecture of "single portal entry + edge-path forwarding + two independent backends + Task 1 inference service" — fits the interview-demo positioning while keeping service boundaries crisp:

```text
                        ┌──────────────────────────────────────────────┐
                        │               Browser Client                 │
                        └──────────────────────┬───────────────────────┘
                                               │ http://localhost:3000
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     Next.js Portal (Port 3000, App Router)                      │
│  ├─ Pages: /estimator (App 1)  |  /market (App 2)                                │
│  └─ Edge Forwarding (/api/*):                                                    │
│       ├─ /api/estimator/**  ──► Python FastAPI Backend (Port 8001)               │
│       └─ /api/market/**     ──► Java Spring Boot Backend (Port 8080)             │
└───────────────────────────┬──────────────────────────────────┬───────────────────┘
                            │                                  │
                            ▼                                  ▼
         ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
         │  App 1 Backend (Python / FastAPI) │   │ App 2 Backend (Java 21 / SB 3.4) │
         │  - Validation & predict forwarding│   │ - 7-dimension filter + bucket    │
         │  - SQLite history read/write       │   │   aggregation                   │
         │                                    │   │ - Cache optimization             │
         └──────────────────┬───────────────┘   └──────────────────┬───────────────┘
                            │                                      │
                            │       HTTP POST /predict             │
                            └──────────────────┬───────────────────┘
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │     Task 1: ML Model Service (Port 8000)     │
                        │     FastAPI + Scikit-learn (ready)            │
                        └──────────────────────────────────────────────┘

```

### 1.2 Core Design Constraints

* **Single same-origin entry**: The browser only hits `http://localhost:3000`. Next.js `rewrites` (or Route Handlers) forward `/api/estimator/*` and `/api/market/*` to their respective backends — no browser-side multi-port CORS hassle.
* **Determinism & low overhead**:
* All backend↔model-service timestamps use absolute ISO-8601 / Unix seconds or milliseconds, avoiding timezone drift.
* History store: single-file SQLite — no heavy DB or middleware required.

---

## 2. Backend Service Design

### 2.1 App 1 Backend: Python + FastAPI (Port 8001)

#### (1) Data Model (SQLite)

A single `estimates` table holds valuation history (no "clear" endpoint; accumulates over service lifetime; containerized, mount a Volume to persist the `.db` file):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Primary key |
| `square_footage` | `INTEGER` | Square footage |
| `bedrooms` | `INTEGER` | Bedroom count |
| `bathrooms` | `REAL` | Bathroom count |
| `year_built` | `INTEGER` | Year built |
| `lot_size` | `INTEGER` | Lot size |
| `distance_to_city_center` | `REAL` | Distance to city center |
| `school_rating` | `REAL` | School rating |
| `predicted_price` | `REAL` | Predicted total price |
| `price_per_sqft` | `REAL` | Derived avg price per sq ft (`predicted_price / square_footage`) |
| `created_at` | `TEXT` | UTC ISO-8601 timestamp |

> At startup, read `House Price Dataset.csv`, precompute Min / Median / Mean / Max of `price`, keep in memory, and return them alongside each `POST /predict` response — the frontend gets everything it needs to render both the chart and the result table in a single request (no extra stats endpoint).

#### (2) Core API Contract

* **`POST /api/estimator/predict`**
* **Request body**: 7 property-feature fields (Pydantic handles type and range validation; `422` on invalid input).
* **Flow**:
1. Validation passes → call Task 1 `POST /predict` to get `predicted_price`.
2. Compute `price_per_sqft = predicted_price / square_footage`.
3. Insert into the SQLite `estimates` table.
4. Return `predicted_price`, `price_per_sqft`, `price_stats` (the precomputed distribution statistics), and the newly created history record — **one frontend request renders both chart and result table simultaneously**.

* **`GET /api/estimator/history`**
* **Flow**: Query SQLite `estimates` ordered by `id DESC` (or `created_at DESC`).
* **Response body**: Array of history records, ready for the frontend history list and multi-select comparison (transposed rows ↔ columns).

---

### 2.2 App 2 Backend: Java 21 + Spring Boot 3.4.4 (Port 8080)

#### (1) In-Memory Dataset & 7-Dimension Fixed Bucketing

At startup (`@PostConstruct`), read the CSV dataset once into an immutable in-memory list. Note the first column contains a UTF-8 BOM — strip `\uFEFF` during parsing. Also precompute a derived field `pricePerSqft = price / squareFootage` for every record.

All 7 dimensions use **predefined fixed grouping/bucket boundaries**. The same set of buckets is used as both the chart X-axis labels and the filter dropdown segment options — guaranteeing stable X-axis labels and ordering across filter changes:

1. `bedrooms`: group by actual discrete values (e.g. `2`, `3`, `4`).
2. `bathrooms`: group by actual discrete values (e.g. `1.0`, `1.5`, `2.0`, `2.5`, `3.0`).
3. `year_built`: group into 10-year decades (`1978-1989`, `1990-1999`, `2000-2012`).
4. `square_footage`: fixed-interval buckets (e.g. `<1350`, `1350-1700`, `1700-2050`, `>2050`).
5. `lot_size`: fixed-interval buckets (e.g. `<5800`, `5800-7200`, `7200-9000`, `>9000`).
6. `distance_to_city_center`: fixed-interval buckets (e.g. `<3.2`, `3.2-4.5`, `4.5-6.5`, `>6.5`).
7. `school_rating`: fixed-interval buckets (e.g. `<7.2`, `7.2-7.8`, `7.8-8.5`, `>8.5`).

> The above bucket boundaries are final (same as `plan.md §6.1`), derived from the dataset's actual value range and quantiles — balanced bucket sizes guarantee stable X-axis labels and ordering.

Each bucket emits:

* `key` / `label` / `order`: bucket identifier, display text, sort index.
* `count`: number of records in this bucket matching the current filter.
* `avgPrice`: mean of `price` over records in this bucket (left Y-axis; `null` or `0` when empty).
* `avgPricePerSqft`: mean of `pricePerSqft` over records in this bucket (right Y-axis; `null` or `0` when empty).

#### (2) Caching & Core API Contract

* **Caching strategy**: Enable Spring Cache (e.g. Caffeine or the default in-memory cache). Add `@Cacheable` on the high-frequency filtered aggregate query. The cache key is derived from the normalized 7-dimension filter conditions, avoiding repeated filtering and aggregation computation.
* **`POST /api/market/analyze`**
* **Request body**: only 7-dimension filter conditions (discrete fields: multi-select value lists; continuous fields: multi-select **bucket key lists**, same source as the bucketing boundaries above). The detail table is **not paginated, sorting done client-side** — the backend provides no sort or pagination parameters.
* **Response body**:
* `charts`: array of per-dimension grouped-aggregation data (each dimension containing ordered `buckets`).
* `records`: list of property detail records matching the filter.

* **`POST /api/market/what-if`**
* **Request body**: `baseline` (7 baseline features) and `modified` (7 modified features).
* **Flow**: use Spring Boot 3.4 `RestClient` to call Task 1 `POST /predict/batch` once with `houses = [baseline, modified]`, get both predictions back, compute `deltaPrice` and `deltaPercent`.
* **Response body**: returns `baselinePrice`, `modifiedPrice`, `deltaPrice`, `deltaPercent`. The actual sale price is **not** returned here — the frontend takes it from the current detail row (`records[].price` from `/api/market/analyze`) as a reference column.

---

## 3. Frontend Architecture: Next.js App Router (Port 3000)

### 3.1 Routes & Component Layering

```text
src/
├── app/
│   ├── layout.tsx              # Shared top-bar nav (/estimator, /market), styles, global error boundary (Server Component)
│   ├── loading.tsx             # Global loading skeleton
│   ├── error.tsx               # Global error fallback
│   ├── page.tsx                # Portal entry (can redirect to /estimator or show dual-app nav cards)
│   ├── estimator/
│   │   ├── page.tsx            # App 1 page shell (RSC: server-side prefetch of history, wrapped in Suspense)
│   │   ├── loading.tsx
│   │   └── error.tsx
│   └── market/
│       ├── page.tsx            # App 2 page shell (RSC: server-side prefetch of initial aggregate + detail, wrapped in Suspense)
│       ├── loading.tsx
│       └── error.tsx
├── components/
│   ├── estimator/
│   │   ├── EstimatorForm.tsx   # 7-feature form + RHF/Zod validation + quick-fill example
│   │   ├── EstimateResult.tsx  # Result container: ResultChart + same-reference result table
│   │   ├── ResultChart.tsx     # Bar/scatter: dataset Min/Median/Mean/Max + highlighted prediction (Recharts)
│   │   ├── HistoryTable.tsx    # History list + multi-select checkboxes + compare trigger button
│   │   └── CompareModal.tsx    # Transposed compare modal/drawer (each record = one column, each feature/result = one row)
│   └── market/
│       ├── FilterBar.tsx       # 7-dimension multi-select segmented filter + reset button (controlled + debounced)
│       ├── ComposedChartGrid.tsx # Grid of 7 "bar+line" combo charts (bars = avg price / left axis; line = avg price/sqft / right axis)
│       ├── MarketTable.tsx     # Global-filter-reused detail table, client-side sort + CSV/PDF export + per-row What-if button
│       └── WhatIfDrawer.tsx    # On-demand What-if drawer/modal (baseline vs modified comparison only, no export)
└── lib/
    ├── api.ts                  # Wrapper for /api/estimator/* and /api/market/* with error handling
    ├── export.ts               # CSV (UTF-8 BOM) + PDF export utility functions
    └── hooks/
        ├── useDebouncedValue.ts   # Filter debounce
        ├── useEstimatorHistory.ts # App 1 history + compare-selection state
        ├── useMarketAnalysis.ts   # App 2 filter → aggregate query
        ├── useWhatIf.ts           # What-if simulation mutation
        └── useFocusTrap.ts        # Overlay focus trap + Esc-to-close

```

### 3.2 Key Interactions & Engineering Details

* **App 1 interaction loop**:
* Client-side field validation before submit → call `/api/estimator/predict` → refresh `GET /api/estimator/history`.
* **Result display**: A result card highlights the **Predicted Price**; directly below it, a **same-reference result table** shows Predicted Price, Price / SqFt (predicted price ÷ square footage), and the dataset distribution reference (Min / Median / Mean / Max); `ResultChart` uses a bar/scatter chart to place the prediction alongside the same distribution reference (prediction highlighted).
* **Side-by-side comparison**: Check multiple history records (enable Compare button once ≥ 2 selected), click Compare to open a Modal/Drawer that transposes the selected records: "columns = records; rows = 7 features + predicted price + price per sq ft".

* **App 2 interaction loop**:
* Changes to any of the 7 global filters trigger `/api/market/analyze`, which synchronously refreshes all 7 dual-Y-axis charts (bars map left Y-axis to avg price; line maps right Y-axis to avg price/sqft; tooltip also shows sample count) and the detail table below.
* The detail table **reuses the global filter** (no independent filtering controls, no pagination), supports **client-side column sorting** and **CSV / PDF export**. Each row has a `What-if` button that loads that row's parameters and opens a drawer/modal; after parameter changes, call `/api/market/what-if` to show the comparison (no What-if export).

* **Error handling & accessibility**:
* All form controls bound to `<label>`, keyboard focus states preserved with clear contrast; interface errors or timeouts surface as inline state hints or via `error.tsx` — never crash the page.

### 3.3 Data-Fetch Strategy & State Management (aligns with PDF Technical Requirements 1.c/d, 3.a/c/d)

* **RSC initial data load (Server Components)**: `estimator/page.tsx` and `market/page.tsx` are Server Components that call the backend internal-network addresses directly from the server (no CORS concerns) — prefetch first-screen data: App 1 history, App 2 initial aggregate + detail. Use `<Suspense>` + `loading.tsx` for skeleton, `error.tsx` as fallback. First-screen data serializes into the RSC payload, reducing first-frame requests and white-screen time on the client.
* **Subsequent client-side fetches (TanStack Query)**: On mount, inject the RSC-prefetched results as `initialData` into `QueryClient`. All subsequent filter changes, form submissions, and history refreshes go through TanStack Query (`useQuery` / `useMutation`) — request de-duplication and caching, `staleTime` control, standardized loading/error/data states, retry on failure, and cache invalidation (`invalidateQueries`).
* **Server state vs. client UI state layering**:
* **Server state** (history, aggregates, predictions): managed uniformly by TanStack Query.
* **Client UI state** (overlay open/close, checkboxes, temporary filter values): local React `useState` / `useReducer`, never mixed into the server cache.
* **Form state**: React Hook Form (next section).
* **API communication & error state**: All requests go through the `lib/api.ts` unified wrapper (fetch base + timeout + JSON parse + unified error object), error messages mapped to readable text; components show inline hints via TanStack Query's `isError` / `error`, page-level errors are caught by the `error.tsx` boundary.

### 3.4 Form Validation & Custom Hooks (aligns with PDF Technical Requirements 1.e, 3.b)

* **Forms (App 1)**: `EstimatorForm.tsx` uses React Hook Form + Zod Resolver. The Zod schema's 7-field boundaries match the backend Pydantic schema exactly (see product design validation table). `formState.errors` drives per-field error tips; `isValid` controls submit-button disabled state, preventing invalid requests.
* **Custom Hooks (`lib/hooks/`, shared logic extracted)**:
* `useDebouncedValue`: filter debounce for App 2, reducing `/api/market/analyze` firing frequency.
* `useEstimatorHistory`: wraps `GET /api/estimator/history` `useQuery` + compare-selection state.
* `useMarketAnalysis`: wraps the filter → `/api/market/analyze` `useQuery`, managing filter parameters and response.
* `useWhatIf`: wraps `/api/market/what-if` `useMutation`, managing drawer open/close and simulation result.
* `useFocusTrap`: overlay focus trap + `Esc`-to-close (supports WCAG 2.1 AA).

### 3.5 Styling, Motion & Design System (aligns with PDF Technical Requirements 2.a/d/e and Portal 1.c)

* **Tailwind CSS responsive layout**: Global Tailwind design tokens (color palette / spacing / radii / shadows / fonts) defined centrally, shared by both sub-applications for a consistent visual. Grid uses `grid-cols-*` + `sm/md/lg/xl` breakpoints for mobile-to-desktop responsiveness (e.g. 7 charts as `grid-cols-1` → `md:grid-cols-2` → `xl:grid-cols-3`).
* **Smooth transitions**: Page-to-page transitions via Next.js View Transitions API; in-app state transitions (overlay open/close, chart update, skeleton → content) via CSS transition/animation + Recharts animations, with `prefers-reduced-motion` degradation respected.

---

## 4. Project Directory & Deployment Orchestration

```text
├── service_house_price_predictor/      # Done (Task 1, FastAPI + Scikit-learn + Dockerfile)
├── service_property_value_estimator/   # FastAPI + SQLite + Dockerfile (8001)
├── service_property_market_analysis/   # Java 21 + Spring Boot 3.4.4 + Dockerfile (8080)
├── web_portal/                         # Next.js App Router + Tailwind + Dockerfile (3000)
└── docker-compose.yml                  # Local test/demo orchestration: build images + internal network + SQLite data volume

```

* Configure the inter-service internal-network addresses in `docker-compose.yml` (e.g. `MODEL_API_URL=http://task1-ml-api:8000`, `PY_BACKEND_URL=http://property-value-estimator:8001`, `JAVA_BACKEND_URL=http://property-market-analysis:8080`), and mount a data directory for the Python backend to persist the SQLite file — enabling one-command startup and full end-to-end integration.