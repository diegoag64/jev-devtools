import type { Json } from "./protocol.js";

export function formatConditionLiteral(
  value: Json,
  probability = false,
): string {
  if (probability && typeof value === "number" && value >= 0 && value <= 1) {
    const [coefficient, exponent = "0"] = String(value).split("e");
    return `${Number(`${coefficient}e${Number(exponent) + 2}`)}%`;
  }
  return JSON.stringify(value) ?? "[value unavailable]";
}

/** Format captured rules only; never evaluate or infer the branch result. */
export function formatFlowCondition(value: Json, depth = 0): string {
  if (depth > 16) return "[rule truncated]";
  if (!value || typeof value !== "object" || Array.isArray(value))
    return typeof value === "string" ? value : "[rule unavailable]";
  if (value.op === "reference")
    return typeof value.label === "string"
      ? value.label
      : "[reference unavailable]";
  if (value.op === "literal") return formatConditionLiteral(value.value);
  if (!Array.isArray(value.args)) return "[rule unavailable]";
  const args = value.args;
  const format = (v: Json) => formatFlowCondition(v, depth + 1);
  if (value.op === "not") return `NOT (${format(args[0])})`;
  if (value.op === "all" || value.op === "any") {
    if (!args.length)
      return value.op === "all"
        ? "TRUE (no conditions)"
        : "FALSE (no conditions)";
    return `(${args.map(format).join(value.op === "all" ? " AND " : " OR ")})`;
  }
  if (
    !["eq", "lt", "gt", "gte"].includes(String(value.op)) ||
    args.length !== 2
  )
    return "[rule unavailable]";
  const probability = args.some(
    (arg) =>
      arg &&
      typeof arg === "object" &&
      !Array.isArray(arg) &&
      arg.op === "reference" &&
      arg.probability === true,
  );
  const operand = (arg: Json) =>
    arg &&
    typeof arg === "object" &&
    !Array.isArray(arg) &&
    arg.op === "literal"
      ? formatConditionLiteral(arg.value, probability)
      : format(arg);
  return `${operand(args[0])} ${value.op === "eq" ? "=" : value.op === "lt" ? "<" : value.op === "gt" ? ">" : "≥"} ${operand(args[1])}`;
}
