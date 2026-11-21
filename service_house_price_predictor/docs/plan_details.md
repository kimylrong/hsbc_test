# Task 1: House-Price Prediction Model API — Detailed Execution Plan

## 1. Current-State Analysis

### Data Overview
- **Training set**: `House Price Dataset.csv`, 50 samples total
- **Features**: 7, **all numeric** (`square_footage`, `bedrooms`, `bathrooms`, `year_built`, `lot_size`, `distance_to_city_center`, `school_rating`)
- **Target**: `price` (house price, integer)
- **`id` column**: present in the training set but **not a feature** — must be dropped at training time
- **Test set**: `Test Data For Prediction.csv`, no `id`, no `price`, contains only the 7 features

### Tech Stack
- Python 3.12+ (installed)
- uv 0.13.9 (installed, package manager)
- `pyproject.toml` already exists (basic skeleton, empty `dependencies`)
- FastAPI + Scikit-learn + uvicorn

### Key Corrections (versus the original rough plan)
1. **No categorical features** → only `StandardScaler` needed; no `ColumnTransformer` / `OneHotEncoder`
2. **Small dataset (50 rows)** → focus on simple, robust models; skip LightGBM/XGBoost
3. **No `train_test_split`** → 50 rows is too small for a holdout set to be statistically meaningful; **use all 50 rows directly in 5-fold CV**, so every data row gets a turn in the validation set — zero data waste
4. **Fixed `random_state=42`** → guarantees reproducibility; every model + parameter combination **shares the same KFold splitter** (the prerequisite for fair comparison)
5. **Metrics persistence** → save both `model.joblib` and `metrics.json`
6. **Error handling** → global exception handler + input validation

---

## 2. File Structure

```
house_price_predictor/
├── docs/
│   ├── Interview Tasks Fullstack.pdf
│   ├── House Price Dataset.csv
│   ├── Test Data For Prediction.csv
│   ├── plan.md
│   └── plan_details.md              # This file
├── src/
│   ├── train.py                     # Offline training script (run once)
│   ├── preprocessor.py              # Data-preprocessing utility functions
│   ├── models.py                    # Pydantic input/output models
│   └── main.py                      # FastAPI application entrypoint
├── artifacts/
│   ├── model.joblib                 # Trained Pipeline
│   └── metrics.json                 # Training evaluation metrics
├── data/
│   └── (copy the CSV here after training, or reference docs/ directly)
├── .dockerignore
├── .gitignore
├── Dockerfile
└── pyproject.toml                   # uv-managed dependencies
```

---

## 3. Phased Execution Plan

### Phase 0: Project Initialization (uv + Dependency Install)

| Step | Command | Description |
|------|---------|-------------|
| 0.1 | `uv add fastapi "uvicorn[standard]" scikit-learn pandas joblib pydantic` | Add core runtime deps via uv |
| 0.2 | `uv add --dev ruff` | Dev dep: code formatter / linter |
| 0.3 | `uv sync` | Sync the virtualenv |

> `uv` auto-updates `pyproject.toml` and generates `uv.lock`. Inside Docker, use `uv pip compile` or simply `uv sync`.

---

### Phase 1: Offline Modeling — `src/train.py`

| Step | Content | Key Implementation Notes |
|------|---------|--------------------------|
| 1.1 | Load data | `pd.read_csv("docs/House Price Dataset.csv")`, drop the `id` column |
| 1.2 | Split X and y | X = 7 features, y = `price` |
| 1.3 | Fixed 5-fold splitter | `KFold(n_splits=5, shuffle=True, random_state=42)` — **every model + parameter combination shares this same `kf`** |
| 1.4 | Build Pipeline | `Pipeline([("scaler", StandardScaler()), ("model", ...)])` |
| 1.5 | Model comparison (see detailed strategy below) | **5 candidate model families + their parameter variants**, 5-fold CV on **all 50 rows**, compare RMSE and R² |
| 1.6 | Pick the best model | Primarily the lowest **mean CV RMSE**; also watch CV std (a model with very high variance is unstable even if its mean is low) |
| 1.7 | Retrain on the full dataset | Re-fit the best Pipeline on all 50 rows (CV is only for model selection; the final training squeezes every row of data) |

#### Model Comparison Strategy

**Why not `train_test_split`?**

The classical train/val/test 3-way split (70/15/15) assumes each split is "large enough" (statistically representative). But with 50 rows:
- The holdout test set would be only ~10 rows → RMSE swings wildly with a different `random_state`, **no judgmental value**
- Wastes 10 rows of data → rows that could otherwise make the model train more fully

**Instead: 5-fold CV on all 50 rows**:
- Every row takes a turn as validation data (total validation samples = 50), so CV mean RMSE is an **unbiased estimate** of generalization ability
- Each training fold has ~39 rows — more training data than if we further CV'd inside a 39/11 split (~31 rows each fold)
- The final fit also uses all 50 rows, so CV training size (39) is closer to the final training size (50) → **CV results are more accurate**

A 50-row dataset is inherently **small**, which means:
- Cross-validation results have high variance (different fold splits can produce visibly different numbers)
- Complex models (GBDT, XGBoost) can overfit easily, but they can't be skipped entirely

**Candidate models & parameter ranges**:

| Model | Parameter Search Space | Rationale |
|-------|----------------------|-----------|
| **LinearRegression** | none | Baseline, as a reference point |
| **Ridge** | `alpha ∈ [0.1, 1, 10, 100, 1000]` | Linear + L2 regularization; regularization helps on small samples |
| **Lasso** | `alpha ∈ [0.1, 1, 10, 100, 1000]` | Linear + L1 regularization; also does feature selection as a side effect |
| **RandomForestRegressor** | `n_estimators ∈ [50, 100, 200]`, `max_depth ∈ [None, 5, 10]` | Non-linear; compare against linear lifts |
| **GradientBoostingRegressor** | `n_estimators ∈ [50, 100]`, `learning_rate ∈ [0.05, 0.1, 0.2]` | Non-linear; RF's competitor |

> Not introducing XGBoost/LightGBM is not a judgment on their capability — it's that on 50 rows the GridSearchCV search space shouldn't be too large (too many parameters relative to data). We can add them later if performance turns out to be poor.

**How to compare**:
- Generate all `model × params` combinations (~26 total). **Every combination uses the same fixed KFold splitter** (the core prerequisite for a fair comparison)
- Iterate combinations with `ParameterGrid` → manually loop with `cross_val_score` (more flexible than `GridSearchCV`, easy to compare across different model families)
- Output a comparison table: model name | params | mean_cv_rmse | std_cv_rmse | mean_cv_r2
- **Selection criterion**: lowest `mean_cv_rmse` with reasonably small `std_cv_rmse` (balance between performance and stability)
- Write this comparison table into `metrics.json` as well — in the interview you can show the "systematic selection process"

| Step | Content | Key Implementation Notes |
|------|---------|--------------------------|
| 1.8 | Save Pipeline | `joblib.dump(pipeline, "artifacts/model.joblib")` |
| 1.9 | Save metrics | Write `artifacts/metrics.json` containing `model_name`, `cv_rmse`, `cv_r2`, `best_params`, `feature_importance`/coefficients, and the full model comparison table |

**Example `metrics.json` structure**:
```json
{
  "model_name": "Ridge",
  "cv_rmse": 12345.67,
  "cv_r2": 0.92,
  "best_params": {"alpha": 10.0},
  "feature_names": ["square_footage", "bedrooms", "..."],
  "coefficients": [123.4, 5000.0, "..."],
  "train_samples": 50,
  "model_comparison": [
    {"model": "LinearRegression", "params": {}, "mean_cv_rmse": 15234.1, "std_cv_rmse": 3200.0, "mean_cv_r2": 0.88},
    {"model": "Ridge", "params": {"alpha": 10.0}, "mean_cv_rmse": 12345.7, "std_cv_rmse": 2100.5, "mean_cv_r2": 0.92},
    {"model": "Lasso", "params": {"alpha": 10.0}, "mean_cv_rmse": 13012.3, "std_cv_rmse": 2800.1, "mean_cv_r2": 0.90},
    {"model": "RandomForestRegressor", "params": {"n_estimators": 100, "max_depth": null}, "mean_cv_rmse": 14500.2, "std_cv_rmse": 4500.3, "mean_cv_r2": 0.86},
    {"model": "GradientBoostingRegressor", "params": {"n_estimators": 50, "learning_rate": 0.1}, "mean_cv_rmse": 13800.8, "std_cv_rmse": 3900.0, "mean_cv_r2": 0.89}
  ]
}
```

**Run command**:
```bash
uv run python src/train.py
```

---

### Phase 2: FastAPI Service

#### `src/models.py` — Pydantic Models

| Model | Fields | Description |
|-------|--------|-------------|
| `HouseFeatures` | `square_footage: int`, `bedrooms: int`, `bathrooms: float`, `year_built: int`, `lot_size: int`, `distance_to_city_center: float`, `school_rating: float` | Single-row input. No `id`. |
| `HousePrediction` | `price: float` | Single-row output |
| `BatchHouseFeatures` | `List[HouseFeatures]` | Batch input |
| `BatchHousePredictions` | `predictions: List[HousePrediction]` | Batch output |

#### `src/main.py` — FastAPI Application

| Step | Content | Key Implementation Notes |
|------|---------|--------------------------|
| 2.1 | Define lifespan | Load `model.joblib` and `metrics.json` into globals at startup; clean up on shutdown |
| 2.2 | `POST /predict` | Handle with either `Union[HouseFeatures, BatchHouseFeatures]` or two separate routes; call `pipeline.predict()`; return `HousePrediction` or `BatchHousePredictions` |
| 2.3 | `GET /model-info` | Return the full `metrics.json` content + hyperparameters dynamically read from the pipeline |
| 2.4 | `GET /health` | Return `{"status": "ok"}` |
| 2.5 | Global exception handling | Add `@app.exception_handler(RequestValidationError)` for friendly error messages; handle the case where the model file is missing |
| 2.6 | API docs metadata | Set `app.title`, `app.version`, `app.description` so Swagger UI looks professional |

**Start command**:
```bash
uv run uvicorn src.main:app --reload
```

---

### Phase 3: Containerization

#### `Dockerfile`
```dockerfile
FROM python:3.12-slim

RUN pip install uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY src/ ./src/
COPY artifacts/ ./artifacts/

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> Use `uv sync --frozen` to pin production deps. `--no-dev` skips dev dependencies (ruff, etc.).

#### `.dockerignore`
```
.venv/
.ruff_cache/
__pycache__/
*.pyc
.git/
.gitignore
docs/
data/
*.md
```

**Build & Run**:
```bash
docker build -t house-price-predictor .
docker run -p 8000:8000 house-price-predictor
```

---

### Phase 4: Verification & Testing

| Step | Command / Action | Expected Result |
|------|------------------|-----------------|
| 4.1 | `curl http://localhost:8000/health` | `{"status": "ok"}` |
| 4.2 | `curl http://localhost:8000/model-info` | Returns `model_name`, `cv_rmse`, `cv_r2`, coefficients, etc. |
| 4.3 | Swagger UI `/docs` — test single `predict` | Feed it test-set data, get a reasonable price (should be in the ~150k – 400k range) |
| 4.4 | Swagger UI `/docs` — test batch `predict` | Feed it multiple test-set rows, get a corresponding list of predictions |
| 4.5 | Feed invalid data (missing fields / wrong types) | Returns a 422 with a clear message |

---

## 4. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 50 rows is tiny → CV results have high variance | Model selection is uncertain | Fix `random_state=42` + every combination shares the same KFold splitter to ensure a fair comparison; use `std_cv_rmse` as a stability gate |
| Trained model performs poorly (R² < 0.7) | Weak interview demo | Check whether feature engineering is missing (e.g. `year_built → age = 2025 - year_built`), or try polynomial features |
| `artifacts/` not found inside Docker | Container fails to start | Make sure `train.py` has been run and the `artifacts/` directory exists before building |
| `uv.lock` not committed | Non-reproducible Docker builds | `uv.lock` must be under version control |

---

## 5. Execution Order Summary

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4
   │         │         │         │         │
 uv deps   Train      FastAPI   Docker    Swagger
 pyproject  Save      Dev       Build     Verify
```

Estimated core LOC:
- `train.py`: ~80 lines
- `main.py`: ~100 lines
- `models.py`: ~40 lines
- `preprocessor.py`: ~20 lines
- `Dockerfile` + `.dockerignore`: ~15 lines each

---

## 6. Acceptance Criteria

- [ ] `uv run python src/train.py` runs successfully and generates `artifacts/`
- [ ] After `uv run uvicorn src.main:app`, Swagger UI is reachable
- [ ] `/health`, `/model-info`, `/predict` (single + batch) all work
- [ ] `docker build` + `docker run` succeed, and the in-container API is also reachable
- [ ] Input validation and error handling are in effect
- [ ] Full flow can be demoed live via Swagger UI during the interview