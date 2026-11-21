"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  houseFeaturesSchema,
  type HouseFeaturesForm,
} from "@/lib/validation";
import { FEATURE_FIELDS } from "@/lib/constants";
import type { HouseFeatures } from "@/lib/types";

export function EstimatorForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (features: HouseFeatures) => void;
  isSubmitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<HouseFeaturesForm>({
    resolver: zodResolver(houseFeaturesSchema),
    mode: "onTouched",
  });

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(values))}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURE_FIELDS.map((field) => {
          const error = errors[field.key];
          return (
            <div key={field.key}>
              <label
                htmlFor={`feature-${field.key}`}
                className="block text-sm font-medium"
              >
                {field.label}{" "}
                <span className="text-primary" aria-hidden="true">
                  *
                </span>{" "}
                {field.unit ? (
                  <span className="text-ink-muted">({field.unit})</span>
                ) : null}
              </label>
              <div className="relative mt-1">
                <input
                  id={`feature-${field.key}`}
                  type="number"
                  step={field.step}
                  {...register(field.key, { valueAsNumber: true })}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`feature-${field.key}-hint`}
                  className={`w-full rounded-md border bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-1 ${
                    error
                      ? "border-primary pr-9 focus:border-primary focus:ring-primary"
                      : "border-line focus:border-ink focus:ring-ink"
                  }`}
                />
                {error ? (
                  <span
                    title={error.message}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-primary"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M12 7.5v5.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
                    </svg>
                  </span>
                ) : null}
              </div>
              <p
                id={`feature-${field.key}-hint`}
                className="mt-1 min-h-[1rem] text-xs"
              >
                {error ? (
                  <span className="text-primary">{error.message}</span>
                ) : (
                  <span className="text-ink-muted">Range: {field.hint}</span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !isValid}
        className="mt-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Estimating…" : "Get estimate"}
      </button>
    </form>
  );
}