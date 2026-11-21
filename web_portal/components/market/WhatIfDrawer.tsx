"use client";

import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useDialogHost } from "@/components/layout/A11yDialogHost";
import { useWhatIf } from "@/lib/hooks/useWhatIf";
import {
  houseFeaturesSchema,
  type HouseFeaturesForm,
} from "@/lib/validation";
import { FEATURE_FIELDS, recordToFeatures } from "@/lib/constants";
import type { HouseRecord } from "@/lib/types";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/format";

function fmtDelta(delta: number, digits: number) {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${sign}${Math.abs(delta).toFixed(digits)}`;
}

export function WhatIfDrawer({
  record,
  onClose,
}: {
  record: HouseRecord;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const host = useDialogHost();

  useEffect(() => {
    const unregister = host.register();
    return unregister;
  }, [host]);

  useFocusTrap(ref, true, onClose);

  const baseline = recordToFeatures(record);
  const whatIf = useWhatIf();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<HouseFeaturesForm>({
    resolver: zodResolver(houseFeaturesSchema),
    defaultValues: baseline,
  });

  const current = watch();

  const modifiedCount = useMemo(() => {
    let n = 0;
    for (const f of FEATURE_FIELDS) {
      const b = baseline[f.key];
      const c = current[f.key];
      if (
        Number.isFinite(b) &&
        Number.isFinite(c) &&
        Math.abs(c - b) > 1e-9
      ) {
        n++;
      }
    }
    return n;
  }, [current, baseline]);

  const onSubmit = (modified: HouseFeaturesForm) => {
    whatIf.mutate({ baseline, modified });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 overlay-base"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatif-drawer-title"
        className="animate-slide-in-right absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="whatif-drawer-title" className="text-lg font-semibold">
              What-if analysis
            </h2>
            <p className="text-xs text-ink-muted">
              Property #{record.id} · listed {formatCurrency(record.price)}
            </p>
          </div>
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink-muted">
              Adjust any feature below, then run the AI to see the resulting
              valuation.
            </p>
            {modifiedCount > 0 ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Modified {modifiedCount}/{FEATURE_FIELDS.length}
              </span>
            ) : null}
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-3">
              {FEATURE_FIELDS.map((field) => {
                const error = errors[field.key];
                const baselineVal = baseline[field.key];
                const currentVal = current[field.key];
                const isChanged =
                  Number.isFinite(baselineVal) &&
                  Number.isFinite(currentVal) &&
                  Math.abs(currentVal - baselineVal) > 1e-9;

                const digits =
                  field.step < 1 ? 1 : 0;
                const display = (v: number | undefined) =>
                  Number.isFinite(v)
                    ? (v as number).toFixed(digits).replace(/\.0+$/, "")
                    : "—";

                return (
                  <div
                    key={field.key}
                    className={`rounded-md border p-2 transition ${
                      isChanged
                        ? "border-primary/40 bg-primary/5"
                        : "border-line bg-white"
                    }`}
                  >
                    <label
                      htmlFor={`whatif-${field.key}`}
                      className={`block text-xs font-medium ${
                        isChanged ? "text-primary" : "text-ink-muted"
                      }`}
                    >
                      {field.label}
                    </label>
                    <div className="relative mt-1">
                      <input
                        id={`whatif-${field.key}`}
                        type="number"
                        step={field.step}
                        {...register(field.key, { valueAsNumber: true })}
                        aria-invalid={error ? true : undefined}
                        className={`w-full rounded border bg-white px-2 py-1.5 text-sm transition focus:outline-none focus:ring-1 ${
                          error
                            ? "border-primary focus:border-primary focus:ring-primary"
                            : isChanged
                              ? "border-primary focus:border-ink focus:ring-ink"
                              : "border-line focus:border-ink focus:ring-ink"
                        }`}
                      />
                    </div>
                    <p
                      className={`mt-1 min-h-[0.875rem] text-[11px] leading-tight ${
                        error
                          ? "text-primary"
                          : isChanged
                            ? "text-primary"
                            : "text-ink-muted/70"
                      }`}
                    >
                      {error ? (
                        error.message
                      ) : isChanged ? (
                        <>
                          {display(baselineVal)} → {display(currentVal)}{" "}
                          <span className="font-medium">
                            ({fmtDelta((currentVal as number) - baselineVal, digits)})
                          </span>
                        </>
                      ) : (
                        <>original: {display(baselineVal)}</>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
            <button
              type="submit"
              disabled={whatIf.isPending || modifiedCount === 0}
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {whatIf.isPending
                ? "Calculating…"
                : modifiedCount === 0
                  ? "Adjust a feature first"
                  : `Run what-if (${modifiedCount} changed)`}
            </button>
          </form>

          {whatIf.isError ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary-strong"
            >
              {whatIf.error instanceof Error
                ? whatIf.error.message
                : "What-if analysis failed."}
            </p>
          ) : null}

          {whatIf.data ? (
            <div className="mt-5 rounded-lg border border-line bg-surface-muted p-4">
              <h3 className="mb-3 text-sm font-semibold">Result</h3>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Baseline (AI)</dt>
                  <dd className="font-medium">
                    {formatCurrency(whatIf.data.baselinePrice)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Modified (AI)</dt>
                  <dd className="font-medium">
                    {formatCurrency(whatIf.data.modifiedPrice)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Listed price</dt>
                  <dd className="font-medium">{formatCurrency(record.price)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2">
                  <dt className="font-medium">Delta</dt>
                  <dd
                    className={`font-semibold ${
                      whatIf.data.deltaPrice >= 0
                        ? "text-primary"
                        : "text-ink-muted"
                    }`}
                  >
                    {formatSignedCurrency(whatIf.data.deltaPrice)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">Change</dt>
                  <dd
                    className={`font-semibold ${
                      whatIf.data.deltaPercent >= 0
                        ? "text-primary"
                        : "text-ink-muted"
                    }`}
                  >
                    {formatPercent(whatIf.data.deltaPercent)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}