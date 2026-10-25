A flow is a recipe your server follows: take some input, run steps, and return a named result. You can use ordinary application code, ask Jev questions, or combine both. You do not need to understand graphs to write one.

This guide starts with a flow that makes **no network requests**. Each example is a complete definition with its own import. Keep these files on your Node server. If you have not connected the drawer yet, start with the [quick start](@/getting-started/).

## Your first flow

<!-- example: first-flow.ts -->

There are two moments to understand:

1. [`defineJevFlow`](@/api/reference/#definejevflow) describes the recipe once. The `{ name: string }` type says what data a caller must provide.
2. [`greet.run`](@/api/reference/#flow-run) executes that recipe with `{ name: "Ada" }`. It returns a promise; use `await` to read the result.

The result's `outcome` is the name you chose (`"greeted"`). Its `value` is the data you returned (`"Ada"`). `runId` identifies this particular execution. Running the same definition again creates a new run.

Every run requires a `client`. The tiny `noInference` client above makes it explicit that this recipe never calls Jev. For recipes that do call Jev, pass the real client from the [server setup](@/api/server/). Add `devtools: inspector` to the run options to see the flow in your drawer.

## input — read the data you were given

[`flow.input`](@/api/reference/#flow-input) represents the input passed to [`run`](@/api/reference/#flow-run). Use `flow.input.get("name")` to select one field.

During definition, this is a **reference to a future value**, not the actual string. You cannot call `.toUpperCase()` on it. Pass it to a task, whose callback receives the real value when the flow runs. You also do not `await` a builder method: it creates a reference, not a promise.

Inside a map or loop, `input` refers to that item or iteration. Those shapes are explained below.

## task — run your own code

Use [`task`](@/api/reference/#flow-task) for calculations, database reads, or calls to another service. Here is an ordinary string operation:

<!-- example: flow-task.ts -->

| Part | What you provide |
| --- | --- |
| `id` | `"make-message"`, a unique name for this step. |
| `input` | A value, reference, or object/array containing references. |
| [`run`](@/api/reference/#flow-run) | A function that receives the resolved input and returns the result. It can be `async`. |
| `timeoutMs` | Optional maximum wait in milliseconds. |

**What comes back:** a reference to the callback's result. With `{ name: "Ada" }`, this flow returns outcome `"greeted"` and value `"Hello, Ada!"`.

A task callback can also accept a second argument containing `signal`, `runId`, `stepId`, and `executionId`. Pass its signal to cancellable work such as `fetch`. A timeout or cancellation cannot undo a payment, database write, or other side effect. Tasks do not retry automatically.

## jev — ask a question

Use [`jev`](@/api/reference/#flow-jev) when you need a model answer rather than a calculation:

<!-- example: flow-jev.ts -->

| Part | What you provide |
| --- | --- |
| `id` | `"ask-team"`, the step name shown in the flow. |
| `state` | The context Jev should use. References are resolved before the request. |
| `questions` | An object of named SDK questions. Here the name is `team`. |

**What comes back:** references to the answers, not an immediate response. [`result.answer("team").choice`](@/api/reference/#request-answer) selects the chosen team. [`result.answers`](@/api/reference/#request-answers) refers to the entire answer object. A live run of this example needs an SDK client and server-side API key; its chosen team is not predetermined.

`choice` comes from the TypeSafe SDK. [`flow.jev`](@/api/reference/#flow-jev) connects that SDK request to the flow. If you need to construct a question using a resolved string, use the factory form:

<!-- example: flow-factory.ts -->

The factory receives resolved `input` and returns a normal SDK request. It must be synchronous. Fetch data in a preceding task when preparing a request requires asynchronous work.

## output — finish with a result

Every top-level recipe ends with `return flow.output(name, value)` or a terminal branch. `name` is the outcome your application will read; `value` is optional. It may contain references inside an object or array.

For example, the task recipe above ends with `return flow.output("greeted", message)`. At runtime, `message` becomes the actual greeting string. Output does not send a message or perform a business action; your application decides what to do with the result.

## if — choose a value, then continue

Use [`if`](@/api/reference/#flow-if) when two paths should rejoin before the flow finishes:

<!-- example: flow-if.ts -->

| Part | What you provide |
| --- | --- |
| `when` | A Boolean expression. [`.eq(true)`](@/api/reference/#expression-eq) compares the future input with `true`. |
| `then` | A callback returning a value reference for the true path. |
| `else` | A callback returning a value reference for the false path. |

**What comes back:** the selected value reference. With `{ express: true }`, `days` resolves to `1`; the shared `describe` task returns `"Delivery in 1 day(s)"`. With `false`, it uses `5`.

Both callbacks describe their paths when the definition is built. Only the selected path's **steps** run. Put application work inside tasks, not directly inside the path-building callbacks. Do not use JavaScript `if (flow.input...)`: a reference is an object, not a resolved Boolean.

## branch — choose how to finish

Use [`branch`](@/api/reference/#flow-branch) when each path should end the flow with its own outcome:

<!-- example: flow-branch.ts -->

The options are `when`, `then`, and `else`, like [`if`](@/api/reference/#flow-if). The difference is what each path returns: a branch path must return [`output`](@/api/reference/#flow-output) or another terminal [`branch`](@/api/reference/#flow-branch).

**What comes back:** the selected terminal result. `{ needsReview: true }` produces outcome `"manual-review"`; `false` produces `"ready"`. There is no shared step after this branch. Use [`if`](@/api/reference/#flow-if) when you want shared work afterward.

## parallel — do independent work together

Use [`parallel`](@/api/reference/#flow-parallel) when one piece of work does not need another's result:

<!-- example: flow-parallel.ts -->

Pass a step ID and an object of named lane callbacks. Each callback receives its own builder and returns a reference. Work within one lane stays sequential; different lanes may run concurrently. This tiny arithmetic example illustrates the result shape; concurrent service calls are a more practical use.

**What comes back:** an object of references with your lane names. With `{ price: 100 }`, the output value is `{ regular: 100, sale: 80 }`. The flow waits for the lanes before using their results. A lane cannot read another lane's private intermediate steps.

## map — repeat a recipe for each item

Use [`map`](@/api/reference/#flow-map) for a list with a known size limit:

<!-- example: flow-map.ts -->

| Part | What you provide |
| --- | --- |
| `items` | An array, or a reference to an array. |
| `input` | Explicit shared context for every item; use `{}` if nothing is needed. |
| `maxItems` | Required safety limit, an integer from 1 to 64. A larger input rejects; it is not silently truncated. |
| `concurrency` | How many items may run at once: 1–16, default 4. |
| `build` | The callback after the options. Return a reference for one item's result. |

The item's `input` contains `item` (the current value), `index` (starting at zero), and `context` (the shared `input` you supplied). Use these inside the item recipe instead of reaching into outer steps.

**What comes back:** a reference to an array of results, in **input order**, even if items finish in a different order. `{ numbers: [2, 4, 6] }` produces `[4, 8, 12]`. An empty array produces `[]`.

## loop — repeat until a condition is false

Use [`loop`](@/api/reference/#flow-loop) when the next iteration needs the previous one's result:

<!-- example: flow-loop.ts -->

| Part | What you provide |
| --- | --- |
| `initial` | Starting state: here, zero. It can also be a reference. |
| `input` | Explicit shared context for the iterations. |
| `while` | A callback describing a Boolean condition using the state reference. |
| `maxIterations` | Required integer from 1 to 64. |
| `build` | A callback returning the next state reference, with the same state type. |

An iteration's `input` contains `state`, zero-based `index`, and shared `context`. The condition runs **before** each iteration. Here the state goes `0 → 1 → 2 → 3`, then the condition is false. The output value is `3`. If the initial condition is false, the result is the initial state and no iterations run.

If the condition is still true at the limit, the run rejects with [`FlowLoopLimitError`](@/api/reference/#flowlooplimiterror). It does not return a successful partial result. A loop may contain a map; nested loops, nested maps, and loops inside maps are unsupported.

## Give steps useful names

Step IDs and output names must be unique throughout the definition, even across paths that cannot both execute. Use 1–80 letters, digits, `_`, or `-`, starting with a letter or digit.

Every builder method also accepts optional final `display` metadata: `{ title?, description? }`. For example, [`flow.output("done", result, { title: "Ready to review" })`](@/api/reference/#flow-output). This changes the inspector label, not the behavior or model instructions. Keep display text safe to show to viewers.

## Where to go next

- [Build a connected flow](@/guides/flows/) combines an SDK question and a terminal branch with your inspector.
- [API glossary](@/api/reference/) lists every public method, its inputs, returns, and related contracts.
- [Flow builder reference](@/api/flow/) covers boundaries, replay, and fixture comparison.
- [Expressions and conditions](@/api/expressions/) explains comparisons and combining conditions.
