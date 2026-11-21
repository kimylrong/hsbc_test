"use client";

import type { PriceStats } from "@/lib/types";

interface Props {
  stats: PriceStats;
  predicted: number;
}

const W = 720;
const H = 130;
const PAD_L = 32;
const PAD_R = 32;
const LINE_Y = 75;
const LINE_H = 4;

function fmtK(v: number) {
  return `$${(v / 1000).toFixed(0)}k`;
}

function fmtFull(v: number) {
  return `$${v.toLocaleString()}`;
}

interface Pt {
  key: string;
  type: string;
  value: number;
  shortLabel: string;
  tip: string;
  highlight: boolean;
  color: string;
  dotR: number;
}

export function ResultChart({ stats, predicted }: Props) {
  const lo = Math.min(stats.min, predicted);
  const hi = Math.max(stats.max, predicted);
  const pad = Math.max((hi - lo) * 0.08, 1);
  const dLo = Math.max(0, lo - pad);
  const dHi = hi + pad;
  const span = dHi - dLo;
  const innerW = W - PAD_L - PAD_R;

  const sx = (v: number) => PAD_L + ((v - dLo) / span) * innerW;

  const rawPts: Pt[] = [
    {
      key: "min",
      type: "Min",
      value: stats.min,
      shortLabel: fmtK(stats.min),
      tip: `Min ${fmtFull(stats.min)}`,
      highlight: false,
      color: "#8b8f94",
      dotR: 4,
    },
    {
      key: "median",
      type: "Median",
      value: stats.median,
      shortLabel: fmtK(stats.median),
      tip: `Median ${fmtFull(stats.median)}`,
      highlight: false,
      color: "#8b8f94",
      dotR: 4,
    },
    {
      key: "mean",
      type: "Mean",
      value: stats.mean,
      shortLabel: fmtK(stats.mean),
      tip: `Mean ${fmtFull(stats.mean)}`,
      highlight: false,
      color: "#8b8f94",
      dotR: 4,
    },
    {
      key: "max",
      type: "Max",
      value: stats.max,
      shortLabel: fmtK(stats.max),
      tip: `Max ${fmtFull(stats.max)}`,
      highlight: false,
      color: "#8b8f94",
      dotR: 4,
    },
    {
      key: "predicted",
      type: "Predicted",
      value: predicted,
      shortLabel: fmtK(predicted),
      tip: `Predicted ${fmtFull(predicted)}`,
      highlight: true,
      color: "#db0011",
      dotR: 7,
    },
  ];

  const sorted = [...rawPts].sort((a, b) => a.value - b.value);

  const placed = sorted.map((p, i) => ({
    ...p,
    x: sx(p.value),
    onTop: i % 2 === 0,
  }));

  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h2 className="mb-2 text-sm font-medium text-ink-muted">
        Your prediction in the dataset
      </h2>
      <div className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Predicted price relative to dataset min, median, mean, max"
        >
          <line
            x1={sx(dLo)}
            x2={sx(dHi)}
            y1={LINE_Y}
            y2={LINE_Y}
            stroke="#e4e6e8"
            strokeWidth={LINE_H}
            strokeLinecap="round"
          />
          <line
            x1={sx(stats.min)}
            x2={sx(stats.max)}
            y1={LINE_Y}
            y2={LINE_Y}
            stroke="#c8ccd0"
            strokeWidth={LINE_H}
            strokeLinecap="round"
          />

          {placed.map((p) => (
            <g key={p.key}>
              <circle
                cx={p.x}
                cy={LINE_Y}
                r={p.dotR}
                fill={p.color}
                stroke={p.highlight ? "#ffffff" : "none"}
                strokeWidth={p.highlight ? 2 : 0}
                style={{ cursor: "pointer" }}
              >
                <title>{p.tip}</title>
              </circle>

              {p.highlight ? (
                <line
                  x1={p.x}
                  x2={p.x}
                  y1={LINE_Y - 12}
                  y2={LINE_Y}
                  stroke="#db0011"
                  strokeWidth={1.5}
                />
              ) : null}

              <text
                x={p.x}
                y={p.onTop ? LINE_Y - 8 : LINE_Y + 20}
                textAnchor="middle"
                fontSize={p.highlight ? 12 : 11}
                fontWeight={p.highlight ? 600 : 400}
                fill={p.color}
              >
                {p.shortLabel}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}