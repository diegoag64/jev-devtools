## References are values for later

`FlowExpression<T>` represents a typed value that will be resolved during a run. Obtain one from `flow.input`, a task result, an answer field, or a joined operation. You usually do not construct the class directly.

```ts
const message = flow.input.get("message");
const answer = classification.answer("team").choice;
const isBilling = answer.eq("billing");
```

This fragment assumes a flow input with `message` and an earlier request named `classification` with a Choice question `team`. See the [complete flow example](@/guides/flows/).

## Select and compare

| Method        | Meaning                                            |
| ------------- | -------------------------------------------------- |
| `.get(key)`   | Select an existing field, including nested fields. |
| `.eq(value)`  | Compare matching scalar types for equality.        |
| `.lt(value)`  | Strictly less than; finite numeric values only.    |
| `.gt(value)`  | Strictly greater than; finite numeric values only. |
| `.gte(value)` | Greater than or equal; finite numeric values only. |

Each comparison accepts a literal or compatible expression. Optional or nullable numeric fields must be resolved to valid numbers before comparison. Missing fields are execution errors. There is no `.lte()` method; express an inclusive upper bound with `not(value.gt(limit))` when the value is a valid number.

## Combine conditions

Import `all`, `any`, and `not` from `jev-devtools/flow`:

```ts
const shouldReview = all(
  eligibility.answer("eligible").noul.gte(0.9),
  not(risk.answer("risky").noul.gt(0.2)),
);
```

This fragment assumes earlier requests named `eligibility` and `risk`. The thresholds are example application policy, not TypeSafe defaults. `all` requires every condition, `any` requires at least one, and `not` inverts one Boolean expression.

All operands are evaluated. A missing reference remains an error even when another operand would normally short-circuit JavaScript evaluation. There is no arbitrary predicate callback or `eval` in the expression API.

## Respect scope

A reference belongs to its definition and available execution scope. Do not use a reference from another flow, an untaken branch, or a sibling parallel lane. Return a value from `if` or `parallel` to make it available after the join. Pass explicit context into map and loop programs.
