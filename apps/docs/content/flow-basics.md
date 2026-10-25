A flow is a recipe your server follows: take some input, run steps, and return a named result. You can use ordinary application code, ask Jev questions, or combine both. You do not need to understand graphs to write one.

This guide starts with a flow that makes **no network requests**. Each example includes its imports, a flow definition, and an async function that runs it and reads the result. Call that function from your Node code; importing the example does not execute the flow. Keep these files on your Node server. If you have not connected the drawer yet, start with the [quick start](@/getting-started/).

The interface tables use the types from each example. The [API glossary](@/api/reference/) contains the generic signatures for other input and result types. A builder return is a reference created while defining the recipe; a resolved value is the actual data produced during execution.

## Your first flow

**Define first, run later.** The callback passed to [`defineJevFlow()`](@/api/reference/#definejevflow) runs synchronously to describe the steps. It does not execute tasks or send model requests. [`await flowName.run(input, options)`](@/api/reference/#flow-run) starts an execution, waits for its steps, and gives your application ordinary result data. Keep the builder callback synchronous; put `await` in the function that runs the flow.

<!-- example: first-flow.ts -->

**Example walkthrough**

There are two moments to understand:

1. [`defineJevFlow`](@/api/reference/#definejevflow) describes the recipe once. The `{ name: string }` type says what data a caller must provide.
2. [`greet.run`](@/api/reference/#flow-run) executes that recipe with `{ name: "Ada" }`. It returns a promise; use `await` to read the result.

### Input interface

| Parameter | Type | Description |
| --- | --- | --- |
| `name` | `string` | The name of the flow definition: `"greet"`. |
| `build` | `(flow: FlowBuilder<{ name: string }>) => FlowExpression<FlowOutcome>` | Describes the steps and returns a terminal output or branch. |
| `run(input, options)` → `input` | `{ name: string }` in this example | Data supplied each time the flow executes. |
| `run(input, options)` → `options` | `FlowRunOptions` | Required `client`, optional `devtools` and `signal`. |

### Return interface

`defineJevFlow()` returns an object with these members:

| Member | Type | Description |
| --- | --- | --- |
| `definition` | `FlowDefinition` | The static graph; reading it does not execute work. |
| `run` | `(input: { name: string }, options: FlowRunOptions) => Promise<FlowOutcome & { runId: string }>` | Executes the flow with new input. |

Awaiting `greet.run(...)` returns:

| Property | Type | Value in this example |
| --- | --- | --- |
| `runId` | `string` | A unique ID for this execution. |
| `outcome` | `string` | `"greeted"`, from `flow.output()`. |
| `value?` | `unknown` | `"Ada"`, resolved from the input reference. |

The table gives this example's values; the public `value` type remains `unknown`. Narrow it before using it in application code. Running the definition again creates a new run.

Every run requires a `client`. The tiny `noInference` client above makes it explicit that this recipe never calls Jev. For recipes that do call Jev, pass the real client from the [server setup](@/api/server/). Add `devtools: inspector` to the run options to see the flow in your drawer.

## input — read the data you were given

[`flow.input`](@/api/reference/#flow-input) represents the input passed to [`run`](@/api/reference/#flow-run). Use `flow.input.get("name")` to select one field.

During definition, this is a **reference to a future value**, not the actual string. You cannot call `.toUpperCase()` on it. Pass it to a task, whose callback receives the real value when the flow runs. You also do not `await` a builder method: it creates a reference, not a promise.

### Property interface

| Property | Type | Description |
| --- | --- | --- |
| `flow.input` | `FlowExpression<{ name: string }>` | Reference to the current builder's input. It takes no arguments. |
| `flow.input.get("name")` | `FlowExpression<string>` in the first example | Reference to one input field. |

**Example walkthrough:** `flow.input.get("name")` in `greet` selects the field provided to `greet.run({ name: "Ada" }, ...)`. Passing that reference to `output()` makes the final value `"Ada"`. Inside a map or loop, `input` instead refers to that item or iteration; their shapes are shown below.

## task — run your own code

Use [`task`](@/api/reference/#flow-task) for calculations, database reads, or calls to another service. Here is an ordinary string operation:

<!-- example: flow-task.ts -->

### Input interface

| Parameter / option | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique step ID: `"make-message"`. |
| `input` | `FlowExpression<string>` | A value or nested references; here, `FlowExpression<string>`. |
| `run` | `(name: string, context: TaskContext) => string` | Application callback receiving actual values. This is the task callback, not the flow's `run()` method. |
| `timeoutMs?` | `number` | Optional timeout in milliseconds. |
| `display?` | `FlowDisplay` | Optional final argument for inspector labels. |

### Return interface

| Value | Type | Description |
| --- | --- | --- |
| Builder return (`message`) | `FlowExpression<string>` | Reference to the callback result. |
| Resolved task value | `string` | `"Hello, Ada!"` when `name` is `"Ada"`. |
| Final run result | `{ runId: string; outcome: string; value?: unknown }` | Outcome `"greeted"`, value `"Hello, Ada!"`. |

**Example walkthrough:** `get("name")` selects the input field. The task resolves it before calling `run`, so `name` inside the callback is an ordinary string. The template literal constructs the greeting. `output("greeted", message)` resolves that task result and makes it the final flow value. Calling `tryTask()` awaits `greeting.run({ name: "Ada" }, ...)`, then reads outcome `"greeted"` and value `"Hello, Ada!"` from the finished run.

A task callback can also accept a second argument containing `signal`, `runId`, `stepId`, and `executionId`. Pass its signal to cancellable work such as `fetch`. A timeout or cancellation cannot undo a payment, database write, or other side effect. Tasks do not retry automatically.

## jev — ask a question

Use [`jev`](@/api/reference/#flow-jev) when you need a model answer rather than a calculation.

**`flow.jev()` defines the request; `classify.run()` executes it.** The builder adds a request to the definition and returns references to future answers. It does not return a promise or send the request. Below, `await classify.run(...)` starts the flow; the runner sends the SDK request and waits for the answer before resolving the output.

Call `tryClassify(jev)` with the client from the [server setup](@/api/server/). This makes a live request and requires a server-side API key. The chosen team depends on the model response:

<!-- example: flow-jev.ts -->

### Input interface

| Parameter / option | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique request step ID: `"ask-team"`. |
| `state` | Values or nested references | Context sent to Jev after resolving references. |
| `questions` | SDK `Questions` object | Named questions; `team` is a Choice question here. |
| `display?` | `FlowDisplay` | Optional inspector labels. |

### Return interface

| Member / value | Type | Description |
| --- | --- | --- |
| `result.answer(name)` | Object of typed field references | Selects a named question's answer fields. |
| `result.answer("team").choice` | `FlowExpression<"billing" \| "support">` | The selected team, such as `"billing"` or `"support"` in this example. |
| `result.answer("team").confidence` | `FlowExpression<number>` | SDK-reported confidence. |
| `result.answer("team").probabilities` | `FlowExpression<{ billing: number; support: number }>` | Probability for each allowed label. |
| `result.answers` | `FlowExpression` of the full answer object | All named SDK answers, including their metadata. |
| Final run result | `{ runId: string; outcome: string; value?: unknown }` | Outcome `"classified"`; value is the selected team. |

**Example walkthrough:** `state: flow.input` sends the message as context. The SDK's `choice()` helper defines the allowed teams and their descriptions. `answer("team").choice` selects the model's chosen label, and `output()` returns it. `tryClassify()` supplies a concrete message to `await classify.run(...)`. After the request finishes, `result.outcome` is `"classified"` and `result.value` contains the chosen team. The selected team is not predetermined.

`choice` comes from the TypeSafe SDK. [`flow.jev`](@/api/reference/#flow-jev) connects that SDK request to the flow. If you need to construct a question using a resolved string, use the factory form:

Call `tryCustomQuestion(jev)` with the same server client. The request factory runs during execution after its input resolves, but the factory itself must return synchronously.

<!-- example: flow-factory.ts -->

### Factory input interface

| Parameter / option | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique request step ID: `"ask"`. |
| `input` | `FlowExpression<string>` | Values/references to resolve before constructing the request. |
| `request` | `(message: string) => SystemOneRequest<Questions>` | Synchronously constructs a normal SDK request. |
| `display?` | `FlowDisplay` | Optional inspector labels. |

The factory form returns the same `answer(name)` and `answers` interface shown above.

**Example walkthrough:** the factory receives the actual message string, so the template literal can include it in the question. The `state` object also carries the message as context. Returning `result.answers` from `output()` retains the full answer object, rather than just the chosen team. The factory must be synchronous; use a preceding task for asynchronous preparation.

## output — finish with a result

Every top-level recipe ends with `return flow.output(name, value)` or a terminal branch. `name` is the outcome your application will read; `value` is optional. It may contain references inside an object or array.

### Input interface

| Parameter | Type | Description |
| --- | --- | --- |
| `name` | `string` | Outcome name and unique node ID. |
| `value?` | `unknown` | Optional value, expression, or nested object/array of expressions. |
| `display?` | `FlowDisplay` | Optional inspector labels. |

### Return interface

| Value / property | Type | Description |
| --- | --- | --- |
| Builder return | `FlowExpression<FlowOutcome>` | Terminal reference to return from the flow or branch callback. |
| Resolved `outcome` | `string` | The name passed to `output()`. |
| Resolved `value?` | `unknown` | The supplied value with references resolved. |

**Example walkthrough:** the task recipe above ends with `return flow.output("greeted", message)`. At runtime, `message` becomes the actual greeting string. Output does not send a message or perform a business action; your application decides what to do with the result.

## if — choose a value, then continue

Use [`if`](@/api/reference/#flow-if) when two paths should rejoin before the flow finishes:

<!-- example: flow-if.ts -->

### Input interface

| Parameter / option | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique decision ID: `"choose-speed"`. |
| `when` | `FlowExpression<boolean>` | Condition evaluated during the run. |
| `then` | `(path: FlowBuilder<{ express: boolean }>) => FlowExpression<number>` | Builds the true path and returns its value reference. |
| `else` | `(path: FlowBuilder<{ express: boolean }>) => FlowExpression<number>` | Builds the false path and returns its value reference. |
| `display?` | `FlowDisplay` | Optional inspector labels. |

### Return interface

| Value | Type | Description |
| --- | --- | --- |
| Builder return (`days`) | `FlowExpression<number>` | Reference to the selected path's value; both paths return numbers here. |
| Resolved `days` | `number` | `1` for express delivery; otherwise `5`. |
| Final run result | `{ runId: string; outcome: string; value?: unknown }` | Outcome `"estimated"`; value `"Delivery in 1 day(s)"` or `"Delivery in 5 day(s)"`. |

**Example walkthrough:** `.eq(true)` turns the `express` reference into a condition. Each path uses a task to supply a number. After the paths join, the shared `describe` task receives the selected number and formats the delivery message. This shared continuation is why the example uses `if()` rather than `branch()`. Calling `tryDelivery()` awaits `delivery.run({ express: true }, ...)`, then reads outcome `"estimated"` and value `"Delivery in 1 day(s)"` from the finished run.

Both callbacks describe their paths when the definition is built. Only the selected path's **steps** run. Put application work inside tasks, not directly inside the path-building callbacks. Do not use JavaScript `if (flow.input...)`: a reference is an object, not a resolved Boolean.

## branch — choose how to finish

Use [`branch`](@/api/reference/#flow-branch) when each path should end the flow with its own outcome:

<!-- example: flow-branch.ts -->

The options are `when`, `then`, and `else`, like [`if`](@/api/reference/#flow-if). The difference is what each path returns: a branch path must return [`output`](@/api/reference/#flow-output) or another terminal [`branch`](@/api/reference/#flow-branch).

### Input interface

| Parameter / option | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique decision ID: `"pick-path"`. |
| `when` | `FlowExpression<boolean>` | Selects which terminal path to execute. |
| `then`, `else` | `(path: FlowBuilder<{ needsReview: boolean }>) => FlowExpression<FlowOutcome>` | Each returns `output()` or another terminal branch. |
| `display?` | `FlowDisplay` | Optional inspector labels. |

### Return interface

| Value / property | Type | Description |
| --- | --- | --- |
| Builder return | `FlowExpression<FlowOutcome>` | Terminal result; return it from the enclosing flow. |
| Resolved `outcome` | `string` | `"manual-review"` when true; `"ready"` when false. |
| Resolved `value?` | `unknown` | `"A person should review this"` or `"Continue automatically"` here. |

**Example walkthrough:** `.eq(true)` checks `needsReview`. The selected path calls `output()` with its own outcome name and message. Returning the branch ends the flow; there is no shared step afterward. Use [`if()`](@/api/reference/#flow-if) when the paths should rejoin. Calling `tryBranch()` awaits `route.run({ needsReview: true }, ...)`, then reads outcome `"manual-review"` and value `"A person should review this"` from the finished run.

## parallel — do independent work together

Use [`parallel`](@/api/reference/#flow-parallel) when one piece of work does not need another's result:

<!-- example: flow-parallel.ts -->

Pass a step ID and an object of named lane callbacks. Each callback receives its own builder and returns a reference. Work within one lane stays sequential; different lanes may run concurrently. This tiny arithmetic example illustrates the result shape; concurrent service calls are a more practical use.

### Input interface

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique parallel step ID: `"calculate"`. |
| `lanes` | Object of `(lane: FlowBuilder<{ price: number }>) => FlowExpression<number>` callbacks | Each key names a lane; each callback returns that lane's result reference. |
| `display?` | `FlowDisplay` | Optional inspector labels. |

### Return interface

| Member / value | Type | Description |
| --- | --- | --- |
| Builder return | Object with the same keys as `lanes` | Each member retains its lane's expression type. |
| `prices.regular` | `FlowExpression<number>` | Reference to the unchanged price. |
| `prices.sale` | `FlowExpression<number>` | Reference to the discounted price. |
| Final `value` for `{ price: 100 }` | `unknown` | `{ regular: 100, sale: 80 }`. |

**Example walkthrough:** both lanes read the same input price through their own builders. `full-price` returns it unchanged, while `sale-price` multiplies it by `0.8`. The flow joins the lanes before resolving both references in the output object. A lane cannot read another lane's private intermediate steps. Calling `tryParallel()` awaits `totals.run({ price: 100 }, ...)`, then reads outcome `"priced"` and value `{ regular: 100, sale: 80 }` from the finished run.

## map — repeat a recipe for each item

Use [`map`](@/api/reference/#flow-map) for a list with a known size limit:

<!-- example: flow-map.ts -->

### Input interface

| Parameter / option | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique map ID: `"double"`. |
| `items` | `readonly number[] \| FlowExpression<readonly number[]>` | Array to process. |
| `input` | `{ multiplier: number }` | Shared context; may contain references. Use `{}` if none is needed. |
| `maxItems` | `number` | Required integer 1–64. Larger input rejects instead of truncating. |
| `concurrency?` | `number` | Maximum simultaneous items: 1–16, default 4. |
| `build` | `(item: FlowBuilder<{ item: number; index: number; context: { multiplier: number } }>) => FlowExpression<number>` | Describes one item's work. |
| `display?` | `FlowDisplay` | Optional inspector labels. |

The item builder's input has these properties:

| Property | Type in this example | Description |
| --- | --- | --- |
| `item` | `number` | Current number from the array. |
| `index` | `number` | Zero-based position in the original array. |
| `context` | `{ multiplier: number }` | Resolved shared context. |

### Return interface

| Value | Type | Description |
| --- | --- | --- |
| Builder return (`doubled`) | `FlowExpression<number[]>` | Reference to the result array. |
| Resolved array | `number[]` | `[4, 8, 12]` for `[2, 4, 6]`; `[]` for empty input. |
| Final run result | `{ runId: string; outcome: string; value?: unknown }` | Outcome `"doubled"`; value is the resolved array. |

**Example walkthrough:** `items` selects the input array, and `input` supplies a multiplier shared by all items. Within each item program, `get("item")` selects its number and `get("context").get("multiplier")` selects the multiplier. The task resolves both before multiplying. Up to two item programs run at once, but the result array preserves the original item order. Explicit context keeps the item program independent of outer step references. Calling `tryMap()` awaits `doubleEach.run({ numbers: [2, 4, 6] }, ...)`, then reads outcome `"doubled"` and value `[4, 8, 12]` from the finished run.

## loop — repeat until a condition is false

Use [`loop`](@/api/reference/#flow-loop) when the next iteration needs the previous one's result:

<!-- example: flow-loop.ts -->

### Input interface

| Parameter / option | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique loop ID: `"count"`. |
| `initial` | `number \| FlowExpression<number>` | Starting state: `0` here. State must be JSON-compatible. |
| `input` | `{}` | Shared context; `{}` here. |
| `while` | `(state: FlowExpression<number>) => FlowExpression<boolean>` | Condition checked before each iteration. |
| `maxIterations` | `number` | Required integer 1–64. |
| `build` | `(iteration: FlowBuilder<{ state: number; index: number; context: {} }>) => FlowExpression<number>` | Describes how to calculate the next state. |
| `display?` | `FlowDisplay` | Optional inspector labels. |

The iteration builder's input has these properties:

| Property | Type in this example | Description |
| --- | --- | --- |
| `state` | `number` | State before this iteration. |
| `index` | `number` | Zero-based iteration number. |
| `context` | `{}` | Resolved shared context; empty in this example. |

### Return interface

| Value | Type | Description |
| --- | --- | --- |
| Builder return (`count`) | `FlowExpression<number>` | Reference to the final state. |
| Resolved state | `number` | `3`, when `state.lt(3)` first becomes false. |
| Final run result | `{ runId: string; outcome: string; value?: unknown }` | Outcome `"counted"`, value `3`. |

**Example walkthrough:** `initial` starts the state at zero. `while` uses `.lt(3)` to build the stopping condition. The `increment` task reads the current state and adds one, producing `0 → 1 → 2 → 3`. Before a fourth iteration, the condition is false, so the loop returns `3`. If the initial condition is false, no iterations run and the initial state is returned. Calling `tryLoop()` awaits `countToThree.run({}, ...)`, then reads outcome `"counted"` and value `3` from the finished run.

If the condition is still true at the limit, the run rejects with [`FlowLoopLimitError`](@/api/reference/#flowlooplimiterror). It does not return a successful partial result. A loop may contain a map; nested loops, nested maps, and loops inside maps are unsupported.

## Give steps useful names

Step IDs and output names must be unique throughout the definition, even across paths that cannot both execute. Use 1–80 letters, digits, `_`, or `-`, starting with a letter or digit.

Every builder method also accepts optional final `display` metadata: `{ title?, description? }`. For example, [`flow.output("done", result, { title: "Ready to review" })`](@/api/reference/#flow-output). This changes the inspector label, not the behavior or model instructions. Keep display text safe to show to viewers.

## Where to go next

- [Build a connected flow](@/guides/flows/) combines an SDK question and a terminal branch with your inspector.
- [API glossary](@/api/reference/) lists every public method, its inputs, returns, and related contracts.
- [Flow builder reference](@/api/flow/) covers boundaries, replay, and fixture comparison.
- [Expressions and conditions](@/api/expressions/) explains comparisons and combining conditions.
