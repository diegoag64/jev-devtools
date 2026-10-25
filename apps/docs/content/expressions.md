## References are values for later

[`FlowExpression<T>`](@/api/reference/#flowexpression) represents a typed value that will be resolved during a run. Obtain one from [`flow.input`](@/api/reference/#flow-input), a task result, an answer field, or a joined operation. You usually do not construct the class directly.

Inside the synchronous `defineJevFlow()` callback:

```ts api=expressions
const message = flow.input.get("message");
const answer = classification.answer("team").choice;
const isBilling = answer.eq("billing");
```

**Example walkthrough:** `get("message")` selects the input message. `answer("team").choice` selects a previous Choice answer. `.eq("billing")` describes a Boolean comparison that will be evaluated when the flow runs.

This fragment assumes a flow input with `message` and an earlier request named `classification` with a Choice question `team`. See the [complete flow example](@/guides/flows/) for the surrounding definition and `await triage.run(...)` call. The runner resolves the answer and evaluates the comparison during that awaited execution.

## Select and compare

| Method                                           | Meaning                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| [`.get(key)`](@/api/reference/#expression-get)   | Select an own field of an object or array, including nested fields. |
| [`.eq(value)`](@/api/reference/#expression-eq)   | Compare matching scalar types for equality.                         |
| [`.lt(value)`](@/api/reference/#expression-lt)   | Strictly less than; finite numeric values only.                     |
| [`.gt(value)`](@/api/reference/#expression-gt)   | Strictly greater than; finite numeric values only.                  |
| [`.gte(value)`](@/api/reference/#expression-gte) | Greater than or equal; finite numeric values only.                  |

Each comparison accepts a literal or compatible expression. Optional or nullable numeric fields must be resolved to valid numbers before comparison. Missing fields are execution errors. There is no `.lte()` method; express an inclusive upper bound with [`not(value.gt(limit))`](@/api/reference/#not) when the value is a valid number.

`.get()` does not read properties of primitive values: string `.get("length")` and `.get(0)` are unsupported. Array indexes and array `length` are supported. Use a task callback for string operations, as shown in the [complete field-selection example](@/api/reference/#expression-get). **0.5.1:** TypeScript now rejects primitive receivers, including unions that may contain primitives; version 0.5.0 accepts some of these calls but fails during execution.

### Return interfaces

| Method                  | Return type               | Resolved value                |
| ----------------------- | ------------------------- | ----------------------------- |
| `get(key)`              | `FlowExpression<T[K]>`    | Value of the selected field.  |
| `eq`, `lt`, `gt`, `gte` | `FlowExpression<boolean>` | The result of the comparison. |

## Combine conditions

Import [`all`](@/api/reference/#all), [`any`](@/api/reference/#any), and [`not`](@/api/reference/#not) from `jev-devtools/flow`:

Inside the synchronous `defineJevFlow()` callback:

```ts api=expressions
const shouldReview = all(
  eligibility.answer("eligible").noul.gte(0.9),
  not(risk.answer("risky").noul.gt(0.2)),
);
```

**Example walkthrough:** `.gte(0.9)` checks the eligibility threshold. `.gt(0.2)` checks the risk threshold, and `not()` inverts that second condition. `all()` requires both conditions to hold. These thresholds are explicitly authored application policy.

This fragment assumes earlier requests named `eligibility` and `risk`. The thresholds are example application policy, not TypeSafe defaults. [`all`](@/api/reference/#all) requires every condition, [`any`](@/api/reference/#any) requires at least one, and [`not`](@/api/reference/#not) inverts one Boolean expression.

To execute conditions like these, pass the reference to a step or `output()` and await the flow’s `run()`. The [complete operations example](@/api/flow/#collections-and-loops) shows `all()` and `not()` inside a definition, followed by `await summarize.run(...)` and the resolved result.

All operands are evaluated. A missing reference remains an error even when another operand would normally short-circuit JavaScript evaluation. There is no arbitrary predicate callback or `eval` in the expression API.

### Return interfaces

| Helper               | Return type               | Resolved value                            |
| -------------------- | ------------------------- | ----------------------------------------- |
| `all(...conditions)` | `FlowExpression<boolean>` | True when every condition is true.        |
| `any(...conditions)` | `FlowExpression<boolean>` | True when at least one condition is true. |
| `not(condition)`     | `FlowExpression<boolean>` | The inverse of the condition.             |

## Respect scope

A reference belongs to its definition and available execution scope. Do not use a reference from another flow, an untaken branch, or a sibling parallel lane. Return a value from [`if`](@/api/reference/#flow-if) or [`parallel`](@/api/reference/#flow-parallel) to make it available after the join. Pass explicit context into map and loop programs.

## Expression limits

**0.5.2:** construction enforces depth 80 and 4,096 expanded nodes per expression, including ordinary composition and reused children. A leaf has depth 0 and counts as one node; each field selection, literal, reference, and operation also counts. Reusing a child counts its complete size at every occurrence. The existing per-operation limit is 256 operands.

For example, 80 `not()` calls around Boolean `flow.input` fit; the 81st throws. Starting from that input, eleven `e = all(e, e)` doublings contain 4,095 expanded nodes; a twelfth throws. Split larger generated logic into tasks or smaller steps. Within these limits, all operands still evaluate, and references keep their scope and missing-value checks.

Legacy condition text is limited to 4,096 UTF-16 code units, including `[condition truncated]` when shortened. Structured rules keep their existing 128-node projection budget. Neither display limit changes the accepted expression's runtime result. See [flow limits](@/api/flow/#limits-and-errors) for the separate step and run budgets.
