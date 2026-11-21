"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEstimatorHistory } from "@/lib/hooks/useEstimatorHistory";
import { useEstimatorPredict } from "@/lib/hooks/useEstimatorPredict";
import type { EstimateRecord, HouseFeatures } from "@/lib/types";
import { EstimatorForm } from "./EstimatorForm";
import { EstimateResult } from "./EstimateResult";
import { ResultChart } from "./ResultChart";
import { HistoryTable } from "./HistoryTable";
import { CompareModal } from "./CompareModal";

export function EstimatorClient({
  initialHistory,
}: {
  initialHistory: EstimateRecord[];
}) {
  const queryClient = useQueryClient();
  const history = useEstimatorHistory(initialHistory);
  const predict = useEstimatorPredict();

  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const onSubmit = (features: HouseFeatures) => {
    predict.mutate(features, {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["estimator", "history"] }),
    });
  };

  const selectedRecords =
    history.data?.filter((r) => compareIds.includes(r.id)) ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Property Value Estimator
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Enter the property features to get an instant AI valuation.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-label="Estimate form"
          className="rounded-xl border border-line bg-surface p-6"
        >
          <EstimatorForm onSubmit={onSubmit} isSubmitting={predict.isPending} />
        </section>

        <div className="flex flex-col gap-6">
          {predict.isError ? (
            <div
              role="alert"
              className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-primary-strong"
            >
              {predict.error instanceof Error
                ? predict.error.message
                : "Estimation failed. Please try again."}
            </div>
          ) : null}

          {predict.data ? (
            <>
              <EstimateResult result={predict.data} />
              <ResultChart
                stats={predict.data.price_stats}
                predicted={predict.data.predicted_price}
              />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
              The valuation result and distribution chart will appear here after
              you submit the form.
            </div>
          )}
        </div>
      </div>

      <section aria-label="Estimate history" className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">History</h2>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            disabled={selectedRecords.length < 2}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Compare ({selectedRecords.length})
          </button>
        </div>
        <HistoryTable
          records={history.data ?? []}
          isLoading={history.isPending}
          selectedIds={compareIds}
          onToggleSelect={(id) =>
            setCompareIds((prev) =>
              prev.includes(id)
                ? prev.filter((x) => x !== id)
                : [...prev, id],
            )
          }
        />
      </section>

      {compareOpen ? (
        <CompareModal
          records={selectedRecords}
          onClose={() => setCompareOpen(false)}
        />
      ) : null}
    </div>
  );
}