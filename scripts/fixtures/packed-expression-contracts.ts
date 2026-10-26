// Compiled against installed declarations, then executed through public exports.
import { defineJevFlow, type FlowExpression } from "jev-devtools/flow";

type Scalar = string | number | boolean | null;
type Label = string & { readonly __brand: "Label" };
type Count = number & { readonly __brand: "Count" };

export function equal<T extends Scalar>(
  value: FlowExpression<T>,
  other: T | FlowExpression<T>,
) {
  return value.eq(other);
}
export function select<
  T extends object,
  K extends keyof T & Parameters<FlowExpression<T>["get"]>[0],
>(value: FlowExpression<T>, key: K): FlowExpression<T[K]> {
  return value.get(key);
}
export function first<T>(
  value: FlowExpression<readonly T[]>,
): FlowExpression<T> {
  return value.get(0);
}
export function field<T>(
  value: FlowExpression<{ value: T }>,
): FlowExpression<T> {
  return value.get("value");
}

// Never called: these probes must fail at the public declaration boundary.
function rejected(
  object: FlowExpression<{ x: number }>,
  array: FlowExpression<number[]>,
  readonlyArray: FlowExpression<readonly number[]>,
  tuple: FlowExpression<readonly [1, 2]>,
  absent: FlowExpression<undefined>,
  optional: FlowExpression<number | undefined>,
  mixedObject: FlowExpression<number | { x: number }>,
  unknown: FlowExpression<unknown>,
  scalar: FlowExpression<number>,
  label: FlowExpression<"yes" | "no">,
  arrayUnion: FlowExpression<number[] | readonly string[]>,
  mixedArray: FlowExpression<number[] | { map: string }>,
) {
  // @ts-expect-error object equality is not a scalar operation
  object.eq({ x: 1 });
  // @ts-expect-error expression operands do not make objects scalar
  object.eq(object);
  // @ts-expect-error array equality is not supported
  array.eq([1]);
  // @ts-expect-error readonly arrays are not scalars
  readonlyArray.eq(readonlyArray);
  // @ts-expect-error undefined equality is not supported
  absent.eq(undefined);
  // @ts-expect-error every receiver member must be scalar
  optional.eq(1);
  // @ts-expect-error a scalar member does not make this a scalar receiver
  mixedObject.eq(1);
  // @ts-expect-error unknown is not known to be scalar
  unknown.eq(1);
  // @ts-expect-error equality operands retain the receiver's type
  scalar.eq("1");
  // @ts-expect-error undefined operands are unsupported
  scalar.eq(undefined);
  // @ts-expect-error objects cannot be equality operands
  scalar.eq({ x: 1 });
  // @ts-expect-error expression operands must match the scalar type
  scalar.eq(object);
  // @ts-expect-error choice labels remain exact
  label.eq("maybe");
  // @ts-expect-error array methods are inherited, not selectable data
  array.get("map");
  // @ts-expect-error readonly array methods are also inherited
  readonlyArray.get("map");
  // @ts-expect-error tuple methods are also inherited
  tuple.get("slice");
  // @ts-expect-error every union member must support this data key
  arrayUnion.get("map");
  // @ts-expect-error the object member cannot enable an array method
  mixedArray.get("map");
  // @ts-expect-error mutable array methods are unsupported
  array.get("push");
  // @ts-expect-error the constrained generic helper cannot restore array methods
  select(array, "map");
}
void rejected;

type Input = {
  count: Count;
  label: Label;
  literal: "yes";
  flag: boolean;
  empty: null;
  scalar: string | number;
  nullable: number | null;
  items: readonly number[];
  tuple: readonly ["first", 2];
  union: readonly number[] | readonly string[];
  record: { value: number; optional?: number; map: string; 0: string };
  objectUnion: { value: string } | { value: number };
};
export const controls = defineJevFlow<Input>("expression-controls", (f) => {
  const count = f.input.get("count");
  const label = f.input.get("label");
  const tuple = f.input.get("tuple");
  const firstTuple: FlowExpression<"first"> = tuple.get(0);
  const stringTuple: FlowExpression<2> = tuple.get("1");
  const tupleLength: FlowExpression<2> = tuple.get("length");
  const unionItem: FlowExpression<string | number> = f.input
    .get("union")
    .get(0);
  const unionField: FlowExpression<string | number> = f.input
    .get("objectUnion")
    .get("value");
  const optional: FlowExpression<number | undefined> = f.input
    .get("record")
    .get("optional");
  void optional;
  return f.output("done", {
    count: equal(count, count),
    label: equal(label, label),
    literal: f.input.get("literal").eq("yes"),
    flag: f.input.get("flag").eq(true),
    empty: f.input.get("empty").eq(null),
    scalar: equal(f.input.get("scalar"), f.input.get("scalar")),
    nullable: equal(f.input.get("nullable"), f.input.get("nullable")),
    first: first(f.input.get("items")),
    length: f.input.get("items").get("length"),
    firstTuple,
    stringTuple,
    tupleLength,
    unionItem,
    unionField,
    field: field(f.input.get("record")),
    selected: select(f.input.get("record"), "value"),
    ownMap: f.input.get("record").get("map"),
    numericField: f.input.get("record").get(0),
  });
});

export function brandedOperands(label: Label, count: Count) {
  return defineJevFlow<{ label: Label; count: Count }>(
    "branded-operands",
    (f) =>
      f.output("done", {
        label: equal(f.input.get("label"), label),
        count: equal(f.input.get("count"), count),
      }),
  );
}
