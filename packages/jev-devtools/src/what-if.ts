import type { Trace } from "./protocol.js";
import type { FlowDefinition, FlowRun } from "./flow-protocol.js";

/** A numeric literal compared with a reference in a captured branch or if rule. */
export type WhatIfThreshold = {
  /** `${nodeId}#${operand path}`, for example `approval#0.1`. */
  id: string;
  nodeId: string;
  op: "lt" | "gt" | "gte";
  value: number;
  /** Noul probability: displayed as a percentage. */
  probability: boolean;
  label: string;
};
/** Threshold id to replacement value. Ids for other nodes are ignored. */
export type WhatIfOverrides = Record<string, number>;
export type WhatIfChange = {
  runId: string;
  nodeId: string;
  recorded: boolean;
  replayed: boolean;
};
export type WhatIfSummary = {
  evaluated: number;
  unavailable: number;
  changed: WhatIfChange[];
};
export type WhatIfLimit = "input" | "join" | "rule";
/** Resolved operands of every recorded decision; see prepareWhatIf(). */
export type WhatIfPrepared = {
  /** Decisions whose unmodified replay doesn't reproduce the record. */
  unavailable: number;
  decisions: {
    runId: string;
    nodeId: string;
    recorded: boolean;
    evaluate: Evaluate;
    operands: readonly unknown[];
  }[];
};

type Node = Record<string, unknown>;
const node = (value: unknown): value is Node =>
  !!value && typeof value === "object" && !Array.isArray(value);
const child = (path: string, index: number) =>
  path ? `${path}.${index}` : String(index);
// Placeholders the capture path writes (recorder.ts, flows.ts, flow/index.ts).
// Values a redact callback rewrites into other plausible values can't be detected.
const placeholders = new Set([
  "[redacted]",
  "[truncated]",
  "[rule truncated]",
  "[capture unavailable]",
  "[rule capture unavailable]",
  "[value unavailable]",
  "[circular/repeated reference]",
]);
const placeholder = (v: unknown) =>
  typeof v === "string" && placeholders.has(v);
const ordering = (op: unknown): op is WhatIfThreshold["op"] =>
  op === "lt" || op === "gt" || op === "gte";
// Merges copy their if's decision and loops only record the final stopping
// check (a new gate changes the iterations), so only these kinds replay.
const decides = (kind: string) => kind === "branch" || kind === "if";

/**
 * Thresholds of every captured branch and if rule, in definition and operand
 * order. Item programs (map and loop itemDefinition) are listed separately.
 */
export function whatIfThresholds(
  definition: FlowDefinition,
): WhatIfThreshold[] {
  const found: WhatIfThreshold[] = [];
  for (const step of definition.nodes) {
    if (!decides(step.kind)) continue;
    const visit = (rule: unknown, path: string, depth: number) => {
      if (depth > 64 || !node(rule) || !Array.isArray(rule.args)) return;
      const [left, right] = rule.args;
      if (
        ordering(rule.op) &&
        rule.args.length === 2 &&
        node(left) &&
        left.op === "reference" &&
        node(right) &&
        right.op === "literal" &&
        typeof right.value === "number" &&
        Number.isFinite(right.value)
      ) {
        found.push({
          id: `${step.id}#${child(path, 1)}`,
          nodeId: step.id,
          op: rule.op,
          value: right.value,
          probability: left.probability === true,
          label:
            typeof left.label === "string"
              ? left.label
              : "[reference unavailable]",
        });
        return;
      }
      rule.args.forEach((arg, i) => visit(arg, child(path, i), depth + 1));
    };
    visit(step.conditionRule, "", 0);
  }
  return found;
}

const missing = Symbol("missing");
type Value = unknown | typeof missing;
const scalar = (v: unknown) =>
  v === null || ["string", "number", "boolean"].includes(typeof v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
// recorder.ts keeps the first 150 entries of an array and at most 16,000
// characters of a string (fewer once the capture budget runs low), and warns
// when it cuts either.
const collectionCap = 150;
const collectionCut = "Long collection truncated in capture.";
const textCap = 16_000;
const textCut = "Long text truncated in capture.";

// Flow input, parallel join and collection values have no stepId: they are
// not captured. Task, merge and loop references (source "task") read the
// step's captured output; request references read the linked trace's result.
function resolveReference(
  ref: Node,
  run: FlowRun,
  traces: ReadonlyMap<string, Trace>,
): Value {
  if (typeof ref.stepId !== "string" || !Array.isArray(ref.path))
    return missing;
  const step = Object.hasOwn(run.steps, ref.stepId)
    ? run.steps[ref.stepId]
    : undefined;
  let value: unknown, warnings: unknown;
  if (ref.source === "task") {
    // An unfinished task has input only.
    const data: unknown = step?.data;
    value =
      node(data) && Object.hasOwn(data, "output") ? data.output : undefined;
    warnings = step?.captureWarnings;
  } else {
    const trace = step?.traceId ? traces.get(step.traceId) : undefined;
    value = trace?.result;
    warnings = trace?.captureWarnings;
  }
  if (value === undefined || placeholder(value)) return missing;
  // A full-size array may have been cut: unless the capture says nothing was,
  // its length isn't the recorded length.
  const cut = !Array.isArray(warnings) || warnings.includes(collectionCut);
  // A budget cut can leave any length, so a text warning covers every string
  // in that capture. Without warnings only a full-length string is suspect.
  const textCutAt = !Array.isArray(warnings)
    ? textCap
    : warnings.includes(textCut)
      ? 0
      : Infinity;
  for (const key of ref.path) {
    // Missing and inherited keys are missing values (server get() semantics).
    if (
      typeof key !== "string" ||
      !value ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key) ||
      (key === "length" &&
        Array.isArray(value) &&
        value.length >= collectionCap &&
        cut)
    )
      return missing;
    value = (value as Node)[key];
    if (value === undefined) return missing;
  }
  return placeholder(value) ||
    (typeof value === "string" && value.length >= textCutAt)
    ? missing
    : value;
}

/**
 * Re-evaluates a captured rule against the answers recorded for one run, with
 * the server's evaluate() semantics. Returns undefined when any value is not
 * captured or any operand is invalid; never makes a Jev call or throws.
 */
export function evaluateRecordedCondition(
  nodeId: string,
  rule: unknown,
  run: FlowRun,
  traces: ReadonlyMap<string, Trace>,
  overrides: WhatIfOverrides = {},
): boolean | undefined {
  const { evaluate, references } = compile(nodeId, rule);
  return outcome(
    evaluate(
      references.map((ref) => resolveReference(ref, run, traces)),
      overrides,
    ),
  );
}

type Evaluate = (
  operands: readonly Value[],
  overrides: WhatIfOverrides,
) => Value;
const outcome = (value: Value) =>
  typeof value === "boolean" ? value : undefined;

// Turns a rule into a function of its resolved references (by index) and the
// overrides, so a rule is walked once however many runs replay it. Evaluation
// is pure, so stopping at the first missing operand matches evaluate(), which
// evaluates every operand.
function compile(nodeId: string, rule: unknown) {
  const references: Node[] = [];
  const cut = cutOperands(rule);
  const visit = (rule: unknown, path: string, depth: number): Evaluate => {
    if (depth > 64 || !node(rule) || cut.has(rule)) return () => missing;
    if (rule.op === "reference") {
      const index = references.push(rule) - 1;
      return (operands) => operands[index];
    }
    if (rule.op === "literal") {
      const key = `${nodeId}#${path}`;
      const captured = rule.value;
      return (_, overrides) => {
        const value = Object.hasOwn(overrides, key) ? overrides[key] : captured;
        return value === undefined || placeholder(value) ? missing : value;
      };
    }
    if (!Array.isArray(rule.args)) return () => missing;
    const args = rule.args.map((arg, i) =>
      visit(arg, child(path, i), depth + 1),
    );
    const { op } = rule;
    return (operands, overrides) => {
      const values: Value[] = [];
      for (const arg of args) {
        const value = arg(operands, overrides);
        if (value === missing) return missing;
        values.push(value);
      }
      if (op === "all" || op === "any" || op === "not") {
        if (values.some((v) => typeof v !== "boolean")) return missing;
        if (op === "not") return values.length === 1 ? !values[0] : missing;
        return op === "all" ? values.every(Boolean) : values.some(Boolean);
      }
      if (values.length !== 2) return missing;
      const [a, b] = values;
      if (op === "eq")
        return scalar(a) &&
          scalar(b) &&
          typeof a === typeof b &&
          (typeof a !== "number" || (finite(a) && finite(b)))
          ? a === b
          : missing;
      if (!ordering(op)) return missing;
      if (!finite(a) || !finite(b)) return missing;
      return op === "lt" ? a < b : op === "gt" ? a > b : a >= b;
    };
  };
  return { evaluate: visit(rule, "", 0), references };
}

/**
 * Literals and references of a captured rule that may hold a cut string. Rule
 * capture (recorder.ts capture()) cuts a string to min(remaining budget,
 * 16,000) characters, and flows.ts drops the rule's capture warnings, so the
 * cut is inferred by replaying the budget over the captured rule: 96,000,
 * minus 8 plus the key length per visited value, minus each string's length,
 * in capture order. A string as long as its limit at that point may have been
 * cut. Placeholders written without spending budget make the estimate lower,
 * so it errs toward unavailable. A path at the 150-entry array bound may also
 * have been cut.
 */
function cutOperands(rule: unknown): Set<unknown> {
  const cut = new Set<unknown>();
  let budget = 96_000;
  const visit = (value: unknown, key: string, owner: unknown) => {
    budget -= 8 + key.length;
    if (budget <= 0) return; // Captured as "[truncated]": already unavailable.
    if (typeof value === "string") {
      if (value.length >= Math.min(budget, textCap) && owner) cut.add(owner);
      budget -= value.length;
      return;
    }
    if (!value || typeof value !== "object") return;
    if (node(value) && (value.op === "literal" || value.op === "reference"))
      owner = value;
    if (Array.isArray(value)) {
      if (value.length >= collectionCap && owner) cut.add(owner);
      value.forEach((v, i) => visit(v, String(i), owner));
    } else for (const [k, v] of Object.entries(value)) visit(v, k, owner);
  };
  visit(rule, "", undefined);
  return cut;
}

/**
 * Resolves the operands of every recorded branch and if decision of one
 * definition's runs once, so overrides only re-compare them. A decision counts
 * only when the unmodified replay reproduces it. Pass whatIfItemRuns() with an
 * itemDefinition to cover item-level decisions.
 */
export function prepareWhatIf(
  definition: FlowDefinition,
  runs: readonly FlowRun[],
  traces: ReadonlyMap<string, Trace>,
): WhatIfPrepared {
  const prepared: WhatIfPrepared = { unavailable: 0, decisions: [] };
  const rules = new Map(
    definition.nodes
      .filter((step) => decides(step.kind))
      .map((step) => [step.id, compile(step.id, step.conditionRule)]),
  );
  for (const run of runs) {
    if (run.definitionId !== definition.id) continue;
    for (const [nodeId, { evaluate, references }] of rules) {
      const recorded = Object.hasOwn(run.steps, nodeId)
        ? run.steps[nodeId].decision
        : undefined;
      if (typeof recorded !== "boolean") continue;
      const operands = references.map((ref) =>
        resolveReference(ref, run, traces),
      );
      if (outcome(evaluate(operands, {})) !== recorded) {
        prepared.unavailable++;
        continue;
      }
      prepared.decisions.push({
        runId: run.id,
        nodeId,
        recorded,
        evaluate,
        operands,
      });
    }
  }
  return prepared;
}

/** Re-compares prepared decisions with the overrides applied. */
export function countWhatIf(
  prepared: WhatIfPrepared,
  overrides: WhatIfOverrides,
): WhatIfSummary {
  const summary: WhatIfSummary = {
    evaluated: 0,
    unavailable: prepared.unavailable,
    changed: [],
  };
  for (const decision of prepared.decisions) {
    const { runId, nodeId, recorded } = decision;
    const replayed = outcome(decision.evaluate(decision.operands, overrides));
    if (replayed === undefined) {
      summary.unavailable++;
      continue;
    }
    summary.evaluated++;
    if (replayed !== recorded)
      summary.changed.push({ runId, nodeId, recorded, replayed });
  }
  return summary;
}

/**
 * Replays recorded branch and if decisions of one definition's runs. A
 * decision counts as evaluated only when the unmodified replay reproduces it.
 * Pass whatIfItemRuns() with an itemDefinition to count item-level decisions.
 */
export function whatIfAcrossRuns(
  definition: FlowDefinition,
  runs: readonly FlowRun[],
  traces: ReadonlyMap<string, Trace>,
  overrides: WhatIfOverrides,
): WhatIfSummary {
  return countWhatIf(prepareWhatIf(definition, runs, traces), overrides);
}

/**
 * Recorded values compared with one threshold: the reference operand of its
 * comparison, per retained run of this definition where it resolves to a finite number.
 */
export function whatIfValues(
  definition: FlowDefinition,
  runs: readonly FlowRun[],
  traces: ReadonlyMap<string, Trace>,
  thresholdId: string,
): { runId: string; value: number }[] {
  const threshold = whatIfThresholds(definition).find(
    (t) => t.id === thresholdId,
  );
  const step = definition.nodes.find((n) => n.id === threshold?.nodeId);
  if (!threshold || !step) return [];
  // The id ends with the literal's operand path; its comparison is the parent.
  let comparison: unknown = step.conditionRule;
  for (const index of thresholdId
    .slice(step.id.length + 1)
    .split(".")
    .slice(0, -1))
    comparison =
      node(comparison) && Array.isArray(comparison.args)
        ? comparison.args[Number(index)]
        : undefined;
  const ref =
    node(comparison) && Array.isArray(comparison.args)
      ? comparison.args[0]
      : undefined;
  // A reference whose captured path may have been cut reads another value.
  if (!node(ref) || cutOperands(step.conditionRule).has(ref)) return [];
  const values: { runId: string; value: number }[] = [];
  for (const run of runs) {
    if (run.definitionId !== definition.id) continue;
    const value = resolveReference(ref, run, traces);
    if (finite(value)) values.push({ runId: run.id, value });
  }
  return values;
}

/** Reasons a rule can never replay, read from its captured structure only. */
export function whatIfLimits(
  rule: unknown,
  definition?: FlowDefinition,
): WhatIfLimit[] {
  const limits = new Set<WhatIfLimit>();
  // A reference without stepId is flow input unless a node (a join or a
  // collection) is named "input".
  const input = !definition?.nodes.some((n) => n.id === "input");
  if (cutOperands(rule).size) limits.add("rule");
  const visit = (rule: unknown, depth: number) => {
    if (depth > 64 || !node(rule)) return void limits.add("rule");
    if (rule.op === "reference") {
      if (typeof rule.stepId === "string") return;
      const label = typeof rule.label === "string" ? rule.label : "";
      limits.add(
        input &&
          (label === "input" ||
            label.startsWith("input.") ||
            label.startsWith("input["))
          ? "input"
          : "join",
      );
      return;
    }
    if (rule.op === "literal") {
      if (placeholder(rule.value)) limits.add("rule");
      return;
    }
    if (
      !["eq", "lt", "gt", "gte", "all", "any", "not"].includes(
        String(rule.op),
      ) ||
      !Array.isArray(rule.args)
    )
      return void limits.add("rule");
    const [, right] = rule.args;
    // Ordering against a non-numeric literal: the threshold was redacted or lost.
    if (
      ordering(rule.op) &&
      (rule.args.length !== 2 ||
        (node(right) && right.op === "literal" && !finite(right.value)))
    )
      limits.add("rule");
    for (const arg of rule.args) visit(arg, depth + 1);
  };
  visit(rule, 0);
  return [...limits];
}

/**
 * Item runs of a map or loop node: for each parent run in order, the run of
 * every recorded item in item order. Items without a run are skipped. One
 * level only; it doesn't filter by definition (whatIfAcrossRuns does).
 */
export function whatIfItemRuns(
  parentRuns: readonly FlowRun[],
  nodeId: string,
): FlowRun[] {
  const found: FlowRun[] = [];
  for (const parent of parentRuns) {
    if (!node(parent?.steps) || !Object.hasOwn(parent.steps, nodeId)) continue;
    const items = parent.steps[nodeId]?.collection?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) if (node(item?.run)) found.push(item.run);
  }
  return found;
}
