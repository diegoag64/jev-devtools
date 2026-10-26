/** Browser-safe selectors. Pair assets and synthetic answers stay on the server. */
export const entityCases = {
  same: {
    label: "c446 · same product",
    message: "Compare official example pair c446 with synthetic judgments.",
  },
  different: {
    label: "c427 · different products",
    message: "Compare official example pair c427 with synthetic judgments.",
  },
  style: {
    label: "c100 · style disagreement",
    message: "Compare official example pair c100 with synthetic judgments.",
  },
  variant: {
    label: "c428 · possible variant",
    message: "Compare official example pair c428 with synthetic judgments.",
  },
  belowLower: {
    label: "Score 0.499 · below lower boundary",
    message: "Reuse c428 with a synthetic Score of 0.499.",
  },
  atLower: {
    label: "Score 0.5 · lower boundary equality",
    message: "Reuse c428 with a synthetic Score of 0.5.",
  },
  aboveLower: {
    label: "Score 0.501 · above lower boundary",
    message: "Reuse c428 with a synthetic Score of 0.501.",
  },
  belowUpper: {
    label: "Score 1.499 · below upper boundary",
    message: "Reuse c428 with a synthetic Score of 1.499.",
  },
  atUpper: {
    label: "Score 1.5 · upper boundary equality",
    message: "Reuse c428 with a synthetic Score of 1.5.",
  },
  aboveUpper: {
    label: "Score 1.501 · above upper boundary",
    message: "Reuse c428 with a synthetic Score of 1.501.",
  },
} as const;
export type EntityCase = keyof typeof entityCases;
export function isEntityCase(value: unknown): value is EntityCase {
  return typeof value === "string" && Object.hasOwn(entityCases, value);
}
