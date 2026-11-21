"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartData } from "@/lib/types";
import { DIMENSIONS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";

export function ComposedChartGrid({ charts }: { charts: ChartData[] }) {
  const byDimension: Record<string, ChartData> = Object.fromEntries(
    charts.map((c) => [c.dimension, c]),
  );

  return (
    <section
      aria-label="Charts"
      className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3"
    >
      {DIMENSIONS.map((dim) => {
        const chart = byDimension[dim.key];
        const buckets = chart?.buckets ?? [];
        const data = buckets.map((b) => ({
          name: b.label,
          count: b.count,
          avgPrice: b.avgPrice ?? null,
        }));

        return (
          <div
            key={dim.key}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <h3 className="mb-2 text-sm font-semibold">{dim.label}</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={data}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e6e8" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                    height={40}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    width={30}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                    width={46}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "Avg Price"
                        ? formatCurrency(Number(value))
                        : value
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    yAxisId="left"
                    dataKey="count"
                    name="Count"
                    fill="#d9dde1"
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgPrice"
                    name="Avg Price"
                    stroke="#db0011"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#db0011" }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </section>
  );
}