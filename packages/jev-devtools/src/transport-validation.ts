import type { Json } from "./protocol.js";

export type Check<T> = (value: unknown) => value is T;
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const text: Check<string> = (value) => typeof value === "string";
export const id: Check<string> = (value): value is string =>
  text(value) && value.length > 0;
export const finite: Check<number> = (value): value is number =>
  typeof value === "number" && Number.isFinite(value);
export const nonnegative: Check<number> = (value): value is number =>
  finite(value) && value >= 0;
export const integer: Check<number> = (value): value is number =>
  nonnegative(value) && Number.isSafeInteger(value);
export const boolean: Check<boolean> = (value) => typeof value === "boolean";
export const literal =
  <T extends string | number>(...values: T[]): Check<T> =>
  (value): value is T =>
    values.some((candidate) => candidate === value);
export const optional =
  <T>(check: Check<T>): Check<T | undefined> =>
  (value): value is T | undefined =>
    value === undefined || check(value);
export const array =
  <T>(check: Check<T>, max = Infinity): Check<T[]> =>
  (value): value is T[] =>
    Array.isArray(value) && value.length <= max && value.every(check);

// Every protocol property, including optional ones, needs a compatible check.
// Extra wire fields are retained for version-1 forward compatibility.
export function shape<T>(fields: { [K in keyof T]-?: Check<T[K]> }): Check<T> {
  const checks: Record<string, Check<unknown>> = fields;
  return (value): value is T =>
    record(value) &&
    Object.entries(checks).every(([key, check]) => check(value[key])) &&
    // Unknown metadata remains visible in Raw, so it must also be safe JSON.
    Object.entries(value).every(
      ([key, extra]) => Object.hasOwn(checks, key) || json(extra),
    );
}

export const strings = array(text);
export const ids = (value: unknown): value is string[] =>
  array(id, 200)(value) && new Set(value).size === value.length;
export const status = literal("pending", "success", "error", "cancelled");

// capture() traverses through depth 12 and emits scalar markers at depth 13.
// Image previews can exceed the ordinary 16,000-character string limit, so
// validation does not impose that limit on all strings or invent a byte budget.
export const json: Check<Json> = (value): value is Json => {
  const visit = (input: unknown, depth: number): boolean => {
    if (input === null || text(input) || boolean(input) || finite(input))
      return true;
    if (depth > 12) return false;
    if (Array.isArray(input))
      return (
        input.length <= 150 &&
        input.every((child: unknown) => visit(child, depth + 1))
      );
    return (
      record(input) &&
      Object.keys(input).length <= 256 &&
      Object.values(input).every((child) => visit(child, depth + 1))
    );
  };
  return visit(value, 0);
};

export function parse<T>(check: Check<T>, value: unknown, name: string): T {
  if (!check(value)) throw new Error(`Invalid ${name}`);
  return value;
}
