"use client";

import type { PredictResponse } from "@/lib/types";
import { formatCurrency, formatPricePerSqft } from "@/lib/format";

export function EstimateResult({ result }: { result: PredictResponse }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-sm font-medium text-ink-muted">Estimated value</h2>
      <p className="mt-1 text-3xl font-semibold text-primary">
        {formatCurrency(result.predicted_price)}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {formatPricePerSqft(result.price_per_sqft)}
      </p>
    </div>
  );
}