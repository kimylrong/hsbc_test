"use client";

import { useQuery } from "@tanstack/react-query";
import { getHistory } from "../api";
import type { EstimateRecord } from "../types";

export function useEstimatorHistory(initialData?: EstimateRecord[]) {
  return useQuery({
    queryKey: ["estimator", "history"],
    queryFn: getHistory,
    initialData,
  });
}