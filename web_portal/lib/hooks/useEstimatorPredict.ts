"use client";

import { useMutation } from "@tanstack/react-query";
import { postPredict } from "../api";

export function useEstimatorPredict() {
  return useMutation({ mutationFn: postPredict });
}