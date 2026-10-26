import { MIN_PROBABILITY, NUM_SAMPLES, rubric, post } from "./recipe.js";
export type RawAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type Cell = {
  key: string;
  labels: string[];
  values: (number | null)[];
  rawLabel: string | null;
  topProbability: number | null;
  valid: boolean;
  decision: string | null;
};
// Missing/non-numeric values stay missing; neither normalize nor repair vectors.
function numeric(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    typeof value !== "string" &&
    typeof value !== "boolean"
  )
    return null;
  let parsed = value;
  if (typeof value === "string") {
    // Python float() accepts Unicode decimal digits and underscores between
    // digits, but not JS radix literals or the BOM that String.trim() removes.
    // Nonfinite spellings also fail this grammar, matching _numeric_value's
    // subsequent isfinite check. Never partially parse or normalize a vector.
    const decimal = value
      .replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "")
      .replace(/\p{Decimal_Number}/gu, (digit) => {
        const point = digit.codePointAt(0)!;
        let start = point;
        // Nd code points occur in consecutive groups of the digits 0–9;
        // adjacent groups (e.g. mathematical digits) share one contiguous run.
        while (/\p{Decimal_Number}/u.test(String.fromCodePoint(start - 1)))
          start--;
        return String((point - start) % 10);
      });
    if (
      !/^[+-]?(?:[0-9](?:_?[0-9])*(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/.test(
        decimal,
      )
    )
      return null;
    parsed = decimal.replaceAll("_", "");
  }
  const number = Number(parsed);
  return Number.isFinite(number) ? number : null;
}
function analyzeDistribution(
  key: string,
  labels: string[],
  values: unknown[],
): Omit<Cell, "decision"> {
  const parsed = labels.map((_, i) => numeric(values[i]));
  const complete = parsed.length > 0 && parsed.every((p) => p !== null);
  const topProbability = complete ? Math.max(...(parsed as number[])) : null;
  // np.argmax resolves ties to the first label in rubric order.
  const rawLabel = complete ? labels[parsed.indexOf(topProbability!)] : null;
  return {
    key,
    labels,
    values: parsed,
    rawLabel,
    topProbability,
    valid: complete && parsed.every((p) => p! >= 0 && p! <= 1),
  };
}
export function readAnswers(answers: Record<string, RawAnswer>) {
  return Object.entries(rubric).map(([key, [, criteria]]) => {
    const labels = Object.keys(criteria);
    const cell = analyzeDistribution(
      key,
      labels,
      labels.map((label) => answers[key]?.probabilities?.[label]),
    );
    return { ...cell, gateProbability: cell.topProbability ?? 0 };
  });
}
export type RepeatResult = {
  index: number;
  uid: string;
  source: "synthetic";
  answers: Record<string, RawAnswer>;
  cells: Cell[];
};
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
function plurality(values: (string | null)[]) {
  const counts = new Map<string, number>();
  for (const value of values)
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.max(0, ...counts.values()) / NUM_SAMPLES;
}
export function aggregate(samples: RepeatResult[]) {
  if (samples.length !== NUM_SAMPLES)
    throw new Error("Expected exactly 15 rubric responses");
  const rows = Object.entries(rubric).map(([key, [instructions, criteria]]) => {
    const labels = Object.keys(criteria);
    const cells = samples.map(
      (sample) => sample.cells.find((cell) => cell.key === key)!,
    );
    const labelStds = labels.map((_, i) => {
      const values = cells
        .map((cell) => cell.values[i])
        .filter((p): p is number => p !== null);
      const average = mean(values);
      return average === null
        ? null
        : Math.sqrt(mean(values.map((p) => (p - average) ** 2))!);
    });
    const concrete = new Set(
      cells
        .map((c) => c.decision)
        .filter((d) => d !== null && d !== "uncertain"),
    );
    return {
      key,
      instructions,
      labels,
      cells,
      labelStds,
      rawAgreement: plurality(cells.map((c) => c.rawLabel)),
      policyAgreement: plurality(cells.map((c) => c.decision)),
      conflicts: concrete.size > 1,
    };
  });
  const cells = rows.flatMap((row) => row.cells);
  const stds = rows
    .flatMap((row) => row.labelStds)
    .filter((p): p is number => p !== null);
  return {
    post,
    samples,
    rows,
    threshold: MIN_PROBABILITY,
    stats: {
      rawAgreement: mean(rows.map((row) => row.rawAgreement))!,
      policyAgreement: mean(rows.map((row) => row.policyAgreement))!,
      uncertainRate:
        cells.filter((c) => c.decision === "uncertain").length / cells.length,
      automaticRate:
        cells.filter((c) => c.decision !== null && c.decision !== "uncertain")
          .length / cells.length,
      decisionFailureRate:
        cells.filter((c) => c.decision === null).length / cells.length,
      // Source probability_std_stats checks missing values, separately from range-invalid policy decisions.
      parseFailureRate:
        cells.filter((c) => c.values.some((p) => p === null)).length /
        cells.length,
      conflicts: rows.filter((row) => row.conflicts).length,
      meanProbabilityStd: mean(stds),
      maxProbabilityStd: stds.length ? Math.max(...stds) : null,
    },
  };
}
export type ConsistencyResult = ReturnType<typeof aggregate>;
