export const consistencyCases = {
  varying: {
    label: "Varying labels and abstentions · synthetic",
    message:
      "Official borderline moderation post · 15 authored varying rubric responses",
  },
  boundaries: {
    label: "0.60 boundary and confidence contrast · synthetic",
    message:
      "Official borderline moderation post · authored 0.599 / 0.600 / 0.601 probes",
  },
  stable: {
    label: "Stable labels, moving probabilities · synthetic",
    message:
      "Official borderline moderation post · authored stable labels with varying probabilities",
  },
} as const;
export type ConsistencyCase = keyof typeof consistencyCases;
export const isConsistencyCase = (value: unknown): value is ConsistencyCase =>
  typeof value === "string" && Object.hasOwn(consistencyCases, value);
