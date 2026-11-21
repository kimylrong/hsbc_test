import type {
  AnalyzeResponse,
  EstimateRecord,
  HouseFeatures,
  MarketFilter,
  PredictResponse,
  WhatIfResponse,
} from "./types";

const TIMEOUT_MS = 15_000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
        else if (typeof body?.message === "string") detail = body.message;
        else if (Array.isArray(body?.errors)) {
          detail = body.errors
            .map((e: { field?: string; message?: string }) =>
              `${e.field ?? ""} ${e.message ?? ""}`.trim(),
            )
            .join("; ");
        }
      } catch {
        // keep statusText fallback
      }
      throw new Error(
        detail ? `Request failed (${res.status}): ${detail}` : `Request failed (${res.status})`,
      );
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function postAnalyze(filters: MarketFilter): Promise<AnalyzeResponse> {
  return fetchJson<AnalyzeResponse>("/api/market/analyze", {
    method: "POST",
    body: JSON.stringify(filters),
  });
}

export function postWhatIf(
  baseline: HouseFeatures,
  modified: HouseFeatures,
): Promise<WhatIfResponse> {
  return fetchJson<WhatIfResponse>("/api/market/what-if", {
    method: "POST",
    body: JSON.stringify({ baseline, modified }),
  });
}

export function postPredict(features: HouseFeatures): Promise<PredictResponse> {
  return fetchJson<PredictResponse>("/api/estimator/predict", {
    method: "POST",
    body: JSON.stringify(features),
  });
}

export function getHistory(): Promise<EstimateRecord[]> {
  return fetchJson<EstimateRecord[]>("/api/estimator/history");
}