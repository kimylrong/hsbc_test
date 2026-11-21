



Based on the `Interview Tasks Fullstack.pdf` you uploaded, the core task of **Task 1** is: build, containerize, and deploy a house-price prediction regression model API (using FastAPI and Scikit-learn) trained on the given dataset (`House Price Dataset.csv`).

Drawing on our discussion of the full Scikit-learn model-development workflow, model persistence, and engineering best practices, here are the **key points and step-by-step execution plan** for Task 1:

---

### 1. Key Points

1. **EDA & Preprocessing**
* Read `House Price Dataset.csv`; check for missing values, outliers, and data types (distinguish numeric vs. categorical features).
* Use `ColumnTransformer` or Pandas to process the data correctly (e.g., one-hot encoding for categorical variables, scaling for numeric ones).

2. **Model Selection & Training**
* This is a **regression task** — the target is a continuous house price.
* You can try multiple baseline models (Linear Regression, Ridge, RandomForestRegressor, LightGBM/XGBoost) and pick the best one by comparing metrics (RMSE, MAE, R²) via cross-validation.

3. **Pipeline Encapsulation & Persistence**
* **Critical**: you must package the feature preprocessor (scaler, encoder, etc.) together with the trained model into a single Scikit-learn `Pipeline`.
* Use `joblib` to serialize the entire Pipeline into a `.joblib` file that FastAPI loads at startup. **Never retrain at prediction time**.

4. **FastAPI Endpoints**
Per the requirements, these three core endpoints are mandatory:

* `POST /predict`: accepts single or batched house-feature rows and returns predicted prices. Must use Pydantic for strongly typed input validation.
* `GET /model-info`: returns model hyperparameters, evaluation metrics (RMSE, R²), and feature coefficients/importance.
* `GET /health`: a simple health-check endpoint (returns 200) for container liveness probes.

5. **Containerization & Swagger**
* Write a lean `Dockerfile` (based on Python 3.12+) that ensures all dependencies (`scikit-learn`, `fastapi`, `uvicorn`, `pandas`, `joblib`) are installed correctly.
* Make sure Swagger UI (`/docs`) works after the container starts — you will demo the flow live there.

---

### 2. Step-by-Step Plan

You can advance Task 1 efficiently in these four phases:

#### Phase 1: Offline Modeling & Validation

* **Step 1.1**: Write a data-exploration script that loads `House Price Dataset.csv` and splits features X from target Y.
* **Step 1.2**: Split training vs. test sets (`train_test_split`).
* **Step 1.3**: Build a `Pipeline` that combines preprocessing and model, then train.
* **Step 1.4**: Evaluate performance (compute RMSE and R²), and persist the trained Pipeline via `joblib.dump()` as `model.joblib`.

#### Phase 2: FastAPI Service

* **Step 2.1**: Define Pydantic models (`InputSchema`, `BatchInputSchema`) that strictly declare the house-feature fields and their types.
* **Step 2.2**: Write `main.py`. Load `model.joblib` at startup (lifespan handler) so it's not reloaded on every request.
* **Step 2.3**: Implement `/predict` — accept Pydantic data, call `pipeline.predict()`, and return results (single + batch).
* **Step 2.4**: Implement `/model-info` and `/health`.

#### Phase 3: Containerization

* **Step 3.1**: Write `requirements.txt` (pin library versions for reproducibility).
* **Step 3.2**: Write the `Dockerfile`:
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

* **Step 3.3**: Build locally and test the container (`docker build` & `docker run`).

#### Phase 4: Verify & Prepare for Demo

* **Step 4.1**: Open Swagger UI (`http://localhost:8000/docs`) and test `/health`, `/model-info`, and `/predict` one by one.
* **Step 4.2**: Push the source + Dockerfile to your GitHub repo — all Task 1 deliverables are done.

---

Where would you like to start? (e.g., **write the Python script that trains and saves the model**, or **design the FastAPI skeleton first**?)