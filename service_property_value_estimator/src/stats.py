import csv
import statistics
from pathlib import Path

from .schemas import PriceStats


def compute_price_stats(csv_path: Path) -> PriceStats:
    """读取数据集（UTF-8 BOM 自动去除）并计算 price 的 Min/中位数/平均数/Max。"""
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        prices = [float(row["price"]) for row in reader]

    if not prices:
        raise ValueError(f"No price data found in {csv_path}")

    return PriceStats(
        min=round(min(prices), 2),
        median=round(statistics.median(prices), 2),
        mean=round(statistics.mean(prices), 2),
        max=round(max(prices), 2),
    )