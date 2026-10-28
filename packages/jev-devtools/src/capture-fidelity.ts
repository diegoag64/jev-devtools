import type { CaptureFidelity } from "./protocol.js";

/** Combine stages without upgrading missing or uncertain provenance. */
export function combineCaptureFidelity(
  ...stages: (CaptureFidelity | undefined)[]
): CaptureFidelity {
  if (stages.includes("modified")) return "modified";
  return stages.every((stage) => stage === "exact") ? "exact" : "unknown";
}
