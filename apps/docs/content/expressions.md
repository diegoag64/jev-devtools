Use expressions to pass future values between steps and to describe conditions the inspector can display. Import expression helpers from `jev-devtools/flow` on Node. The [API glossary](@/api/reference/#expressions-and-conditions) lists exact parameters and return types.

## References are values for later

[`FlowExpression<T>`](@/api/reference/#flowexpression) describes how to obtain a value during execution. It is a reference during definition and resolves to a value of type `T` when the flow runs.

Get references from [`flow.input`](@/api/reference/#flow-input), task results, answer fields, or joined operations. The builder manages their ownership. Ordinary application code should not construct `FlowExpression` directly.

This fragment belongs inside a synchronous `defineJevFlow()` callback. It assumes an input field `message` and an earlier Jev step named `classification` with a Choice question named `team`:

```ts api=expressions
const message = flow.input.get("message");
const answer = classification.answer("team").choice;
const isBilling = answer.eq("billing");
```

`message` references the input field. `answer` references the chosen team label, and `isBilling` references the result of comparing that label with `"billing"`. None contains its runtime value yet.

See [Build a flow](@/guides/flows/) for the surrounding definition and awaited run. The runner resolves the answer before evaluating the condition.

## Select and compare

| Method                                           | Meaning                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| [`.get(key)`](@/api/reference/#expression-get)   | Select an own field of an object or array, including nested fields. |
| [`.eq(value)`](@/api/reference/#expression-eq)   | Compare matching scalar types for equality.                         |
| [`.lt(value)`](@/api/reference/#expression-lt)   | Strictly less than; finite numeric values only.                     |
| [`.gt(value)`](@/api/reference/#expression-gt)   | Strictly greater than; finite numeric values only.                  |
| [`.gte(value)`](@/api/reference/#expression-gte) | Greater than or equal; finite numeric values only.                  |

Each comparison takes a literal or compatible expression and returns `FlowExpression<boolean>`. Equality compares matching scalar types, not deep object contents. Numeric comparisons require finite numbers. Resolve optional or nullable fields to valid numbers before comparing them.

Missing fields fail during execution. There is no `.lte()` method. For a valid numeric inclusive upper bound, use [`not(value.gt(limit))`](@/api/reference/#not).

`.get()` reads own properties of objects and arrays. It supports array indexes and array `length`, but not string `length` or character indexes. Perform string operations in a task callback, as shown in the [field-selection example](@/api/reference/#expression-get).

Since **0.5.1**, TypeScript rejects primitive receivers and unions that may contain primitives. Version 0.5.0 accepts some of these calls during type checking but rejects primitive property access during execution.

### Return interfaces

| Method                  | Return type               | Resolved value                |
| ----------------------- | ------------------------- | ----------------------------- |
| `get(key)`              | `FlowExpression<T[K]>`    | Value of the selected field.  |
| `eq`, `lt`, `gt`, `gte` | `FlowExpression<boolean>` | The result of the comparison. |

## Combine conditions

Import [`all()`](@/api/reference/#all), [`any()`](@/api/reference/#any), and [`not()`](@/api/reference/#not) from `jev-devtools/flow`. Each accepts Boolean expressions and returns one Boolean expression.

This fragment belongs inside the definition callback after Jev steps named `eligibility` and `risk`. They contain Noul questions named `eligible` and `risky`:

```ts api=expressions
const shouldReview = all(
  eligibility.answer("eligible").noul.gte(0.9),
  not(risk.answer("risky").noul.gt(0.2)),
);
```

`shouldReview` is true when `eligible` is at least `0.9` and `risky` is at most `0.2`. `not()` supplies the inclusive upper bound by inverting `gt(0.2)`. These thresholds are example application policy. Noul values represent probabilities of true, not confidence scores.

To execute conditions like these, pass the reference to a step or `output()` and await the flow’s `run()`. The [complete operations example](@/api/flow/#collections-and-loops) shows `all()` and `not()` inside a definition, followed by `await summarize.run(...)` and the resolved result.

All operands are evaluated. An earlier false condition in `all()` or true condition in `any()` does not suppress a missing-reference error later in the list. These helpers do not short-circuit like JavaScript `&&` and `||`.

Supply at least one owned condition to `all()` and `any()`. A zero-operand expression has no flow owner and cannot be used in a definition. The expression API does not accept arbitrary predicate callbacks or `eval`.

### Return interfaces

| Helper               | Return type               | Resolved value                            |
| -------------------- | ------------------------- | ----------------------------------------- |
| `all(...conditions)` | `FlowExpression<boolean>` | True when every condition is true.        |
| `any(...conditions)` | `FlowExpression<boolean>` | True when at least one condition is true. |
| `not(condition)`     | `FlowExpression<boolean>` | The inverse of the condition.             |

## Respect scope

A reference belongs to a definition and must be available where it is used. References from another flow, an untaken branch, or a sibling parallel lane are unavailable.

Return a value through [`if()`](@/api/reference/#flow-if) or [`parallel()`](@/api/reference/#flow-parallel) to use it after the paths join. Pass outer data through the `input` context of a map or loop, then read `context` inside its program.

## Expression limits

Since **0.5.2**, construction checks the complete expression, including composition and reused children.

| Limit                  | Maximum | How it is counted                                                                                                  |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| Depth                  | 80      | A leaf has depth 0. Each containing operation or field selection adds depth.                                       |
| Expanded nodes         | 4,096   | Every literal, reference, field selection, and operation counts. Reused children count in full at each occurrence. |
| Operands per operation | 256     | Applies to each operation, including `all()` and `any()`.                                                          |

For example, 80 `not()` calls around Boolean `flow.input` fit; the 81st throws. Starting from that input, eleven `e = all(e, e)` doublings contain 4,095 expanded nodes; a twelfth throws. Split larger generated logic into tasks or smaller steps. Within these limits, all operands still evaluate, and references keep their scope and missing-value checks.

Capture has separate limits. Legacy condition text is capped at 4,096 UTF-16 code units, including the `[condition truncated]` suffix. Structured rules have a 128-node projection budget. These limits shorten inspection data without changing an accepted expression's runtime result.

See [flow limits](@/api/flow/#limits-and-errors) for the separate definition and run budgets.
