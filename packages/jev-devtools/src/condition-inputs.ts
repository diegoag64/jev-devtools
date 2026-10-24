import type { Json, Trace } from "./protocol.js";
import type { FlowRun } from "./flow-protocol.js";
import {
  formatFlowCondition,
  formatConditionLiteral,
} from "./flow-condition.js";
export type ConditionInput = { reference: string; name: string; value: string };
export function conditionInputs(
  rule: Json,
  run: FlowRun,
  traces: Map<string, Trace>,
  stepNames = new Map<string, string>(),
): ConditionInput[] {
  const inputs = new Map<string, ConditionInput>();
  const sources = new Map<string, string>();
  const visit = (node: Json, depth = 0) => {
    if (depth > 16 || !node || typeof node !== "object" || Array.isArray(node))
      return;
    if (
      node.op === "reference" &&
      typeof node.label === "string" &&
      !inputs.has(node.label)
    ) {
      const name = typeof node.name === "string" ? node.name : "Input";
      const readable = name
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2");
      const trace =
        typeof node.stepId === "string"
          ? traces.get(run.steps[node.stepId]?.traceId ?? "")
          : undefined;
      let value: unknown = trace?.result;
      let available = !!trace?.result;
      if (node.source === "task" && typeof node.stepId === "string") {
        const data = run.steps[node.stepId]?.data;
        available =
          !!data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          Object.hasOwn(data, "output");
        value = available ? (data as Record<string, Json>).output : undefined;
      }
      if (
        !Array.isArray(node.path) ||
        !node.path.every((key) => typeof key === "string")
      )
        available = false;
      else
        for (const key of node.path) {
          if (
            !available ||
            !value ||
            typeof value !== "object" ||
            !Object.hasOwn(value, String(key))
          ) {
            available = false;
            break;
          }
          value = (value as Record<string, unknown>)[String(key)];
        }
      const text = !available
        ? "Not captured"
        : node.probability === true &&
            typeof value === "number" &&
            Number.isFinite(value)
          ? formatConditionLiteral(value, true)
          : typeof value === "object" && value !== null
            ? "Structured value"
            : String(value);
      if (typeof node.stepId === "string")
        sources.set(node.label, stepNames.get(node.stepId) ?? node.stepId);
      inputs.set(node.label, {
        reference: node.label,
        name: readable.charAt(0).toUpperCase() + readable.slice(1),
        value: text,
      });
    }
    if (Array.isArray(node.args))
      for (const arg of node.args) visit(arg, depth + 1);
  };
  visit(rule);
  const list = [...inputs.values()];
  return list.map((input) =>
    list.filter((other) => other.name === input.name).length > 1
      ? {
          ...input,
          name: `${input.name} · ${sources.get(input.reference) ?? input.reference}`,
        }
      : input,
  );
}
export function conditionRequirement(
  rule: Json,
  inputs: ConditionInput[],
): string {
  const names = new Map(inputs.map((input) => [input.reference, input.name]));
  // A single reference-to-literal comparison already has its subject in Incoming.
  if (
    rule &&
    typeof rule === "object" &&
    !Array.isArray(rule) &&
    Array.isArray(rule.args) &&
    rule.args.length === 2
  ) {
    const [left, right] = rule.args;
    if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right) &&
      left.op === "reference" &&
      right.op === "literal" &&
      ["gte", "lt", "gt", "eq"].includes(String(rule.op))
    ) {
      return `${rule.op === "gte" ? "At least" : rule.op === "lt" ? "Less than" : rule.op === "gt" ? "Greater than" : "Equal to"} ${formatConditionLiteral(right.value, left.probability === true)}`;
    }
  }
  const rename = (node: Json, depth = 0): Json => {
    if (depth > 16 || !node || typeof node !== "object" || Array.isArray(node))
      return node;
    if (node.op === "reference")
      return {
        ...node,
        label:
          typeof node.label === "string"
            ? names.get(node.label) ?? "Input"
            : "Input",
      };
    if (Array.isArray(node.args))
      return { ...node, args: node.args.map((arg) => rename(arg, depth + 1)) };
    return node;
  };
  return formatFlowCondition(rename(rule));
}
