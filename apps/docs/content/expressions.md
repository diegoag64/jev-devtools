## References are values for later

[`FlowExpression<T>`](@/api/reference/#flowexpression) represents a typed value that will be resolved during a run. Obtain one from [`flow.input`](@/api/reference/#flow-input), a task result, an answer field, or a joined operation. You usually do not construct the class directly.

```ts api=expressions
const message = flow.input.get("message");
const answer = classification.answer("team").choice;
const isBilling = answer.eq("billing");
```

**Example walkthrough:** `get("message")` selects the input message. `answer("team").choice` selects a previous Choice answer. `.eq("billing")` describes a Boolean comparison that will be evaluated when the flow runs.

This fragment assumes a flow input with `message` and an earlier request named `classification` with a Choice question `team`. See the [complete flow example](@/guides/flows/).

## Select and compare

| Method        | Meaning                                            |
| ------------- | -------------------------------------------------- |
| [`.get(key)`](@/api/reference/#expression-get)   | Select an existing field, including nested fields. |
| [`.eq(value)`](@/api/reference/#expression-eq)  | Compare matching scalar types for equality.        |
| [`.lt(value)`](@/api/reference/#expression-lt)  | Strictly less than; finite numeric values only.    |
| [`.gt(value)`](@/api/reference/#expression-gt)  | Strictly greater than; finite numeric values only. |
| [`.gte(value)`](@/api/reference/#expression-gte) | Greater than or equal; finite numeric values only. |

Each comparison accepts a literal or compatible expression. Optional or nullable numeric fields must be resolved to valid numbers before comparison. Missing fields are execution errors. There is no `.lte()` method; express an inclusive upper bound with [`not(value.gt(limit))`](@/api/reference/#not) when the value is a valid number.

### Return interfaces

| Method | Return type | Resolved value |
| --- | --- | --- |
| `get(key)` | `FlowExpression<T[K]>` | Value of the selected field. |
| `eq`, `lt`, `gt`, `gte` | `FlowExpression<boolean>` | The result of the comparison. |

## Combine conditions

Import [`all`](@/api/reference/#all), [`any`](@/api/reference/#any), and [`not`](@/api/reference/#not) from `jev-devtools/flow`:

```ts api=expressions
const shouldReview = all(
  eligibility.answer("eligible").noul.gte(0.9),
  not(risk.answer("risky").noul.gt(0.2)),
);
```

**Example walkthrough:** `.gte(0.9)` checks the eligibility threshold. `.gt(0.2)` checks the risk threshold, and `not()` inverts that second condition. `all()` requires both conditions to hold. These thresholds are explicitly authored application policy.

This fragment assumes earlier requests named `eligibility` and `risk`. The thresholds are example application policy, not TypeSafe defaults. [`all`](@/api/reference/#all) requires every condition, [`any`](@/api/reference/#any) requires at least one, and [`not`](@/api/reference/#not) inverts one Boolean expression.

All operands are evaluated. A missing reference remains an error even when another operand would normally short-circuit JavaScript evaluation. There is no arbitrary predicate callback or `eval` in the expression API.

### Return interfaces

| Helper | Return type | Resolved value |
| --- | --- | --- |
| `all(...conditions)` | `FlowExpression<boolean>` | True when every condition is true. |
| `any(...conditions)` | `FlowExpression<boolean>` | True when at least one condition is true. |
| `not(condition)` | `FlowExpression<boolean>` | The inverse of the condition. |

## Respect scope

A reference belongs to its definition and available execution scope. Do not use a reference from another flow, an untaken branch, or a sibling parallel lane. Return a value from [`if`](@/api/reference/#flow-if) or [`parallel`](@/api/reference/#flow-parallel) to make it available after the join. Pass explicit context into map and loop programs.
