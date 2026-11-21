"use client";

import { useQuery } from "@tanstack/react-query";
import { postAnalyze } from "../api";
import type { AnalyzeResponse, MarketFilter } from "../types";

function isEmpty(filters: MarketFilter): boolean {
  return Object.values(filters).every((values) => values.length === 0);
}

export function useMarketAnalysis(
  filters: MarketFilter,
  initialData?: AnalyzeResponse,
) {
  return useQuery({
    queryKey: ["market", "analyze", filters],
    queryFn: () => postAnalyze(filters),
    // Seed the cache with the server-rendered result only for the unfiltered
    // query. Applying initialData to every filter query key would mark each new
    // query as fresh (staleTime below) and suppress the refetch that the user's
    // filter selection is meant to trigger.
    initialData: isEmpty(filters) ? initialData : undefined,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}