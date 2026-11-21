"use client";

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useDialogHost } from "@/components/layout/A11yDialogHost";
import type { EstimateRecord } from "@/lib/types";
import {
  formatCurrency,
  formatPercent,
  formatPricePerSqft,
  formatSignedCurrency,
} from "@/lib/format";

type Row = {
  key: keyof EstimateRecord;
  label: string;
};

const FEATURE_ROWS: Row[] = [
  { key: "square_footage", label: "Square Footage" },
  { key: "bedrooms", label: "Bedrooms" },
  { key: "bathrooms", label: "Bathrooms" },
  { key: "year_built", label: "Year Built" },
  { key: "lot_size", label: "Lot Size" },
  { key: "distance_to_city_center", label: "Distance" },
  { key: "school_rating", label: "School Rating" },
];

const PRICE_ROW: Row = {
  key: "predicted_price",
  label: "Predicted Price",
};

const PSQFT_ROW: Row = {
  key: "price_per_sqft",
  label: "$/Sq Ft",
};

export function CompareModal({
  records,
  onClose,
}: {
  records: EstimateRecord[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const host = useDialogHost();

  useEffect(() => {
    const unregister = host.register();
    return unregister;
  }, [host]);

  useFocusTrap(ref, true, onClose);

  const sorted = [...records].sort(
    (a, b) => a.predicted_price - b.predicted_price,
  );
  const baseline = sorted[0];

  const delta = (r: EstimateRecord) => {
    const amount = r.predicted_price - baseline.predicted_price;
    const percent =
      baseline.predicted_price !== 0
        ? (amount / baseline.predicted_price) * 100
        : 0;
    return { amount, percent };
  };

  const deltaClass = (amount: number) =>
    amount > 0 ? "text-primary" : "text-ink-muted";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overlay-base"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-modal-title"
        className="animate-scale-in max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="compare-modal-title" className="text-lg font-semibold">
            Compare estimates
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-ink-muted">
                <th className="px-3 py-2">Attribute</th>
                {sorted.map((r) => (
                  <th key={r.id} className="px-3 py-2">
                    Record #{r.id}
                    {r.id === baseline.id ? (
                      <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Baseline
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {FEATURE_ROWS.map((row) => (
                <tr key={row.key}>
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  {sorted.map((r) => (
                    <td key={r.id} className="px-3 py-2">
                      {String(r[row.key])}
                    </td>
                  ))}
                </tr>
              ))}

              <tr>
                <td className="px-3 py-2 font-medium">{PRICE_ROW.label}</td>
                {sorted.map((r) => {
                  const d = delta(r);
                  const isBaseline = r.id === baseline.id;
                  return (
                    <td key={r.id} className="px-3 py-2">
                      <div className="font-semibold text-ink">
                        {formatCurrency(r.predicted_price)}
                      </div>
                      {isBaseline ? (
                        <span className="text-xs text-ink-muted">—</span>
                      ) : (
                        <span
                          className={`text-xs font-medium ${deltaClass(d.amount)}`}
                        >
                          {formatSignedCurrency(d.amount)} (
                          {formatPercent(d.percent)})
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>

              <tr>
                <td className="px-3 py-2 font-medium">{PSQFT_ROW.label}</td>
                {sorted.map((r) => (
                  <td key={r.id} className="px-3 py-2">
                    {formatPricePerSqft(r.price_per_sqft)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}