import { headers } from "next/headers";

import { EMPTY_FILTERS } from "./constants";
import type { AnalyzeResponse, EstimateRecord } from "./types";

const PY_BACKEND_URL = process.env.PY_BACKEND_URL ?? "http://localhost:8020";
const JAVA_BACKEND_URL = process.env.JAVA_BACKEND_URL ?? "http://localhost:8030";

async function _tracedInit(init?: RequestInit): Promise<RequestInit> {
  try {
    const incoming = await headers();
    const traceId = incoming.get("x-trace-id");
    const h = new Headers(init?.headers);
    if (traceId) h.set("X-Trace-ID", traceId);
    return { ...init, headers: h };
  } catch {
    return init ?? {};
  }
}

export async function fetchHistoryServer(): Promise<EstimateRecord[]> {
  try {
    const res = await fetch(`${PY_BACKEND_URL}/api/estimator/history`, {
      ...(await _tracedInit({ cache: "no-store" })),
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
      ...(await _tracedInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(EMPTY_FILTERS),
        cache: "no-store",
      })),
    });
    if (!res.ok) return null;
    return (await res.json()) as AnalyzeResponse;
  } catch {
    return null;
  }
}