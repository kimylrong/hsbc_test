import { EMPTY_FILTERS } from "./constants";
import type { AnalyzeResponse, EstimateRecord } from "./types";

// Server-side only (used by React Server Components for initial prefetch).
// Reads the internal backend URLs directly to avoid CORS and round-tripping
// through the portal's own rewrites.
const PY_BACKEND_URL = process.env.PY_BACKEND_URL ?? "http://localhost:8001";
const JAVA_BACKEND_URL = process.env.JAVA_BACKEND_URL ?? "http://localhost:8080";

export async function fetchHistoryServer(): Promise<EstimateRecord[]> {
  try {
    const res = await fetch(`${PY_BACKEND_URL}/api/estimator/history`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as EstimateRecord[];
  } catch {
    return [];
  }
}

export async function fetchInitialAnalysisServer(): Promise<AnalyzeResponse | null> {
  try {
    const res = await fetch(`${JAVA_BACKEND_URL}/api/market/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(EMPTY_FILTERS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AnalyzeResponse;
  } catch {
    return null;
  }
}