"use client";

import type { ReactNode } from "react";
import type { EstimateRecord } from "@/lib/types";
import { formatCurrency, formatPricePerSqft } from "@/lib/format";

type Column = {
  key: keyof EstimateRecord;
  label: string;
  render: (r: EstimateRecord) => ReactNode;
};

const COLUMNS: Column[] = [
  { key: "id", label: "ID", render: (r) => r.id },
  { key: "square_footage", label: "Sq Ft", render: (r) => r.square_footage },
  { key: "bedrooms", label: "Beds", render: (r) => r.bedrooms },
  { key: "bathrooms", label: "Baths", render: (r) => r.bathrooms },
  { key: "year_built", label: "Year", render: (r) => r.year_built },
  { key: "lot_size", label: "Lot Size", render: (r) => r.lot_size },
  {
    key: "distance_to_city_center",
    label: "Distance",
    render: (r) => r.distance_to_city_center,
  },
  { key: "school_rating", label: "School", render: (r) => r.school_rating },
  {
    key: "predicted_price",
    label: "Predicted",
    render: (r) => formatCurrency(r.predicted_price),
  },
  {
    key: "price_per_sqft",
    label: "$/Sq Ft",
    render: (r) => formatPricePerSqft(r.price_per_sqft),
  },
  {
    key: "created_at",
    label: "Created",
    render: (r) => new Date(r.created_at).toLocaleString(),
  },
];

export function HistoryTable({
  records,
  isLoading,
  selectedIds,
  onToggleSelect,
}: {
  records: EstimateRecord[];
  isLoading: boolean;
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
}) {
  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading history…</p>;
  }

  if (records.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No estimates yet. Submit the form to create your first record.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Compare</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {records.map((r) => (
            <tr key={r.id} className="hover:bg-surface-muted">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Select record ${r.id} for comparison`}
                  checked={selectedIds.includes(r.id)}
                  onChange={() => onToggleSelect(r.id)}
                  className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                />
              </td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="px-3 py-2">
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}