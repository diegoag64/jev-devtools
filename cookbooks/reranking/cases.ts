const message =
  "A court may not enter summary judgment merely because the opposing party failed to respond. It must determine whether the movant has shown the absence of a genuine dispute of material fact and entitlement to judgment as a matter of law. [Citation removed.]";
export const rerankingCases = {
  reordered: {
    label: "Reorder a shortlist · synthetic probabilities",
    message,
  },
  ties: { label: "All probabilities tied · retain retrieval order", message },
} as const;
export type RerankingCase = keyof typeof rerankingCases;
export const isRerankingCase = (value: unknown): value is RerankingCase =>
  typeof value === "string" && Object.hasOwn(rerankingCases, value);
