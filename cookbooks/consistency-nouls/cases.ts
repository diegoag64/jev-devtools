export const noulCases = {
  variation: {
    label: "Authored variation · review band",
    message:
      "Apply the official 14-question rubric to claim CLM-55029 fifteen times using authored synthetic probabilities.",
  },
  boundaries: {
    label: "Boundary fixtures · 0.30 and 0.70 inclusive",
    message:
      "Exercise exact and neighboring review-band boundaries on the official claim using fifteen synthetic requests.",
  },
  stable: {
    label: "Identical fixtures · no measured consistency",
    message:
      "Repeat an identical authored answer vector fifteen times. This is a deterministic fixture, not evidence of model consistency.",
  },
} as const;
export type NoulCase = keyof typeof noulCases;
export function isNoulCase(value: unknown): value is NoulCase {
  return typeof value === "string" && Object.hasOwn(noulCases, value);
}
