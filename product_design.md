# Task 2 Product Design: Unified Property Intelligence Portal (Next.js Portal)

## 1. Positioning & Overall Shape

1. **Single Next.js Portal**
* Provide a **shared global layout and navigation bar** within one Next.js application (single domain/port, e.g. `http://localhost:3000`), with a unified visual style and consistent state feedback.
* The portal hosts two independent sub-applications accessible via top-menu navigation:
* **Property Value Estimator** (route e.g. `/estimator`)
* **Property Market Analysis** (route e.g. `/market`)

2. **Responsibilities & Interaction Boundaries**
* Next.js handles page routing, shared shell, global loading/error fallback, and forwarding of frontend `/api/*` requests to backend services.
* Each sub-application talks to an independent backend (Python FastAPI for the estimator; Java 21 + Spring Boot 3.4.4 for market analysis). The estimator backend calls the Task 1 prediction model to produce valuations. Market analysis aggregation and statistics are computed directly from the property dataset; the model is invoked only for What-if scenarios.

---

## 2. Sub-Application 1: Property Value Estimator

**Core goal**: Provide clear input validation, intuitive result presentation, persistent estimation history, and side-by-side comparison for multiple properties — all centered around single-property valuation needs.

### 2.1 Property Feature Input Section

* **Input fields (7 total, matching Task 1 model features exactly)**:

| Field | Type | Valid Range |
| --- | --- | --- |
| `square_footage` | Integer | 100 – 20,000 |
| `bedrooms` | Integer | 1 – 10 |
| `bathrooms` | Decimal | 0.5 – 8.0 |
| `year_built` | Integer | 1800 – 2026 |
| `lot_size` | Integer | 500 – 100,000 |
| `distance_to_city_center` | Decimal | 0.1 – 50.0 |
| `school_rating` | Decimal | 1.0 – 10.0 |

* **Interaction & validation**:
* Required-field check + type and range validation (range as above; `bathrooms` and `school_rating` support decimals, the rest are integers). Frontend validation mirrors backend 422 semantics — clear in-field tips and blocking of invalid submissions.
* Provide a "Quick-fill example" button for easy demo testing.

### 2.2 Prediction Result Display (Table + Visual Chart)

* **Visual Chart**: A bar (or scatter) chart that places each prediction within the **dataset price distribution reference frame** — showing the dataset's **Min / Median / Mean / Max** alongside the **predicted price (highlighted)** so numbers have context.
* **Tabular Result**: A table mirroring the chart's reference values — **Predicted Price (highlighted)**, **Price / SqFt** (predicted price ÷ square footage), and the distribution reference statistics (Min / Median / Mean / Max).

### 2.3 Estimation History

* After each successful valuation, persist input parameters, predicted price, price per sq ft, and timestamp to the backend SQLite database.
* Display past estimations in reverse-chronological order on the history list page for easy review.
* **No "clear history" button** — keep the interface lean.

### 2.4 Side-by-Side Comparison

* **Entry point**: Directly from the **estimation history list**.
* **How it works**: Each row has checkboxes for multi-select (enable the Compare button once ≥ 2 are selected; cap at 4–5 to keep layout readable).
* **Display**: Clicking Compare opens a **Modal or Drawer** showing a **transposed comparison table**:
* **Each column** = one selected history record;
* **Each row** = one property feature (7 features) or one result metric (predicted price, price per sq ft) — aligned row-by-row for cross-record comparison.

---

## 3. Sub-Application 2: Property Market Analysis

**Core goal**: Multi-dimensional slice-and-dice filtering, grouped average-price visualization, drill-down table and report export over the existing property dataset, plus lightweight on-demand What-if parameter simulation for individual properties.

### 3.1 Global Filters (7 Dimensions)

* Covers all 7 dimensions: `square_footage`, `bedrooms`, `bathrooms`, `year_built`, `lot_size`, `distance_to_city_center`, `school_rating`.
* **Control style**: All 7 dimensions use the same "multi-select segment" control. Filter segments are defined from the same source as the chart X-axis buckets:
* Discrete dimensions (e.g. `bedrooms`, `bathrooms`) — multi-select from actual values (e.g. `2 / 3 / 4`);
* Continuous dimensions — multi-select from predefined buckets (e.g. for `square_footage`: `<1350 / 1350–1700 / 1700–2050 / >2050`), the user picks segments rather than typing free Min / Max.
* Provide a "Reset filters" button.

* **Scope of linkage**: Any filter change drives a synchronized refresh of all **7 group charts** and the **detail table below**.

### 3.2 Bar + Line Combination Charts (7 Dimensions)

* **7 dimensions (each becomes the X-axis of one chart)**: `square_footage`, `bedrooms`, `bathrooms`, `year_built`, `lot_size`, `distance_to_city_center`, `school_rating`.
* **Grouping / bucketing rules**: Fixed rules applied up-front (e.g. `year_built` grouped into 10-year decades; continuous features grouped into fixed-width buckets) to guarantee X-axis structure stability and comparability across filter changes.
* **Chart semantics (bar + line, independent left/right axes)**:
* **Bar** = the group's **Avg Price** — maps to **left Y-axis** (unit `$`);
* **Line** = the group's **Avg Price / SqFt** — maps to **right Y-axis** (unit `$/sqft`);
* Two independent Y-axes, each labeled with its unit. High-contrast color for the line, light color for bars. Legend and tooltip show **Avg Price, Avg Price / SqFt, and sample count** for the group simultaneously.

* **Layout recommendation**: Responsive grid of cards for 7 charts, avoiding a single long scroll.

### 3.3 Responsive Detail Table & Data Export (CSV / PDF)

* **Detail table**: Shows all property records matching the current 7-dimension global filter (reuses the global filter, no separate filtering controls; small dataset, no pagination). Supports **client-side column sorting**.
* **Data export**: **CSV** and **PDF** export functions over the currently filtered/displayed table data.

### 3.4 Lightweight What-if Simulation (On-Demand)

* **Position & trigger**: Optional, on-demand auxiliary feature — each row in the **detail table** has a `What-if` (or `Simulate`) button. Clicking it loads that row's parameters and opens a **Modal or Drawer**.
* **Simulation loop**: User modifies one or more property parameters in the drawer and triggers a prediction. **Baseline** = the model's prediction on the row's original features; **Modified** = the model's prediction on the changed features. The UI shows both side-by-side with **delta and percent change**. The row's **actual sale price is shown only as a reference column and is not used in the delta calculation**. No What-if request is made proactively, and **What-if results do not have a standalone export**.

---

## 4. Experience & Stability Requirements

* **State fallback**: Each page has a consistent loading state and error/degrade handling via an Error Boundary. When backends are down or requests fail, show clear, readable messages rather than crashing the whole page.
* **Basic usability & accessibility (WCAG 2.1 AA)**: Form labels properly associated with controls, buttons and filters fully operable via keyboard with visible focus hints, overlay dialogs have focus traps and `Esc`-to-close, text and chart color schemes meet AA contrast ratios. Desktop demo-ready.