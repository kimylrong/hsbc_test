"use client";

import { useMemo, useState } from "react";
import type { HouseRecord } from "@/lib/types";
import { formatCurrency, formatPricePerSqft } from "@/lib/format";
import { exportCsv, exportPdf } from "@/lib/export";

type SortKey = keyof HouseRecord;
type SortDir = "asc" | "desc";

const COLUMNS: {
  key: keyof HouseRecord;
  label: string;
  numeric: boolean;
  render: (r: HouseRecord) => string;
}[] = [
  { key: "id", label: "ID", numeric: true, render: (r) => String(r.id) },
  { key: "squareFootage", label: "Sq Ft", numeric: true, render: (r) => String(r.squareFootage) },
  { key: "bedrooms", label: "Beds", numeric: true, render: (r) => String(r.bedrooms) },
  { key: "bathrooms", label: "Baths", numeric: true, render: (r) => String(r.bathrooms) },
  { key: "yearBuilt", label: "Year", numeric: true, render: (r) => String(r.yearBuilt) },
  { key: "lotSize", label: "Lot Size", numeric: true, render: (r) => String(r.lotSize) },
  { key: "distanceToCityCenter", label: "Distance", numeric: true, render: (r) => String(r.distanceToCityCenter) },
  { key: "schoolRating", label: "School", numeric: true, render: (r) => String(r.schoolRating) },
  { key: "price", label: "Price", numeric: true, render: (r) => formatCurrency(r.price) },
  { key: "pricePerSqft", label: "$/Sq Ft", numeric: true, render: (r) => formatPricePerSqft(r.pricePerSqft) },
];

export function MarketTable({
  records,
  onWhatIf,
}: {
  records: HouseRecord[];
  onWhatIf: (record: HouseRecord) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const copy = [...records];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [records, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const headers = COLUMNS.map((c) => c.label);
  const csvRows = sorted.map((r) => COLUMNS.map((c) => c.render(r)));

  const exportCsvData = () =>
    exportCsv("market-analysis.csv", headers, csvRows);
  const exportPdfData = () =>
    exportPdf("market-analysis.pdf", "Market Analysis — Detail Table", headers, csvRows);

  return (
    <section aria-label="Detail table" className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Detail table</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsvData}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-primary hover:text-primary"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={exportPdfData}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-primary hover:text-primary"
          >
            Export PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className="inline-flex items-center gap-1 uppercase transition hover:text-ink"
                  >
                    {c.label}
                    {sortKey === c.key ? (
                      <span aria-hidden="true">{sortDir === "asc" ? "↑" : "↓"}</span>
                    ) : null}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((r) => (
              <tr key={r.id} className="hover:bg-surface-muted">
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-3 py-2">
                    {c.render(r)}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onWhatIf(r)}
                    className="rounded border border-line px-2 py-1 text-xs font-medium text-primary transition hover:border-primary"
                  >
                    What-if
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}