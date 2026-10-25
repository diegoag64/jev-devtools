// Type-checked by verify-package.mjs against the installed archive, not source.
import { choice, noul } from "@typesafe-ai/sdk";
import { defineJevFlow, FlowExpression } from "jev-devtools/flow";

declare const mixed: FlowExpression<number | string>;
declare const exact: FlowExpression<number>;
// @ts-expect-error union to member
export const narrowed: FlowExpression<number> = mixed;
export const widened: FlowExpression<number | string> = exact;

// get() selects fields on object/array values, never primitive properties.
declare const text: FlowExpression<string>;
declare const flag: FlowExpression<boolean>;
declare const objectOrText: FlowExpression<{ length: number } | string>;
// @ts-expect-error primitive strings do not support property selection
text.get("length");
// @ts-expect-error primitive strings do not support index selection
text.get(0);
// @ts-expect-error primitive numbers do not support property selection
exact.get("toString");
// @ts-expect-error primitive booleans do not support property selection
flag.get("valueOf");
// @ts-expect-error every possible receiver must be an object/array
objectOrText.get("length");

declare const data: FlowExpression<{
  nested: { label: string; count?: number };
  values: number[];
  pair: readonly ["first", 2];
}>;
export const nestedLabel: FlowExpression<string> = data
  .get("nested")
  .get("label");
export const optionalCount: FlowExpression<number | undefined> = data
  .get("nested")
  .get("count");
export const arrayItem: FlowExpression<number> = data.get("values").get(0);
export const arrayLength: FlowExpression<number> = data.get("values").get("length");
export const tupleItem: FlowExpression<"first"> = data.get("pair").get(0);
export const tupleLength: FlowExpression<2> = data.get("pair").get("length");
// @ts-expect-error selecting an optional field must preserve undefined
export const requiredCount: FlowExpression<number> = optionalCount;
// @ts-expect-error selecting a field must preserve its value type
export const numericLabel: FlowExpression<number> = nestedLabel;
// @ts-expect-error object keys still come from the input shape
data.get("missing");

declare const objectUnion: FlowExpression<{ value: string } | { value: number }>;
export const unionField: FlowExpression<string | number> =
  objectUnion.get("value");
export function selectField<
  T extends object,
  K extends keyof T & (string | number),
>(
  value: FlowExpression<T>,
  key: K,
): FlowExpression<T[K]> {
  return value.get(key);
}

export class Peek extends FlowExpression<number> {
  peek() {
    // @ts-expect-error subclass reads the marker
    return this.valueType;
  }
}
class Narrow extends FlowExpression<number | string> {
  declare protected readonly valueType: number;
}
declare const redeclared: Narrow;
// @ts-expect-error subclass redeclaration to member
export const narrowedSubclass: FlowExpression<number> = redeclared;

const questions = {
  category: choice("Category?", { refund: null, other: null }),
  urgent: noul("Urgent?"),
};

defineJevFlow<{ optional?: number; nullable: number | null; values: number[] }>(
  "packed-types",
  (f) => {
    // @ts-expect-error optional comparison
    f.input.get("optional").gte(1);
    // @ts-expect-error nullable comparison
    f.input.get("nullable").gte(1);

    const triage = f.jev("triage", { state: f.input, questions });
    const label: FlowExpression<"refund" | "other"> =
      triage.answer("category").choice;
    label.eq("refund");
    // @ts-expect-error unknown choice label
    label.eq("missing");
    const urgent: FlowExpression<number> = triage.answer("urgent").noul;
    urgent.gte(0.5);

    const count = f.task("count", { input: urgent, run: (value) => value * 2 });
    const doubled: FlowExpression<number> = count;
    // @ts-expect-error task output type
    const countText: FlowExpression<string> = count;

    const selected = f.if("pick", {
      when: urgent.gt(0.5),
      then: (p) => p.task("text", { input: null, run: () => "text" }),
      else: (p) => p.task("number", { input: null, run: () => 42 }),
    });
    const either: FlowExpression<string | number> = selected;
    // @ts-expect-error if() result to one arm
    const wrong: FlowExpression<number> = selected;

    const mapped = f.map(
      "batch",
      { items: f.input.get("values"), input: null, maxItems: 3 },
      (item) =>
        item.task("label", {
          input: item.input,
          run: ({ item, index }) => `${index}:${item.toFixed(2)}`,
        }),
    );
    const labels: FlowExpression<string[]> = mapped;
    // @ts-expect-error map item type
    const numbers: FlowExpression<number[]> = mapped;

    void [doubled, countText, either, wrong, labels, numbers];
    return f.output("done", selected);
  },
);
