"use client";

import { useState } from "react";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useMarketAnalysis } from "@/lib/hooks/useMarketAnalysis";
import { EMPTY_FILTERS } from "@/lib/constants";
import type { AnalyzeResponse, HouseRecord, MarketFilter } from "@/lib/types";
import { FilterBar } from "./FilterBar";
import { ComposedChartGrid } from "./ComposedChartGrid";
import { MarketTable } from "./MarketTable";
import { WhatIfDrawer } from "./WhatIfDrawer";

export function MarketClient({ initialData }: { initialData?: AnalyzeResponse }) {
  const [filters, setFilters] = useState<MarketFilter>(EMPTY_FILTERS);
  const debounced = useDebouncedValue(filters, 300);
  const analysis = useMarketAnalysis(debounced, initialData);

  const [whatIfRecord, setWhatIfRecord] = useState<HouseRecord | null>(null);

  const activeFilterCount = Object.values(filters).reduce(
    (n, arr) => n + arr.length,
    0,
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Market Analysis
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Explore 50 properties across 7 dimensions. Filters drive the charts
            and detail table below.
          </p>
        </div>
        {analysis.data ? (
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">
              {analysis.data.records.length}
            </span>{" "}
            matching properties
          </p>
        ) : null}
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        activeCount={activeFilterCount}
      />

      {analysis.isError ? (
        <div
          role="alert"
          className="my-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-primary-strong"
        >
          {analysis.error instanceof Error
            ? analysis.error.message
            : "Failed to load market analysis."}
        </div>
      ) : analysis.data ? (
        <div className="relative">
          {analysis.isFetching ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted shadow-sm">
                <svg
                  className="h-4 w-4 animate-spin text-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                Updating…
              </span>
            </div>
          ) : null}
          <div
            aria-busy={analysis.isFetching}
            className={
              analysis.isFetching
                ? "opacity-60 transition-opacity"
                : "transition-opacity"
            }
          >
            <ComposedChartGrid charts={analysis.data.charts} />
            <MarketTable
              records={analysis.data.records}
              onWhatIf={setWhatIfRecord}
            />
          </div>
        </div>
      ) : (
        <div className="my-10 flex justify-center text-sm text-ink-muted">
          Loading analysis…
        </div>
      )}

      {whatIfRecord ? (
        <WhatIfDrawer
          record={whatIfRecord}
          onClose={() => setWhatIfRecord(null)}
        />
      ) : null}
    </div>
  );
}