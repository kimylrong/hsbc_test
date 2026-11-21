"use client";

import { useEffect, useRef, useState } from "react";
import { DIMENSIONS, EMPTY_FILTERS } from "@/lib/constants";
import type { FilterDimension, MarketFilter } from "@/lib/types";

function MultiSelectDropdown({
  label,
  buckets,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  buckets: string[];
  selected: string[];
  onToggle: (bucket: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openDropdown = () => {
    setOpen(true);
    setFocusIdx(0);
  };
  const closeDropdown = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDropdown();
        triggerRef.current?.focus();
        return;
      }
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, buckets.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const bucket = buckets[focusIdx];
        if (bucket) onToggle(bucket);
      } else if (e.key === "Tab") {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, buckets, focusIdx, onToggle]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeDropdown() : openDropdown())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter by ${label}${selected.length > 0 ? `, ${selected.length} selected` : ""}`}
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
          selected.length > 0
            ? "border-primary bg-primary/5 text-ink"
            : "border-line bg-surface text-ink hover:border-ink-muted"
        }`}
      >
        <span className="font-medium">{label}</span>
        {selected.length > 0 ? (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-white">
            {selected.length}
          </span>
        ) : null}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={open ? "rotate-180 transition" : "transition"}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          className="animate-dropdown-in absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between gap-2 border-b border-line px-2 py-1.5">
            <span className="truncate text-xs font-medium text-ink-muted">
              {label}
            </span>
            {selected.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  triggerRef.current?.focus();
                  setOpen(false);
                }}
                title={`Clear ${label}`}
                aria-label={`Clear ${label}`}
                className="rounded p-1 text-ink-muted transition hover:bg-surface-muted hover:text-primary"
              >
                <svg
                  width="14"
                  height="14"
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
            ) : null}
          </div>
          <ul className="max-h-64 overflow-auto">
            {buckets.map((bucket, idx) => {
              const checked = selected.includes(bucket);
              const isFocused = idx === focusIdx;
              return (
                <li
                  key={bucket}
                  role="option"
                  aria-selected={checked}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink ${
                    isFocused ? "bg-surface-muted" : "hover:bg-surface-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(bucket)}
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                  />
                  <span>{bucket}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
  activeCount,
}: {
  filters: MarketFilter;
  onChange: (filters: MarketFilter) => void;
  activeCount: number;
}) {
  const toggle = (dim: FilterDimension, bucket: string) => {
    const current = filters[dim];
    const next = current.includes(bucket)
      ? current.filter((b) => b !== bucket)
      : [...current, bucket];
    onChange({ ...filters, [dim]: next });
  };

  const clear = (dim: FilterDimension) => {
    onChange({ ...filters, [dim]: [] });
  };

  return (
    <section
      aria-label="Filters"
      className="rounded-xl border border-line bg-surface p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Filters {activeCount > 0 ? `(${activeCount} selected)` : ""}
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {DIMENSIONS.map((dim) => (
          <MultiSelectDropdown
            key={dim.key}
            label={dim.label}
            buckets={dim.buckets}
            selected={filters[dim.key]}
            onToggle={(bucket) => toggle(dim.key, bucket)}
            onClear={() => clear(dim.key)}
          />
        ))}
      </div>
    </section>
  );
}