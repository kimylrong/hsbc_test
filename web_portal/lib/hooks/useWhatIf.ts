"use client";

import { useMutation } from "@tanstack/react-query";
import { postWhatIf } from "../api";
import type { HouseFeatures } from "../types";

export function useWhatIf() {
  return useMutation({
    mutationFn: ({
      baseline,
      modified,
    }: {
      baseline: HouseFeatures;
      modified: HouseFeatures;
    }) => postWhatIf(baseline, modified),
  });
}