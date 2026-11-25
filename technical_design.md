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

---

## 5. Observability Protocol — Unified Logging & Metrics

> This section defines the **canonical observability protocol** for all four services. Every service MUST conform to this specification regardless of language/framework. The goal is a single Prometheus scrape endpoint that produces identical metric names/labels across Python, Java, and Node.js, and stdout JSON logs that a Loki/ELK pipeline can parse with one regex.

### 5.1 Architecture Overview

```
                      ┌─────────────────────────────────────────────────────────────────┐
                      │                     Observability Backend Layer                  │
                      │                                                                 │
                      │   ┌────────────────────┐    ┌────────────────────────────────┐   │
                      │   │   Prometheus        │    │   Loki (or ELK / CloudWatch)    │   │
                      │   │   scrape ───────────│    │   container log driver collects │   │
                      │   └──────────┬─────────┘    └──────────────┬─────────────────┘   │
                      │              │                               │                     │
                      │   ┌──────────▼─────────┐    ┌──────────────▼─────────────────┐   │
                      │   │   Grafana Dashboard │    │   LogQL / Kibana / CloudWatch   │   │
                      │   │   (single datasource)│   │   Query                          │   │
                      │   └────────────────────┘    └────────────────────────────────┘   │
                      └────────────────────────┬────────────────────────────────────────┘
                                               │ scrape / collect
        ┌──────────────────────────────────────┼──────────────────────────────────────┐
        │                                      │                                      │
        ▼                                      ▼                                      ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │ task1-ml-api │    │  estimator   │    │  java-svc    │    │  web-portal  │
   │  Python 3.12 │    │  Python 3.12 │    │  Java 21     │    │  Node.js     │
   │  FastAPI     │    │  FastAPI     │    │  Spring Boot │    │  Next.js     │
   │              │    │              │    │  3.4.4       │    │  16          │
   │ /metrics     │    │ /metrics     │    │ /metrics     │    │ /metrics     │
   │ stdout JSON  │    │ stdout JSON  │    │ stdout JSON  │    │ stdout JSON  │
   └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

   All services → Docker container stdout → docker logs driver → Loki/ELK collector
   All services → native Prometheus client → /metrics endpoint → Prometheus scrape
```

### 5.2 Metric Protocol

#### 5.2.1 Canonical Metric Definitions (Prometheus Text Format)

Every service MUST expose exactly these two metrics at its `/metrics` endpoint. No other application-defined metrics are required at this stage (business-specific metrics can be added later under their own namespace).

| Metric Name | Type | Description |
|-------------|------|-------------|
| `http_requests_total` | Counter (monotonically increasing) | Total number of HTTP requests processed |
| `http_request_duration_seconds` | Histogram | HTTP request latency in seconds, with built-in `_count`, `_sum`, and `_bucket{le="..."}` series |

#### 5.2.2 Canonical Label (Tag) Set

Both metrics MUST carry exactly the following four labels, in this order. No extras, no omissions.

| Label Name | Value Format | Example | Notes |
|------------|--------------|---------|-------|
| `service` | Fixed string | `"property-market-analysis"` | Must match the service identifier in `docker-compose.yml` service name |
| `endpoint` | URL path template | `"/api/estimator/predict"` or `"/api/market/analyze"` | NOT the raw request URI with query strings. Use the route pattern that matches the request (no `/api/estimator/predict?foo=bar`) |
| `method` | Uppercase HTTP verb | `"GET"`, `"POST"` | |
| `status_code` | String of exact HTTP status | `"200"`, `"422"`, `"500"` | **Must be the raw status code, NOT grouped into `"2xx"` / `"5xx"`**. This enables flexible PromQL slicing: success-rate, client-error vs server-error, etc. |

**Rationale for exact vs grouped status_code:** Grouping loses information. With exact codes you can write:
```promql
# 5xx error rate only (server-side problems)
sum by (service) (rate(http_requests_total{status_code=~"5.."}[5m]))
/ sum by (service) (rate(http_requests_total[5m]))

# 4xx rate (client input validation failures)
sum by (service) (rate(http_requests_total{status_code=~"4.."}[5m]))
/ sum by (service) (rate(http_requests_total[5m]))

# P99 latency for 5xx responses (are timeouts causing failures?)
histogram_quantile(0.99, sum by (endpoint, le) (rate(http_request_duration_seconds{status_code=~"5.."}[5m])))
```

#### 5.2.3 Canonical Histogram Buckets

All three implementations MUST use identical bucket boundaries so that Prometheus `histogram_quantile()` produces comparable results across services.

```python
# Buckets in seconds (Prometheus default + a few extra for ML inference scenarios)
[0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0, 30.0, 60.0]
```

Plus the obligatory `le="+Inf"` bucket added by every Prometheus client library.

#### 5.2.4 Expected `/metrics` Output Shape

```text
# HELP http_requests_total Total number of HTTP requests processed
# TYPE http_requests_total counter
http_requests_total{service="task1-ml-api",endpoint="/predict",method="POST",status_code="200"} 1523
http_requests_total{service="task1-ml-api",endpoint="/predict",method="POST",status_code="500"} 17
http_requests_total{service="task1-ml-api",endpoint="/health",method="GET",status_code="200"} 4521

# HELP http_request_duration_seconds HTTP request latency in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{service="task1-ml-api",endpoint="/predict",method="POST",status_code="200",le="0.1"} 800
http_request_duration_seconds_bucket{service="task1-ml-api",endpoint="/predict",method="POST",status_code="200",le="0.5"} 1400
http_request_duration_seconds_bucket{service="task1-ml-api",endpoint="/predict",method="POST",status_code="200",le="+Inf"} 1523
http_request_duration_seconds_count{service="task1-ml-api",endpoint="/predict",method="POST",status_code="200"} 1523
http_request_duration_seconds_sum{service="task1-ml-api",endpoint="/predict",method="POST",status_code="200"} 61.2
```

### 5.3 Metric Implementation Feasibility by Framework

This is the critical analysis: can each framework produce **identical** metric names, label names, and label values as defined above?

#### 5.3.1 Python FastAPI — ✅ Fully Aligned

**Library:** `prometheus-fastapi-instrumentator` v8.x (wraps `prometheus_client` v0.26)

**Default behavior:** The library already defaults to `http_requests_total` (Counter) and `http_request_duration_seconds` (Histogram). However, its default labels use `handler` instead of `endpoint`, and `should_group_status_codes=True` produces `"2xx"` instead of `"200"`.

**Alignment configuration (verified by reading source):**
```python
Instrumentator(
    should_group_status_codes=False,          # ← critical: "200" not "2xx"
    should_ignore_untemplated=True,
    excluded_handlers=["/docs", "/redoc", "/openapi.json"],
).add(
    requests(
        metric_name="http_requests_total",
        should_include_handler=True,          # becomes our "endpoint"
        should_include_method=True,
        should_include_status=True,
        custom_labels={"service": "task1-ml-api"},  # ← add service label
    ),
    latency(
        metric_name="http_request_duration_seconds",
        should_include_handler=True,
        should_include_method=True,
        should_include_status=True,
        custom_labels={"service": "task1-ml-api"},
        buckets=(0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0, 30.0, 60.0),
    ),
).instrument(app).expose(app)
```

**Label name remapping problem:** The library hardcodes `handler` as the label name. We need `endpoint`. Two solutions:
- **Solution A (recommended):** Use `MeterFilter`... no wait, this is Python. Actually `prometheus_fastapi_instrumentator` v8 passes label names directly to `prometheus_client.Counter(labelnames=[...])`, and the label names are `("handler", "method", "status")` by default. We need to patch this.
- **Solution B:** Write our own tiny middleware using raw `prometheus_client.Counter` and `prometheus_client.Histogram` — about 30 lines of code, no dependency magic.

**Decision:** Use **Solution B** (raw prometheus_client). The library is convenient but inflexible on label names. Writing a middleware is trivial and gives us exact control.

#### 5.3.2 Java Spring Boot — ✅ Fully Aligned (with native Prometheus client)

**Problem with Micrometer (the default):** Spring Boot Actuator + `micrometer-registry-prometheus` produces **different metric names and label names** from our canonical spec by default:

| Aspect | Micrometer default | Our canonical spec |
|--------|-------------------|-------------------|
| Counter name | `http_server_requests_seconds_count` (Timer auto-split) | `http_requests_total` |
| Histogram name | `http_server_requests_seconds_bucket` (Timer auto-split) | `http_request_duration_seconds_bucket` |
| Endpoint label | `uri` | `endpoint` |
| Service label | ❌ missing | `service` |
| Extra labels | `outcome`, `exception` | ❌ not allowed |

Micrometer does support `MeterFilter.renameTag()` and custom `NamingConvention`, but **it cannot split a Timer into separate Counter + Histogram with arbitrary names**. The naming transformation (`http.server.requests` → `http_server_requests_seconds_count`) is baked into Micrometer's Prometheus naming convention.

**Solution — Use `prometheus-client_java` directly alongside Actuator:**

Add to `pom.xml`:
```xml
<dependency>
    <groupId>io.prometheus</groupId>
    <artifactId>simpleclient</artifactId>
    <version>0.16.0</version>
</dependency>
<dependency>
    <groupId>io.prometheus</groupId>
    <artifactId>simpleclient_common</artifactId>
    <version>0.16.0</version>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

Then write a `OncePerRequestFilter` (~40 lines) that:
1. Records `method`, `endpoint` (from `HandlerMapping` lookup or URI template pattern), `status_code`, `service`
2. Observes latency
3. Calls `Counter.build().name("http_requests_total").labelNames("service","endpoint","method","status_code")...inc()`
4. Calls `Histogram.build().name("http_request_duration_seconds").labelNames("service","endpoint","method","status_code")...observe(seconds)`

Then expose `/actuator/prometheus` (Actuator auto-configures this endpoint when the dependency is present) or a dedicated `/metrics` controller. The `PrometheusRegistry.defaultRegistry` will contain both Micrometer auto-metrics (JVM memory, threads, etc.) and our manually registered HTTP metrics — but we configure `management.endpoints.web.exposure.include=prometheus` and optionally filter Micrometer's HTTP auto-metric out if needed.

**Alternative (simpler, less precise):** Keep Micrometer HTTP metrics as-is and add Prometheus recording rules in Prometheus config to rename:
```yaml
groups:
  - name: http_metrics_renamed
    rules:
      - record: http_requests_total
        expr: sum by (uri, method, status) (http_server_requests_seconds_count)
        labels:
          service: "property-market-analysis"
          endpoint: "{{ $labels.uri }}"
      - record: http_request_duration_seconds_bucket
        expr: http_server_requests_seconds_bucket
        labels:
          service: "property-market-analysis"
          endpoint: "{{ $labels.uri }}"
```
This is less clean because PromQL can't easily rename labels in recording rules. **We recommend the native client approach.**

#### 5.3.3 Next.js / Node.js — ✅ Fully Aligned

**Library:** `prom-client` (the official Prometheus JS client, v15.x)

Add to `package.json`:
```json
{
  "dependencies": {
    "prom-client": "^15.1.3"
  }
}
```

**Implementation:**
1. Register a `Counter` and `Histogram` at module load time with our canonical names and labels
2. Wrap all server-side fetch calls in middleware that records metrics
3. Expose a `/api/metrics` Route Handler that calls `register.metrics()`

Since Next.js App Router uses Route Handlers, we create `app/api/metrics/route.ts`:
```typescript
import { register } from 'prom-client';
export async function GET() {
  return new Response(await register.metrics(), {
    headers: { 'Content-Type': register.contentType },
  });
}
```

### 5.4 Log Protocol

#### 5.4.1 Canonical JSON Schema

Every service MUST output **one JSON object per log line** to `stdout`. No plain text, no file-based logging, no stderr splitting. Docker's log driver (json-file by default, or fluentd for production) collects everything automatically.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | ISO-8601 string | ✅ | UTC with milliseconds and Z suffix: `"2026-11-25T10:30:00.123Z"` |
| `level` | enum | ✅ | `"DEBUG"` / `"INFO"` / `"WARN"` / `"ERROR"` |
| `service` | string | ✅ | Same identifier as metric `service` label |
| `logger` | string | ✅ | Logger name (Python module, Java class, Node module) |
| `message` | string | ✅ | Human-readable log message |
| `trace_id` | string | ⚠️ | Required when inside a request context. 12-char hex. Absent for startup/shutdown logs |
| `method` | string | ⚠️ | HTTP method, only present for request logs |
| `path` | string | ⚠️ | Raw request path (may include query string), only present for request logs |
| `status_code` | number | ⚠️ | HTTP status code, only present for response logs |
| `latency_ms` | number | ⚠️ | Request latency in milliseconds, only present for response logs |
| `exception` | string | ⚠️ | Full stack trace as string, only present for ERROR logs |

**Example — normal request:**
```json
{"timestamp":"2026-11-25T10:30:00.123Z","level":"INFO","service":"task1-ml-api","logger":"src.main","trace_id":"a1b2c3d4e5f6","method":"POST","path":"/predict","status_code":200,"latency_ms":42.3,"message":"POST /predict status=200 latency_ms=42.3"}
```

**Example — startup log (no trace_id):**
```json
{"timestamp":"2026-11-25T10:30:00.001Z","level":"INFO","service":"task1-ml-api","logger":"src.main","message":"Loaded model=RandomForestRegressor (train_samples=2000, cv_rmse=12500, cv_r2=0.89)"}
```

**Example — error log:**
```json
{"timestamp":"2026-11-25T10:30:00.456Z","level":"ERROR","service":"estimator","logger":"src.main","trace_id":"a1b2c3d4e5f6","method":"POST","path":"/api/estimator/predict","status_code":502,"latency_ms":1503.0,"message":"Model service error: HTTPConnectionPool(host='task1-ml-api', port=8000): Read timed out.","exception":"Traceback (most recent call last):\n  File \"src/client.py\", line 45, in predict\n    response = await self._client.post(...)"}
```

#### 5.4.2 Trace ID Propagation

`trace_id` is a 12-character hex string (sufficiently unique for a single-user request trace, short enough to fit comfortably in log lines and HTTP headers).

**Universal rule — every service does the same thing on every request:**
```
if incoming request has X-Trace-ID header:
    trace_id = header value          // reuse upstream
else:
    trace_id = generate_hex(12)      // we are the first hop, create one
```

No service is privileged. Any service can be the ingress point: `web-portal`, a future LB/Ingress controller, direct curl to any backend, etc. The `trace_id` simply belongs to the request and travels with it, regardless of where it was born.

**Propagation chain (current topology):**
```
Browser → Next.js (no X-Trace-ID → generates abc123def456)
  ├─ POST /api/estimator/predict  header: X-Trace-ID: abc123def456
  │     → Python Estimator (reuses abc123def456; forwards to ML API)
  │           └─ POST /predict  header: X-Trace-ID: abc123def456
  │                 → ML API (reuses abc123def456)
  │
  └─ POST /api/market/analyze  header: X-Trace-ID: abc123def456
        → Java Service (reuses abc123def456; forwards to ML API)
              └─ POST /predict/batch  header: X-Trace-ID: abc123def456
                    → ML API (same abc123def456 — cross-app correlation!)
```

**Propagation chain (future topology with LB in front):**
```
Browser → LB (generates fedcba987654, injects X-Trace-ID)
  ├─ → Next.js (reuses fedcba987654)
  │     → Estimator (reuses fedcba987654) → ML API (reuses fedcba987654)
  │
  └─ → Next.js (reuses fedcba987654)
        → Java Service (reuses fedcba987654) → ML API (reuses fedcba987654)
```
No code changes required when the ingress point moves — the same rule works everywhere.

**Logging middleware responsibility:** Every service must install an HTTP middleware that:
1. On request arrival: check for `X-Trace-ID` header, or generate a new one → store in request context
2. Pass `trace_id` to the structured logger for every log line emitted during that request
3. On outgoing HTTP calls to downstream services: inject `X-Trace-ID` header

### 5.5 Log Implementation Feasibility by Framework

#### 5.5.1 Python FastAPI — ✅ Fully Aligned

**Library:** `logging` (stdlib) with a custom `jsonlogging.JSONFormatter` or a hand-rolled `logging.Formatter`.

**ML API (task1-ml-api) already 90% there:** The existing `_JsonFormatter` in `src/main.py:29-42` already produces JSON per line with `timestamp`, `level`, `logger`, `message`, and optional `request_id` / `exception`. Changes needed:
1. Rename `request_id` → `trace_id`
2. Add `service` field (hardcoded to `"task1-ml-api"` or read from env)
3. Extend middleware to extract/generate `trace_id`, add method/path/status_code/latency_ms fields
4. Inject `X-Trace-ID` header when calling downstream (currently doesn't call downstream; Estimator calls it)

**Estimator (property-value-estimator) needs full implementation:** Currently only has `logging.basicConfig()` with text format. Needs the same JSON formatter + middleware pattern.

**Outgoing `X-Trace-ID` injection:** The Estimator's `ModelClient` (an HTTPX or httpx-based client) adds a default header from context. FastAPI doesn't have a built-in context mechanism for this, but a small Python `ContextVar`-based pattern works cleanly.

#### 5.5.2 Java Spring Boot — ✅ Fully Aligned

**Library:** `ch.qos.logback:logback-classic` (Spring Boot default) with `net.logstash.logback:logstash-logback-encoder` for JSON output.

**pom.xml addition:**
```xml
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>8.0</version>
</dependency>
```

**logback-spring.xml:**
```xml
<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <customFields>{"service":"property-market-analysis"}</customFields>
            <timestampPattern>yyyy-MM-dd'T'HH:mm:ss.SSS'Z'</timestampPattern>
        </encoder>
    </appender>
    <root level="INFO">
        <appender-ref ref="STDOUT"/>
    </root>
</configuration>
```

**Trace ID propagation:** Implement a `javax.servlet.Filter` (or Spring `OncePerRequestFilter`) that:
1. Extracts `X-Trace-ID` from request header, or generates one via `UUID.randomUUID().toString().substring(0, 12).replace("-", "")`
2. Stores in `MDC.put("trace_id", ...)` — Logback's `LogstashEncoder` automatically picks up MDC values
3. RestClient auto-configuration: add `ClientHttpRequestInterceptor` that injects `X-Trace-ID` from MDC into every outgoing request

**Request/response logging:** Implement a `Filter` wrapper (or use Spring Boot's `CommonsRequestLoggingFilter`) that logs one JSON line per request with method, path, status_code, latency_ms, trace_id — all as MDC values picked up by LogstashEncoder.

#### 5.5.3 Next.js / Node.js — ✅ Fully Aligned

**Library:** `pino` + `pino-http` + `pino-pretty` (dev only, disabled in production).

**package.json:**
```json
{"dependencies": {"pino": "^9.5.0", "pino-http": "^10.3.0"}}
```

**Server-side:** Create a logger instance once at module load:
```typescript
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'web-portal' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

**Trace ID propagation:** Wrap server-side `fetch` calls with a utility that:
1. Reads `trace_id` from `AsyncLocalStorage`
2. Injects `X-Trace-ID` header into the fetch call
3. Creates/continues the trace context

### 5.6 Implementation Summary Table

| Service | Metric | Logging | Scope of Change |
|---------|--------|---------|-----------------|
| **task1-ml-api** (Python) | ✅ Has `prometheus_fastapi_instrumentator`, needs label name fix (`handler`→`endpoint`, add `service`, exact `status_code`) | ✅ Has JSON formatter, rename `request_id`→`trace_id`, add `service`, extend middleware | Small refinement — already 80% complete |
| **estimator** (Python) | ❌ Missing entirely | ❌ Missing entirely | Add prometheus client middleware + JSON log middleware. Medium effort, well-defined patterns from ML API |
| **property-market-analysis** (Java) | ❌ Missing entirely | ❌ Missing entirely | Add `prometheus-client_java` + Filter for metrics; add `logstash-logback-encoder` + Filter + MDC for trace logs. Two new classes + pom changes + logback config |
| **web-portal** (Next.js) | ❌ Missing entirely | ❌ Missing entirely | Add `prom-client` + `/api/metrics` Route Handler; add `pino` + AsyncLocalStorage fetch wrapper |

### 5.7 Verification Checklist

After implementation, run these checks per service:

**Metric protocol conformance:**
```bash
# Expected: 2xx status codes as exact strings, correct label names
curl -s http://localhost:<port>/metrics | grep http_requests_total

# Should see output like:
# http_requests_total{service="...",endpoint="/health",method="GET",status_code="200"} N
# NOT like:
# http_requests_total{handler="/health",status="2xx"} N    ← WRONG (old Python format)
# http_server_requests_seconds_count{uri="/health"} N      ← WRONG (Micrometer default)
```

**Log protocol conformance:**
```bash
# Expected: every line is valid JSON with required fields
docker logs <container> --tail 100 2>&1 | while read line; do
  echo "$line" | python3 -c "import json,sys; json.load(sys.stdin)" 2>&1 \
    || echo "INVALID JSON: $line"
done

# Expected: trace_id propagates across services
docker logs estimator 2>&1 | grep "trace_id" | head -5
docker logs task1-ml-api 2>&1 | grep "trace_id" | head -5
# Both should show the SAME trace_id values for the same user request
```