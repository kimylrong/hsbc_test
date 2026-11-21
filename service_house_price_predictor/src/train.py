import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import scipy.stats
from sklearn.exceptions import ConvergenceWarning
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Lasso, LinearRegression, Ridge
from sklearn.model_selection import KFold, ParameterGrid, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore", category=ConvergenceWarning)

RANDOM_STATE = 42
KFOLD = KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

FEATURE_COLS = [
    "square_footage",
    "bedrooms",
    "bathrooms",
    "year_built",
    "lot_size",
    "distance_to_city_center",
    "school_rating",
]
TARGET_COL = "price"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "docs" / "House Price Dataset.csv"
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"

MODEL_GRID = [
    {"model": [LinearRegression()]},
    {"model": [Ridge()], "model__alpha": [0.1, 1, 10, 100, 1000]},
    {"model": [Lasso()], "model__alpha": [0.1, 1, 10, 100, 1000]},
    {
        "model": [RandomForestRegressor(random_state=RANDOM_STATE)],
        "model__n_estimators": [50, 100, 200],
        "model__max_depth": [None, 5, 10],
    },
    {
        "model": [GradientBoostingRegressor(random_state=RANDOM_STATE)],
        "model__n_estimators": [50, 100],
        "model__learning_rate": [0.05, 0.1, 0.2],
    },
]


def load_data() -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(DATA_PATH).drop(columns=["id"])
    X = df[FEATURE_COLS]
    y = df[TARGET_COL]
    print(f"Loaded {len(df)} samples, {X.shape[1]} features")
    return X, y


def evaluate_all_models(X: pd.DataFrame, y: pd.Series) -> list[dict]:
    results = []
    param_count = 0
    for params in ParameterGrid(MODEL_GRID):
        param_count += 1
        model = params.pop("model")
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("model", model),
        ])
        pipeline.set_params(**params)

        neg_rmse = cross_val_score(
            pipeline, X, y, cv=KFOLD, scoring="neg_root_mean_squared_error"
        )
        r2 = cross_val_score(pipeline, X, y, cv=KFOLD, scoring="r2")

        results.append({
            "model": model.__class__.__name__,
            "params": {k: v for k, v in params.items()},
            "mean_cv_rmse": float(-neg_rmse.mean()),
            "std_cv_rmse": float(neg_rmse.std()),
            "mean_cv_r2": float(r2.mean()),
        })
    print(f"Evaluated {param_count} model+parameter combinations\n")
    return results


def print_comparison_table(results: list[dict]) -> None:
    for r in results:
        r["cv"] = r["std_cv_rmse"] / r["mean_cv_rmse"]

    results_sorted = sorted(results, key=lambda r: r["mean_cv_rmse"])
    header = f"{'Model':<30} {'Params':<32} {'RMSE':>10} {'Std':>10} {'CV%':>7} {'R²':>8}"
    print("=" * len(header))
    print("MODEL COMPARISON (sorted by mean CV RMSE)")
    print("=" * len(header))
    print(header)
    print("-" * len(header))
    for r in results_sorted:
        params_str = ", ".join(f"{k}={v}" for k, v in r["params"].items()) or "default"
        print(
            f"{r['model']:<30} {params_str:<32} "
            f"{r['mean_cv_rmse']:>10.0f} {r['std_cv_rmse']:>10.0f} "
            f"{r['cv']*100:>6.1f}% {r['mean_cv_r2']:>8.4f}"
        )
    print("=" * len(header))
    print("CV% = std/mean, lower is more stable\n")


def _rank_scores(results: list[dict]) -> None:
    rmse_vals = np.array([r["mean_cv_rmse"] for r in results])
    std_vals = np.array([r["std_cv_rmse"] for r in results])
    r2_vals = np.array([r["mean_cv_r2"] for r in results])

    rmse_ranks = scipy.stats.rankdata(rmse_vals, method="min")
    std_ranks = scipy.stats.rankdata(std_vals, method="min")
    r2_ranks = scipy.stats.rankdata(-r2_vals, method="min")

    for i, r in enumerate(results):
        r["rmse_rank"] = int(rmse_ranks[i])
        r["std_rank"] = int(std_ranks[i])
        r["r2_rank"] = int(r2_ranks[i])
        r["combined_score"] = round(
            float(r["rmse_rank"]) * 0.6
            + float(r["std_rank"]) * 0.25
            + float(r["r2_rank"]) * 0.15,
            2,
        )


def select_best(results: list[dict]) -> tuple[dict, list[dict]]:
    _rank_scores(results)
    results_sorted = sorted(results, key=lambda r: r["combined_score"])
    best = results_sorted[0]

    print("SELECTION RATIONALE: weighted ranking")
    print("  weights: mean_RMSE=0.6, std_RMSE=0.25, mean_R2=0.15")
    print("  lower combined_score = better (rank sum)")
    print()

    header = f"{'Rank':<6} {'Model':<30} {'Params':<25} {'RMSE':>8} {'Std':>8} {'CV%':>6} {'R²':>8} {'Score':>8}"
    print(header)
    print("-" * len(header))
    for i, r in enumerate(results_sorted[:8]):
        params_str = ", ".join(f"{k}={v}" for k, v in r["params"].items()) or "default"
        marker = " ← BEST" if i == 0 else ""
        print(
            f"{i+1:<6} {r['model']:<30} {params_str:<25} "
            f"{r['mean_cv_rmse']:>8.0f} {r['std_cv_rmse']:>8.0f} "
            f"{r['cv']*100:>5.1f}% {r['mean_cv_r2']:>8.4f} {r['combined_score']:>8.1f}{marker}"
        )
    print("-" * len(header))
    print(f"(showing top 8 of {len(results_sorted)})\n")

    print(
        f"Best model: {best['model']} "
        f"(RMSE={best['mean_cv_rmse']:.0f}, "
        f"Std={best['std_cv_rmse']:.0f}, "
        f"CV={best['cv']*100:.1f}%, "
        f"R²={best['mean_cv_r2']:.4f})"
    )
    print(f"Ranks: RMSE #{best['rmse_rank']}, Std #{best['std_rank']}, R² #{best['r2_rank']}")
    if len(best["params"]) > 0:
        print(f"Best params: {best['params']}")
    print()
    return best, results_sorted


def get_feature_stats(pipeline: Pipeline, feature_names: list[str]) -> list[dict] | None:
    model = pipeline.named_steps["model"]
    values: list[float] = []
    if hasattr(model, "feature_importances_"):
        values = model.feature_importances_.tolist()
    elif hasattr(model, "coef_"):
        values = model.coef_.tolist()
    else:
        return None
    stats = [{"feature": name, "importance": round(float(v), 6)} for name, v in zip(feature_names, values)]
    stats.sort(key=lambda x: abs(x["importance"]), reverse=True)
    return stats


def final_fit(X: pd.DataFrame, y: pd.Series, best: dict) -> Pipeline:
    model_class = {
        "LinearRegression": LinearRegression,
        "Ridge": Ridge,
        "Lasso": Lasso,
        "RandomForestRegressor": lambda: RandomForestRegressor(random_state=RANDOM_STATE),
        "GradientBoostingRegressor": lambda: GradientBoostingRegressor(
            random_state=RANDOM_STATE
        ),
    }[best["model"]]

    model = model_class() if callable(model_class) and not isinstance(model_class, type) else model_class()
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", model),
    ])
    pipeline.set_params(**best["params"])
    pipeline.fit(X, y)
    return pipeline


def save_artifacts(pipeline: Pipeline, best: dict, results_sorted: list[dict], n_samples: int) -> None:
    ARTIFACTS_DIR.mkdir(exist_ok=True)

    joblib.dump(pipeline, ARTIFACTS_DIR / "model.joblib")
    print(f"Saved model to {ARTIFACTS_DIR / 'model.joblib'}")

    metrics = {
        "model_name": best["model"],
        "cv_rmse": best["mean_cv_rmse"],
        "cv_r2": best["mean_cv_r2"],
        "cv_rmse_std": best["std_cv_rmse"],
        "best_params": best["params"],
        "feature_names": FEATURE_COLS,
        "feature_stats": get_feature_stats(pipeline, FEATURE_COLS),
        "train_samples": n_samples,
        "model_comparison": results_sorted,
    }

    with open(ARTIFACTS_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2, default=str)
    print(f"Saved metrics to {ARTIFACTS_DIR / 'metrics.json'}")


def main() -> None:
    X, y = load_data()

    print("\n--- Evaluating all model + parameter combinations ---\n")
    results = evaluate_all_models(X, y)

    print_comparison_table(results)

    best, results_sorted = select_best(results)

    print(f"--- Final fit on all {len(X)} samples ---\n")
    pipeline = final_fit(X, y, best)

    save_artifacts(pipeline, best, results_sorted, n_samples=len(X))

    print("\nDone.")


if __name__ == "__main__":
    main()