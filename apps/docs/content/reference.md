Use this page when you know an API name and want its contract. Each method has a permanent heading link, a readable signature, inputs, return value, and usage. Start with [Flows from scratch](@/guides/flow-basics/) if flows are new to you.

These are **working-tree docs**. Replay, fixture comparison, and display masking are marked unreleased relative to npm 0.4.1. Check the [changelog](@/changelog/) and your installed version. Signatures below use `Expression<T>` as shorthand for `FlowExpression<T>` and `Adapter` for `ReturnType<typeof createJevDevtools>`; these are reading aids, not additional exports. Readable signatures omit some generic detail; expand the exact declarations below when you need it. `SDKClientOptions` means the TypeSafe SDK constructor options, and `JoinedReferences` means an object of lane-name references. These labels are not package exports. SDK request/client types belong to `@typesafe-ai/sdk`.

## Find an API

| Area | APIs |
| --- | --- |
| React | [JevDevtools](#jevdevtools), [styles.css](#styles-css) |
| Server | [createJevDevtools](#createjevdevtools), [getJevDevtools](#getjevdevtools), [createClient](#adapter-createclient), [handle](#adapter-handle), [handleNodeRoute](#adapter-handlenoderoute), [middleware](#adapter-middleware), [run](#adapter-run), [dispose](#adapter-dispose), [startFlow](#observer-startflow) |
| Flow | [defineJevFlow](#definejevflow), [run](#flow-run), [definition](#flow-definition), [input](#flow-input), [task](#flow-task), [jev](#flow-jev), [answer / answers](#request-answer), [if](#flow-if), [branch](#flow-branch), [parallel](#flow-parallel), [map](#flow-map), [loop](#flow-loop), [output](#flow-output) |
| Expressions | [FlowExpression](#flowexpression), [get](#expression-get), [eq](#expression-eq), [lt](#expression-lt), [gt](#expression-gt), [gte](#expression-gte), [all](#all), [any](#any), [not](#not), [FlowLoopLimitError](#flowlooplimiterror) |
| Fixtures | [flowFixture](#flowfixture), [replayClient](#replayclient), [compareWithFixture](#comparewithfixture), [formatComparison](#formatcomparison) |
| Recorder | [JevRecorder](#jevrecorder), [transport](#recorder-transport), [instrument](#recorder-instrument), [snapshot](#recorder-snapshot), [changes](#recorder-changes), [subscribe](#recorder-subscribe), [clear](#recorder-clear), [withFlow](#recorder-withflow) |
| Observer hooks | [startFlow](#observer-startflow), [update](#observer-update), [request](#observer-request) |
| Data contracts | [Public types](#public-types) |

Code fragments use `inspector` for an adapter, `recorder` for a recorder, `flow` for a builder, and `program` for a defined flow. Fragments explain individual calls; the linked guides supply complete setup. Every builder method accepts optional final `display: FlowDisplay` metadata. See [flow limits](@/api/flow/#limits-and-errors) for shared ID, nesting, and execution limits.

## React

### JevDevtools

```ts
JevDevtools(props: JevDevtoolsProps): ReactElement | null
```

**Import:** `jev-devtools`. Render once in your React app. It returns nothing during SSR or while disabled; once enabled and mounted it loads the connected drawer.

| Input prop | Default | Meaning |
| --- | --- | --- |
| `enabled?: boolean` | `false` | Opt in to connecting and showing the inspector. |
| `endpoint?: string` | `/api/jev-devtools` | Same-origin inspector path; match the server. |
| `defaultOpen?: boolean` | `true` | Open the drawer on its initial mount. |
| `redactAdditionalSensitiveData?: boolean` | `true` | **Unreleased.** Mask supported personal fields in the display. Captured/streamed values remain unchanged. |

Unmounting or disabling closes its subscription. Closing the drawer alone does not stop capture. [React setup](@/api/react/) explains mounting and styling.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `React element or null` | Nothing during SSR/disabled state; the mounted inspector when enabled. |

```tsx api=core
import { JevDevtools } from "jev-devtools";

<JevDevtools enabled={import.meta.env.DEV} />;
```

**Example walkthrough:** The component enables the inspector only in Vite development builds through `import.meta.env.DEV`. Mounting it once gives the application one drawer and one connection.

### styles.css

`import "jev-devtools/styles.css"` loads the public stylesheet export. The built-in drawer includes its styles automatically, so ordinary installations do not need this import. This export is a stylesheet, not a function.

## Server adapter

Import factories from `jev-devtools/server`. All server adapter and recorder runtime code belongs on Node.

### createJevDevtools

```ts
createJevDevtools(options: JevDevtoolsServerOptions): Adapter
```

Creates an independent adapter and its in-memory histories. **Returns:** an object with all the adapter methods below.

| Input | Default | Meaning |
| --- | --- | --- |
| `origin: string` | Required | Exact browser origin, including port. |
| `enabled?: boolean` | `false` | Enable recording and HTTP endpoints. |
| `endpoint?: string` | `/api/jev-devtools` | Absolute path without query or fragment. |
| `limit?: number` | `50` | Global trace retention; clamped to 1–200. |
| `redact?: (path: string[], value: unknown) => unknown` | None | Transform the captured copy before storage/delivery. |
| `authorize?: (request: Request) => boolean | Promise<boolean>` | None | Access check; required for enabled non-loopback origins. |
| `getSession?: (request: Request) => string | Promise<string>` | `"local"` | Trusted recording scope, nonempty and at most 200 characters. |

Invalid origin/path configuration throws; enabled non-loopback origins without authorization throw. Share this instance between inference and inspector routes. [Access guide](@/guides/privacy/).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Adapter` | Independent adapter with client, routing, session, observer, and disposal methods. |

```ts api=core
import { createJevDevtools } from "jev-devtools/server";
const inspector = createJevDevtools({ enabled: true, origin: "http://localhost:3000" });
```

**Example walkthrough:** The example enables capture and binds inspector access to the browser origin `http://localhost:3000`. Keep this adapter instance shared between the HTTP routes and instrumented clients.

### getJevDevtools

```ts
getJevDevtools(key: string, createOptions: () => JevDevtoolsServerOptions): Adapter
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `key` | `string` |
| `createOptions` | `() => JevDevtoolsServerOptions` |

**Inputs:** a nonblank app-specific key and synchronous options factory. **Returns:** the same adapter for that key in the same Node realm; calls the factory only when creating it. The first options win until disposal or process restart. Empty keys throw. Histories are not shared across processes. Use this for module reloads in [Next.js](@/guides/nextjs/).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Adapter` | Existing adapter for the key, or a newly created adapter. |

```ts api=core
import { getJevDevtools } from "jev-devtools/server";
const inspector = getJevDevtools("my-app", () => ({
  enabled: true, origin: "http://localhost:3000",
}));
```

**Example walkthrough:** The stable `"my-app"` key reuses the adapter during module reloads. The callback supplies configuration only when an adapter for that key does not already exist.

### adapter.createClient

```ts
inspector.createClient(options: SDKClientOptions, metadata?: ClientMetadata): TypeSafeClient
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `options` | `SDKClientOptions` |
| `metadata?` | `ClientMetadata` |

**Inputs:** TypeSafe client constructor options (including your server-side key or custom `fetch`); optional `{ label?, source? }` defaults to `"Jev request"` and `"live"`. **Returns:** a client that records `systemOne` calls when enabled, otherwise an ordinary SDK client. Other SDK methods are not instrumented. Setting `source: "sample"` changes a label, not the transport or billing behavior.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `TypeSafeClient` | SDK client; instrumented when the adapter is enabled. |

```ts api=server
const client = inspector.createClient(
  { apiKey: process.env.TYPESAFE_API_KEY },
  { label: "Support", source: "live" },
);
```

**Example walkthrough:** The first argument configures the SDK with a server-side key. The second adds a human-readable capture label and marks the capture as live; it does not change the SDK request behavior.

### adapter.handle

```ts
inspector.handle(request: Request): Promise<Response>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `request` | `Request` |

**Input:** a Web Request with the actual public URL. **Returns:** configuration JSON, an event stream, a clear response, or an HTTP error. Forward the base path and all subpaths. Disabled/unmatched routes return 404; origin/auth failures return 403. Authorizer/session callback errors can reject, so let your framework handle errors. A Web Request provides no socket address: bind to loopback or configure authorization.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Promise<Response>` | Resolves to an HTTP response; includes HTTP error responses. |

```ts api=server
const response = await inspector.handle(request);
```

**Example walkthrough:** The application passes its incoming Web Request to the adapter and awaits a Web Response. Return that response from your framework’s inspector route.

### adapter.handleNodeRoute

```ts
inspector.handleNodeRoute(request: Request): Promise<Response>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `request` | `Request` |

**Input:** a Node framework's Web Request, including its actual `Host` header. **Returns:** the same response contract as `handle`, after checking Host against the configured authority and normalizing internal URLs. Forwarded host headers are not trusted. See the [Next.js route example](@/guides/nextjs/#expose-the-optional-catch-all-route).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Promise<Response>` | Response after Host validation and URL normalization. |

```ts api=server
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = GET;
```

**Example walkthrough:** The route exposes the same handler for GET and DELETE. The adapter checks Host before serving configuration, event streams, or a clear request.

### adapter.middleware

```ts
inspector.middleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `req` | `IncomingMessage` |
| `res` | `ServerResponse` |
| `next` | `() => void` |

**Inputs:** Node HTTP request/response and continuation. **Returns:** a promise completing response handling, or calls `next()` for unrelated paths. Mount at the root without stripping the inspector prefix. Without `authorize`, enabled endpoints require a loopback socket. Route errors are contained as HTTP 500 or a destroyed response.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Promise<void>` | Completes after response handling or calls next for an unrelated path. |

```ts api=server
app.use(inspector.middleware); // app is your Express/Connect server
```

**Example walkthrough:** Mounting the middleware on `app` preserves the full inspector path. Requests outside that path continue through `next()` to the application’s other handlers.

### adapter.run

```ts
inspector.run<T>(request: Request, callback: () => T | Promise<T>): Promise<T>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `request` | `Request` |
| `callback` | `() => T \| Promise<T>` |

**Inputs:** the application's authenticated request and work callback. **Returns:** the callback's resolved result; failures propagate. Chooses the recording scope through `getSession` for the callback's asynchronous work. It does not authorize the application action. Needed when using custom sessions.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Promise<T>` | Resolves to the application callback’s result; callback errors propagate. |

```ts api=server
return inspector.run(request, () => client.systemOne(input));
```

**Example walkthrough:** The request determines the recording session. The callback performs the SDK call inside that session, and its result becomes the resolved value of `inspector.run()`.

### adapter.dispose

```ts
inspector.dispose(): void
```

**Input interface:** no parameters.

Takes no arguments. Disables capture/endpoints and closes active streams. Shared adapters also release their key so a later `getJevDevtools` can create a new instance. **Returns:** nothing. Call on shutdown or deliberate reinitialization, not per request.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `void` | No data is returned. |

```ts api=server
inspector.dispose();
```

**Example walkthrough:** This shutdown call disables recording and closes streams owned by the adapter. A shared adapter also releases its registry key.

## Flow definitions and steps

Import `defineJevFlow` from `jev-devtools/flow` on Node. Builder methods describe work synchronously; they do not execute it. The complete examples below pair each definition with an async function that awaits its `run()` and reads the result. Call that function from Node to execute the example. See [Flows from scratch](@/guides/flow-basics/) for a complete, small example of every operation.

### defineJevFlow

```ts
defineJevFlow<Input>(name: string, build: (flow: FlowBuilder<Input>) => Expression<FlowOutcome>): { definition: FlowDefinition; run: /* see below */ }
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `name` | `string` |
| `build` | `(flow: FlowBuilder<Input>) => FlowExpression<FlowOutcome>` |

**Inputs:** a nonblank flow name of at most 100 characters, and a synchronous builder callback. Return the terminal `output` or `branch`. **Returns:** `{ definition, run }`, a reusable recipe. No SDK request is sent during definition. Invalid IDs, scopes, nesting, or terminal structure throw immediately.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| definition | `FlowDefinition` | Static graph. |
| run | `(input: Input, options: FlowRunOptions) => Promise<FlowOutcome & { runId: string }>` | Executes a fresh run. |

<!-- example: first-flow.ts -->

**Example walkthrough:** `greet` records the input reference and terminal output synchronously. Calling `tryGreeting()` awaits `greet.run({ name: "Ada" }, ...)` and reads outcome `"greeted"` and value `"Ada"`. The no-inference client needs no key because this definition has no Jev steps.

### flow.run

```ts
program.run(input: Input, options: FlowRunOptions): Promise<{ runId: string; outcome: string; value?: unknown }>
```

**Inputs:** the typed input promised by `defineJevFlow` and these options:

| Option | Meaning |
| --- | --- |
| `client` | Required client with SDK-compatible `systemOne`, even for task-only flows. |
| `devtools?` | Optional `FlowObserver`, usually your server adapter. |
| `signal?` | Optional `AbortSignal` to cancel the run. |

**Returns:** a fresh run ID, selected outcome name, and optional resolved value. `value` is `unknown`, not an inferred discriminated union. Errors and cancellation reject the promise. Tasks must cooperate with their signal; there is no rollback or automatic retry.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Promise<FlowOutcome & { runId: string }>` | Await to receive the fields below. |
| runId | `string` | Unique execution ID. |
| outcome | `string` | Selected terminal outcome name. |
| value? | `unknown` | Resolved output value; narrow its type in application code. |

```ts
const result = await program.run({ name: "Ada" }, { client, devtools: inspector });
console.log(result.outcome, result.value);
```

**Example walkthrough:** The input object supplies Ada’s name. `client` enables SDK steps and `devtools: inspector` enables recording. Awaiting the promise yields the chosen outcome and resolved output value.

### flow.definition

```ts
program.definition: FlowDefinition
```

**Input interface:** no parameters.

A description of the recipe, to treat as read-only: version, ID, name, and nodes. **Usage:** inspect it or pair it with a captured `FlowRun` when building a fixture. Reading it does not execute a flow. Do not mutate the definition to change running behavior.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Property value | `FlowDefinition` | Version, identity, name, and graph nodes. No work is executed. |

```ts
console.log(program.definition.name, program.definition.nodes.length);
```

**Example walkthrough:** Reading `name` and the node count inspects the recipe’s static structure. It does not execute tasks or send requests.

### flow.input

```ts
flow.input: FlowExpression<Input>
```

**Input interface:** no parameters.

A reference to the current recipe input, not its actual runtime value. **Returns/shape:** `Input` in ordinary flow/path/lane builders; `{ item, index, context }` inside map; `{ state, index, context }` inside loop. Select a field with `get`, or pass the whole reference into a task/request/output.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Property value | `FlowExpression<Input>` | Reference to the current flow, item, or iteration input. |

Inside a synchronous `defineJevFlow()` callback; these references resolve when you await the flow’s `run()`. See the [complete definition and execution](@/guides/flow-basics/#input-read-the-data-you-were-given).

```ts api=expressions
const name = flow.input.get("name");
```

**Example walkthrough:** The `get("name")` call selects a typed field reference. Pass that reference to a task or output to resolve it during execution.

### flow.task

```ts
flow.task<I, O>(id: string, task: FlowTask<I, O>, display?: FlowDisplay): Expression<Awaited<O>>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `id` | `string` |
| `task.input` | `I` |
| `task.run` | `(input: Resolved<I>, context: TaskContext) => O \| Promise<O>` |
| `task.timeoutMs?` | `number` |
| `display?` | `FlowDisplay` |

**Inputs:** unique step ID; `input` containing values/references; `run(resolvedInput, context)` returning a value or promise; optional `timeoutMs` integer from 1 to 2,147,483,647. Context has `signal`, `runId`, `stepId`, `executionId`. **Returns:** a reference to the awaited callback result. Failure rejects the flow. Timeouts cancel the wait and signal work; they cannot forcibly stop non-cooperating side effects. [Beginner example](@/guides/flow-basics/#task-run-your-own-code).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Builder return | `FlowExpression<Awaited<O>>` | Reference to the callback result. |
| Resolved value | `Awaited<O>` | Actual callback result after awaiting it, if needed. |

<!-- example: flow-task.ts -->

**Example walkthrough:** `get("name")` selects the input field. The task resolves it before calling `run`, so `name` inside the callback is an ordinary string. The template literal constructs the greeting. `output("greeted", message)` resolves that task result and makes it the final flow value. Calling `tryTask()` awaits `greeting.run({ name: "Ada" }, ...)`, then reads outcome `"greeted"` and value `"Hello, Ada!"` from the finished run.

### flow.jev

```ts
flow.jev(id, request, display?): AnswerRefs
flow.jev(id, { input, request: (resolvedInput) => sdkRequest }, display?): AnswerRefs
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `id` | `string` |
| `request` | `SDK request with expression-capable state, or FlowRequestFactory<I, Q>` |
| `display?` | `FlowDisplay` |

**Inputs:** unique ID and either a normal SDK request whose `state` may contain nested expressions, or a factory configuration. The factory's `input` is resolved first, then its synchronous `request` callback returns an SDK request. Use tasks for async preparation. The request's `questions` define named SDK question types; other SDK request options are passed through.

**Returns:** `.answer(name)` field references and `.answers` for all answers, typed from the questions. Runtime factories may generate question names; use `.answers` for dynamic keys. SDK failures reject the run. A request factory returning a promise is invalid. [Both forms with complete examples](@/guides/flow-basics/#jev-ask-a-question).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| answer(name) | `Object of typed answer-field expressions` | Selects one question’s fields, such as choice or noul. |
| answers | `FlowExpression<{ [K in keyof Q]: ResultFor<Q[K]> }>` | Reference to all answers. |
| Resolved answer fields | `SDK ResultFor<Q[K]> fields` | Actual field values for the selected SDK question type. |

**Define now, request later.** `flow.jev()` returns future-answer references, not a promise. `await classify.run(...)` executes the request and waits for its answer. Call `tryClassify(jev)` with the client from the [server setup](@/api/server/).

<!-- example: flow-jev.ts -->

**Example walkthrough:** `state: flow.input` sends the message as context. The SDK's `choice()` helper defines the allowed teams and their descriptions. `answer("team").choice` selects the model's chosen label, and `output()` returns it. `tryClassify()` supplies a concrete message to `await classify.run(...)`. After the request finishes, `result.outcome` is `"classified"` and `result.value` contains the chosen team. The selected team is not predetermined.

### request.answer

```ts
result.answer<Name extends keyof Questions>(name: Name): AnswerFieldReferences
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `name` | `A key of the request’s Questions type` |

**Input:** a known question name. **Returns:** an object whose answer fields are typed expressions: e.g. `.choice` for Choice, `.noul` for Noul, `.score` for Score, or `.box` for Box; other SDK result fields are available according to the question type. Calling `answer` does not send another request. Static unknown questions fail during definition; generated questions must exist when executed. A Noul is a probability of true, not a confidence score.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Object of FlowExpression fields` | Each result field is an expression with its SDK-defined value type. |

Inside a synchronous `defineJevFlow()` callback; these references resolve when you await the flow’s `run()`. See the [complete definition and execution](@/guides/flow-basics/#jev-ask-a-question).

```ts
const team = result.answer("team").choice; // expression for a Choice result
```

**Example walkthrough:** `answer("team")` selects the named question and `.choice` selects its chosen label. The assignment stores a reference, not an immediate model response.

### request.answers

```ts
result.answers: Expression<{ [Name in keyof Questions]: ResultFor<Questions[Name]> }>
```

**Input interface:** no parameters.

The full resolved SDK answer object, useful when a factory generates question names at runtime. **Usage:** pass it to a task or output. It is still a future-value reference during definition.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Property value | `FlowExpression<{ [K in keyof Q]: ResultFor<Q[K]> }>` | Reference to the complete answer object. |

Inside a synchronous `defineJevFlow()` callback; these references resolve when you await the flow’s `run()`. See the [complete definition and execution](@/guides/flow-basics/#jev-ask-a-question).

```ts api=parallel
return flow.output("answers", result.answers);
```

**Example walkthrough:** Passing the full answer reference to `output()` returns every answer and its SDK metadata in the flow value, rather than extracting one field.

### flow.if

```ts
flow.if<A, B>(id, { when, then, else }, display?): Expression<A | B>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `id` | `string` |
| `paths.when` | `FlowExpression<boolean>` |
| `paths.then` | `(path: FlowBuilder<Input>) => FlowExpression<A>` |
| `paths.else` | `(path: FlowBuilder<Input>) => FlowExpression<B>` |
| `display?` | `FlowDisplay` |

**Inputs:** a Boolean expression `when`; `then(path)` and `else(path)` callbacks each returning a value reference. **Returns:** the chosen value reference so later shared steps can continue. Both callbacks build synchronously, only the selected path executes. Use the provided path builder; do not return terminal outputs here. [Beginner example](@/guides/flow-basics/#if-choose-a-value-then-continue).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Builder return | `FlowExpression<A \| B>` | Reference to the selected path’s result. |
| Resolved value | `A \| B` | Value from the executed path, available to later steps. |

<!-- example: flow-if.ts -->

**Example walkthrough:** `.eq(true)` turns the `express` reference into a condition. Each path uses a task to supply a number. After the paths join, the shared `describe` task receives the selected number and formats the delivery message. This shared continuation is why the example uses `if()` rather than `branch()`. Calling `tryDelivery()` awaits `delivery.run({ express: true }, ...)`, then reads outcome `"estimated"` and value `"Delivery in 1 day(s)"` from the finished run.

### flow.branch

```ts
flow.branch(id, { when, then, else }, display?): Expression<FlowOutcome>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `id` | `string` |
| `paths.when` | `FlowExpression<boolean>` |
| `paths.then, paths.else` | `(path: FlowBuilder<Input>) => FlowExpression<FlowOutcome>` |
| `display?` | `FlowDisplay` |

**Inputs:** Boolean `when`; two callbacks returning `output` or another terminal `branch`. **Returns:** the terminal result reference. Return it from the containing flow/path. No steps may follow this terminal decision. Use `if` to rejoin instead. [Beginner example](@/guides/flow-basics/#branch-choose-how-to-finish).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Builder return | `FlowExpression<FlowOutcome>` | Terminal result reference. |
| Resolved outcome | `string` | Name returned by the selected terminal path. |
| Resolved value? | `unknown` | Optional resolved value returned by that path. |

<!-- example: flow-branch.ts -->

**Example walkthrough:** `.eq(true)` checks `needsReview`. The selected path calls `output()` with its own outcome name and message. Returning the branch ends the flow; there is no shared step afterward. Use [`if()`](@/api/reference/#flow-if) when the paths should rejoin. Calling `tryBranch()` awaits `route.run({ needsReview: true }, ...)`, then reads outcome `"manual-review"` and value `"A person should review this"` from the finished run.

### flow.parallel

```ts
flow.parallel(id, lanes: { [name: string]: (lane) => Expression<unknown> }, display?): JoinedReferences
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `id` | `string` |
| `lanes` | `Named builder callbacks, each returning a FlowExpression` |
| `display?` | `FlowDisplay` |

**Inputs:** a nonempty object of named lane callbacks, each returning a value expression. Lane names follow step ID naming rules. **Returns:** an object preserving lane names and their expression types. Lanes run concurrently; steps within a lane are sequential. Sibling intermediate results are private. A failure cancels sibling work cooperatively. [Beginner example](@/guides/flow-basics/#parallel-do-independent-work-together).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Builder return | `Object with the lane keys` | Each member preserves its lane’s expression type. |
| Resolved lane values | `Each lane’s result type` | Available through the named references after the join. |

<!-- example: flow-parallel.ts -->

**Example walkthrough:** both lanes read the same input price through their own builders. `full-price` returns it unchanged, while `sale-price` multiplies it by `0.8`. The flow joins the lanes before resolving both references in the output object. A lane cannot read another lane's private intermediate steps. Calling `tryParallel()` awaits `totals.run({ price: 100 }, ...)`, then reads outcome `"priced"` and value `{ regular: 100, sale: 80 }` from the finished run.

### flow.map

```ts
flow.map<Item, Context, Output>(id, { items, input, maxItems, concurrency? }, build, display?): Expression<Output[]>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `id` | `string` |
| `options.items` | `readonly Item[] \| FlowExpression<readonly Item[]>` |
| `options.input` | `Context` |
| `options.maxItems` | `number` |
| `options.concurrency?` | `number` |
| `build` | `(item: FlowBuilder<{ item: Item; index: number; context: Resolved<Context> }>) => FlowExpression<Output>` |
| `display?` | `FlowDisplay` |

**Inputs:** array/reference `items`; shared context `input`; required integer `maxItems` from 1–64; `concurrency` from 1–16 (default 4). `build(item)` receives `FlowBuilder<{ item: Item; index: number; context: Resolved<Context> }>` and returns a value reference.

**Returns:** results in original item order; empty input returns an empty array. Exceeding `maxItems` rejects instead of truncating. Use explicit context rather than outer references inside the item program. No nested maps or loops inside maps. [Complete beginner example](@/guides/flow-basics/#map-repeat-a-recipe-for-each-item).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Builder return | `FlowExpression<Output[]>` | Reference to the result array. |
| Resolved value | `Output[]` | One result per item, in original input order. |

<!-- example: flow-map.ts -->

**Example walkthrough:** `items` selects the input array, and `input` supplies a multiplier shared by all items. Within each item program, `get("item")` selects its number and `get("context").get("multiplier")` selects the multiplier. The task resolves both before multiplying. Up to two item programs run at once, but the result array preserves the original item order. Explicit context keeps the item program independent of outer step references. Calling `tryMap()` awaits `doubleEach.run({ numbers: [2, 4, 6] }, ...)`, then reads outcome `"doubled"` and value `[4, 8, 12]` from the finished run.

### flow.loop

```ts
flow.loop<State, Context>(id, { initial, input, while, maxIterations }, build, display?): Expression<State>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `id` | `string` |
| `options.initial` | `State \| FlowExpression<State>` |
| `options.input` | `Context` |
| `options.while` | `(state: FlowExpression<State>) => FlowExpression<boolean>` |
| `options.maxIterations` | `number` |
| `build` | `(iteration: FlowBuilder<{ state: State; index: number; context: Resolved<Context> }>) => FlowExpression<State>` |
| `display?` | `FlowDisplay` |

**Inputs:** JSON state/reference `initial`; explicit shared context `input`; `while(state)` returning a Boolean expression of that state; required `maxIterations` integer 1–64. `build(iteration)` gets `{ state, index, context }` through its builder input and returns the next state reference of the same type.

**Returns:** final state when the pre-iteration condition becomes false (possibly the initial state). If still true at the limit, rejects with `FlowLoopLimitError`. Nested loops are unsupported; a loop can contain a map. [Beginner example](@/guides/flow-basics/#loop-repeat-until-a-condition-is-false).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Builder return | `FlowExpression<State>` | Reference to the final state. |
| Resolved value | `State` | State when the condition becomes false; initial state if no iterations run. |

<!-- example: flow-loop.ts -->

**Example walkthrough:** `initial` starts the state at zero. `while` uses `.lt(3)` to build the stopping condition. The `increment` task reads the current state and adds one, producing `0 → 1 → 2 → 3`. Before a fourth iteration, the condition is false, so the loop returns `3`. If the initial condition is false, no iterations run and the initial state is returned. Calling `tryLoop()` awaits `countToThree.run({}, ...)`, then reads outcome `"counted"` and value `3` from the finished run.

### flow.output

```ts
flow.output(name: string, value?: unknown, display?: FlowDisplay): Expression<FlowOutcome>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `name` | `string` |
| `value?` | `unknown` |
| `display?` | `FlowDisplay` |

**Inputs:** outcome name (also a unique node ID), optional literal/reference or nested value, optional display metadata. **Returns:** a terminal expression. Return it from your flow or branch path. Resolves nested references when run; no business action happens just because an outcome is named. No steps may follow it.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Builder return | `FlowExpression<FlowOutcome>` | Terminal result reference. |
| Resolved outcome | `string` | The supplied name. |
| Resolved value? | `unknown` | The supplied value with nested references resolved. |

Inside a synchronous `defineJevFlow()` callback; these references resolve when you await the flow’s `run()`. See the [complete definition and execution](@/guides/flow-basics/#output-finish-with-a-result).

```ts api=parallel
return flow.output("done", { message, count });
```

**Example walkthrough:** The object groups two previously defined references, `message` and `count`. Both are resolved into ordinary values under outcome `"done"`; naming the outcome performs no external action.

## Expressions and conditions

The short expression snippets below belong inside a synchronous `defineJevFlow()` callback. They build references; use them in a step or terminal `output()`, then await the flow’s `run()` to get actual data. See the [complete expression and execution example](@/api/flow/#collections-and-loops).

All these runtime exports come from `jev-devtools/flow`. References must belong to the same flow and be available in the current execution scope. See [expression scopes](@/api/expressions/#respect-scope).

### FlowExpression

```ts
new FlowExpression<T>(ast, owner?: object)
expression.ast: Ast
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `ast` | `Expression AST; see supporting structural types` |
| `owner?` | `object; ownership is managed by the builder` |

A typed representation of a future value. The constructor accepts an expression AST (`input`, `ref`, `get`, `literal`, or supported operator nodes) and optional ownership token; it freezes the AST. **Returns:** an expression with the methods below. Its `ast` property describes the expression, not its resolved value.

Ordinary consumers should obtain owned expressions from builders. Hand-constructed expressions are generally unowned and cannot be inserted into a flow; the optional owner is not an application integration mechanism. The structural AST is visible in installed declarations, but not exported as a named public `Ast` type.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowExpression<T>` | Immutable expression object. |
| ast | `Ast` | Frozen expression structure, not a resolved application value. |

```ts api=expressions
const message = flow.input.get("message"); // obtain an owned expression
```

**Example walkthrough:** Use the builder’s owned input reference and select its message field. This avoids manually constructing an AST or ownership token.

### expression.get

```ts
expression.get<K extends keyof T & (string | number)>(key: K): Expression<T[K]>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `key` | `keyof T & (string \| number)` |

**Input:** a valid string/number property key. **Returns:** a reference to that field; chain for nested fields. Missing values fail when execution reaches them. This is field selection, not a general optional chaining mechanism.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowExpression<T[K]>` | Reference to the selected field. |

```ts api=expressions
const city = flow.input.get("address").get("city");
```

**Example walkthrough:** The first `get()` selects the nested address object; the second selects its city field. Both selections remain references until the flow evaluates them.

### expression.eq

```ts
expression.eq(value: T | Expression<T>): Expression<boolean>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `value` | `T \| FlowExpression<T>` |

**Input:** a literal or compatible expression. Equality for matching scalar types (string, number, Boolean, or null); not deep object equality. **Returns:** a Boolean expression, not a JavaScript Boolean. Invalid scalar comparisons reject during execution.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean` | True or false when the flow evaluates it. |

```ts api=expressions
const condition = flow.input.get("count").eq(3);
```

**Example walkthrough:** The comparison checks whether the resolved count equals 3. Pass the resulting Boolean expression to `when` or another condition helper.

### expression.lt

```ts
expression.lt(value: number | Expression<number>): Expression<boolean>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `value` | `number \| FlowExpression<number>` |

**Input:** a literal or compatible expression. Strictly less than. **Returns:** a Boolean expression, not a JavaScript Boolean. Both resolved operands must be finite numbers; missing, nullable, or nonnumeric operands reject during execution. There is no `lte`; use `not(value.gt(limit))` for a valid numeric inclusive upper bound.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean` | True or false when the flow evaluates it. |

```ts api=expressions
const condition = flow.input.get("count").lt(3);
```

**Example walkthrough:** The comparison is true when the resolved count is below 3. It describes a condition now and evaluates it when the flow runs.

### expression.gt

```ts
expression.gt(value: number | Expression<number>): Expression<boolean>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `value` | `number \| FlowExpression<number>` |

**Input:** a literal or compatible expression. Strictly greater than. **Returns:** a Boolean expression, not a JavaScript Boolean. Both resolved operands must be finite numbers; missing, nullable, or nonnumeric operands reject during execution. There is no `lte`; use `not(value.gt(limit))` for a valid numeric inclusive upper bound.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean` | True or false when the flow evaluates it. |

```ts api=expressions
const condition = flow.input.get("count").gt(3);
```

**Example walkthrough:** The comparison is true when the resolved count is above 3. Both operands must resolve to finite numbers.

### expression.gte

```ts
expression.gte(value: number | Expression<number>): Expression<boolean>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `value` | `number \| FlowExpression<number>` |

**Input:** a literal or compatible expression. Greater than or equal. **Returns:** a Boolean expression, not a JavaScript Boolean. Both resolved operands must be finite numbers; missing, nullable, or nonnumeric operands reject during execution. There is no `lte`; use `not(value.gt(limit))` for a valid numeric inclusive upper bound.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean` | True or false when the flow evaluates it. |

```ts api=expressions
const condition = flow.input.get("count").gte(3);
```

**Example walkthrough:** The comparison includes the boundary: a count of 3 satisfies it. It returns a condition reference for a later decision.

### all

```ts
all(...conditions: Expression<boolean>[]): Expression<boolean>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `...conditions` | `FlowExpression<boolean>[]` |

**Inputs:** Boolean expressions. **Returns:** a Boolean expression. True only when every condition is true. Supply at least one owned condition; a zero-operand expression has no flow owner and cannot be used in a definition. All operands are evaluated; these helpers do not short-circuit missing-reference errors like JavaScript `&&`/`||`.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean` | True or false when the flow evaluates it. |

```ts api=expressions
const ready = all(flow.input.get("count").gte(1), flow.input.get("count").lt(10));
```

**Example walkthrough:** The two comparisons describe an inclusive lower bound of 1 and an exclusive upper bound of 10. `all()` combines them so both must hold.

### any

```ts
any(...conditions: Expression<boolean>[]): Expression<boolean>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `...conditions` | `FlowExpression<boolean>[]` |

**Inputs:** Boolean expressions. **Returns:** a Boolean expression. True when at least one condition is true. Supply at least one owned condition; a zero-operand expression has no flow owner and cannot be used in a definition. All operands are evaluated; these helpers do not short-circuit missing-reference errors like JavaScript `&&`/`||`.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean` | True or false when the flow evaluates it. |

```ts api=expressions
const boundary = any(flow.input.get("count").eq(0), flow.input.get("count").eq(10));
```

**Example walkthrough:** The two comparisons test the endpoints zero and ten. `any()` is true when either endpoint matches.

### not

```ts
not(condition: Expression<boolean>): Expression<boolean>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `condition` | `FlowExpression<boolean>` |

**Inputs:** Boolean expression. **Returns:** a Boolean expression. Inverts one Boolean expression. All operands are evaluated; these helpers do not short-circuit missing-reference errors like JavaScript `&&`/`||`.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean` | True or false when the flow evaluates it. |

```ts api=expressions
const remaining = not(flow.input.get("count").eq(0));
```

**Example walkthrough:** The equality expression checks for zero; `not()` inverts it so a nonzero count satisfies the condition.

### FlowLoopLimitError

```ts
new FlowLoopLimitError(): Error
error.name: "FlowLoopLimitError"
```

**Input interface:** no parameters.

Exported error class thrown when a loop condition remains true after its iteration limit. Takes no constructor arguments. **Usage:** catch around the awaited run; other errors should propagate. A limit error is not a successful partial result.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `FlowLoopLimitError` | Error instance. |
| name | `"FlowLoopLimitError"` | Identifies a still-true condition at the loop limit. |

```ts
import { FlowLoopLimitError } from "jev-devtools/flow";
try {
  await program.run(input, { client });
} catch (error) {
  if (!(error instanceof FlowLoopLimitError)) throw error;
  console.error("The flow needs a different stopping rule or iteration limit.");
}
```

**Example walkthrough:** The catch block handles only loop exhaustion and rethrows other failures. The flow did not complete successfully, so the handler reports the limit instead of treating a partial state as a result.

## Fixtures and comparison

**Unreleased relative to npm 0.4.1.** Use the working-tree package. Fixtures contain captured response bodies, not the original input or executable recipe.

### flowFixture

```ts
flowFixture(definition: FlowDefinition, run: FlowRun, traces: ReadonlyMap<string, Trace>): BuiltFlowFixture
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `definition` | `FlowDefinition` |
| `run` | `FlowRun` |
| `traces` | `ReadonlyMap<string, Trace>` |

**Import:** `jev-devtools` (browser-safe) or `jev-devtools/flow` (Node). **Inputs:** recorded definition, recorded run, and map indexed by trace ID. **Returns:** `{ fixture, missing, warnings }`. Completed Jev steps without available response captures appear in `missing`. Capture truncation/redaction warnings appear in `warnings`. Task results are not fixture responses.

Check both arrays before saving. Server redaction remains; this helper does not apply the drawer's current display masking. The drawer's Copy fixture action does. Failed/cancelled runs can yield partial fixtures.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `BuiltFlowFixture` | Export result with fields below. |
| fixture | `FlowFixture` | Saved response bodies by step ID. |
| missing | `string[]` | Completed Jev steps with missing response captures. |
| warnings | `string[]` | Capture limitations such as redaction or truncation. |

```ts
const built = flowFixture(definition, capturedRun, new Map(traces.map((trace) => [trace.id, trace])));
if (built.missing.length || built.warnings.length) console.warn(built);
const json = JSON.stringify(built.fixture, null, 2);
```

**Example walkthrough:** The map indexes captures by trace ID. `flowFixture()` finds responses linked to completed Jev steps; the example checks limitations before serializing only the fixture payload.

### replayClient

```ts
replayClient(fixture: FlowFixture): TypeSafeClient
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `fixture` | `FlowFixture` |

**Import:** `jev-devtools/flow`. **Input:** `{ version: 1, flow, steps }`. **Returns:** a client for a flow's `run` that supplies saved Jev responses without a key/network. Checks flow name, step IDs, and question names, not prompts/state. Invalid fixtures throw; missing steps/answers reject rather than falling back to inference. Item/iteration step keys include their indices.

Tasks and request factories run again and can have side effects. Pass controlled tasks in tests. [Complete replay example](@/api/flow/#replay-captured-answers-unreleased).

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `TypeSafeClient` | Supplies fixture answers when used as a flow run’s client. |

```ts
const result = await program.run(input, { client: replayClient(fixture) });
```

**Example walkthrough:** The client supplies stored answers for Jev steps while the same recipe executes with the supplied input. Tasks and request factories still execute, so control side effects in replay tests.

### compareWithFixture

```ts
compareWithFixture<Input>(flow: ComparableFlow<Input>, input: Input, fixture: FlowFixture, options: FlowRunOptions & { tolerance?: number }): Promise<FixtureComparison>
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `flow` | `ComparableFlow<Input>` |
| `input` | `Input` |
| `fixture` | `FlowFixture` |
| `options` | `FlowRunOptions & { tolerance?: number }` |

**Import:** `jev-devtools/flow`. **Inputs:** the executable recipe, the same input for both runs, saved fixture, live client, optional observer/signal, and numeric answer tolerance (default 0; finite and nonnegative). Replays the recorded side first, then runs the live side; both execute tasks. Only the live side reaches your observer.

**Returns:** outcome/value comparisons, branch/if decisions, scalar answer-field differences, step IDs unique to either side, and a new `liveFixture`. Top-level `changed` means outcome, value, decision, or executed Jev-step differences; **answer drift alone does not set it**. Tolerance applies to numeric answer-field differences, not outcome/value comparisons. Invalid tolerance or unreplayable fixtures reject; live errors propagate.

Unlike offline replay, this makes real SDK calls with the supplied client. `liveFixture` contains unredacted, untruncated live response bodies; review before storing or sharing.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Promise<FixtureComparison>` | Resolves to the comparison fields below. |
| changed | `boolean` | Outcome, value, decision, or executed Jev steps differ; answer drift alone does not set it. |
| outcome | `{ recorded: string; live: string; changed: boolean }` | Terminal outcome comparison. |
| value | `{ recorded?: unknown; live?: unknown; changed: boolean }` | Resolved output comparison. |
| decisions | `Array<{ stepId: string; recorded?: boolean; live?: boolean; changed: boolean }>` | Branch and if decisions. |
| answers | `AnswerChange[]` | Scalar answer-field comparisons, including numeric deltas when finite. |
| steps | `{ onlyRecorded: string[]; onlyLive: string[] }` | Jev step IDs executed on only one side. |
| liveFixture | `FlowFixture` | Unredacted, untruncated live response bodies. |

```ts
import { compareWithFixture, formatComparison } from "jev-devtools/flow";
const comparison = await compareWithFixture(program, input, fixture, {
  client, devtools: inspector, tolerance: 0.01,
});
console.log(formatComparison(comparison));
```

**Example walkthrough:** The helper first replays the saved fixture, then executes with the supplied client. The tolerance permits small numeric answer differences. `formatComparison()` prints the differences without changing either run’s result.

### formatComparison

```ts
formatComparison(comparison: FixtureComparison): string
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `comparison` | `FixtureComparison` |

**Import:** `jev-devtools/flow`. **Input:** a comparison result. **Returns:** a plain-text summary with one line per change, or `"no changes from fixture"`. No I/O is performed; print or store it yourself. It may report answer drift even when `comparison.changed` is false.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `string` | One line per reported change, or no changes from fixture. |

```ts
const summary = formatComparison(comparison);
console.log(summary);
```

**Example walkthrough:** Formatting produces text only. `console.log()` is the application-owned output operation; the formatter itself performs no logging.

## Recorder

Import `JevRecorder` from `jev-devtools/server`. This is for custom integrations; most apps can use the server adapter. [Complete recorder setup](@/api/recorder/#jevrecorder).

### JevRecorder

```ts
new JevRecorder(options?: CaptureOptions): JevRecorder
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `options?` | `CaptureOptions` |

**Inputs:** optional `limit` (default 50, clamped 1–200 globally) and `redact(path, value)` callback. **Returns:** a recorder with the following methods. History is bounded process memory, not durable storage. Pair `instrument` and `transport` to capture logical requests and HTTP attempts.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `JevRecorder` | Recorder instance with the methods below. |

```ts api=core
import { JevRecorder } from "jev-devtools/server";
const recorder = new JevRecorder({ limit: 50 });
```

**Example walkthrough:** Constructing the recorder sets a global retention bound of 50 traces. The instance can then wrap an SDK client and expose history to a custom viewer.

### recorder.transport

```ts
recorder.transport(fetcher: Fetch): Fetch
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `fetcher` | `SDK-compatible Fetch` |

**Input:** SDK-compatible fetch implementation, e.g. `globalThis.fetch`. **Returns:** a compatible wrapper that records HTTP attempts associated with instrumented calls. Give it to the SDK's `fetch` option; it is not a standalone recording server.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Fetch` | SDK-compatible fetch wrapper; request/response contract is retained. |

```ts
const sdk = new TypeSafeClient({ apiKey, fetch: recorder.transport(globalThis.fetch) });
```

**Example walkthrough:** The SDK receives a wrapped `fetch`, so HTTP attempts can be associated with instrumented logical calls. Pair this client with `recorder.instrument()` to record both levels.

### recorder.instrument

```ts
recorder.instrument<T extends TypeSafeClient>(client: T, metadata: { session: string; label: string; source: "sample" | "live" } | (() => Metadata)): T
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `client` | `T extends TypeSafeClient` |
| `metadata` | `{ session: string; label: string; source: "sample" \| "live" }, or a factory returning it` |

**Inputs:** an SDK client and complete metadata or a synchronous metadata factory. `session` partitions history; `label` identifies a call; `source` labels sample/live captures. **Returns:** an instrumented proxy preserving the client's type, SDK promise, response helpers, and application result. Only `systemOne` is captured; pair with `transport` for attempts. A sample label does not prevent network calls.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `T` | Instrumented client proxy preserving its original SDK type. |

```ts
const client = recorder.instrument(sdk, { session: "local", label: "Support", source: "live" });
```

**Example walkthrough:** The proxy records `systemOne` calls under the local session with the Support label. The original SDK’s response helpers remain available on the returned client.

### recorder.snapshot

```ts
recorder.snapshot(session: string): Trace[]
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `session` | `string` |

**Input:** session to read. **Returns:** detached retained traces, newest first. These are bounded/redacted inspection copies, not original SDK objects. Reading does not clear history.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `Trace[]` | Detached retained traces for the session, newest first. |

```ts
const traces = recorder.snapshot("local");
```

**Example walkthrough:** The call retrieves a detached copy of the local session’s current history. Reading the array does not clear or mutate recorder storage.

### recorder.changes

```ts
recorder.changes(session: string, after?: number): { revision: number; order: string[]; upserts: Trace[] }
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `session` | `string` |
| `after?` | `number` |

**Inputs:** session and optional revision cursor. **Returns:** current revision, authoritative newest-first retained IDs, and detached changed traces. Omit `after` for an initial full view. Remove locally cached IDs absent from `order`, even when `upserts` is empty, and save the returned cursor.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| revision | `number` | Cursor for the next call. |
| order | `string[]` | Authoritative newest-first retained trace IDs. |
| upserts | `Trace[]` | Detached traces changed since the supplied cursor. |

```ts
const initial = recorder.changes("local");
const next = recorder.changes("local", initial.revision);
```

**Example walkthrough:** The initial call requests a full view. Passing its revision into the second call requests changed traces; use the returned order to remove traces no longer retained.

### recorder.subscribe

```ts
recorder.subscribe(listener: (sessions: ReadonlySet<string>) => void): () => void
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `listener` | `(sessions: ReadonlySet<string>) => void` |

**Input:** listener notified of affected sessions. **Returns:** a function to unsubscribe. Read a snapshot/changes for your session when notified. Notifications carry session names, not trace payloads.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `() => void` | Unsubscribe function; call when the listener is no longer needed. |

```ts
const stop = recorder.subscribe((sessions) => {
  if (sessions.has("local")) console.log(recorder.snapshot("local"));
});
// On shutdown:
stop();
```

**Example walkthrough:** The listener filters notifications to the local session before reading its snapshot. Calling `stop()` removes that listener during cleanup.

### recorder.clear

```ts
recorder.clear(session: string): void
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `session` | `string` |

**Input:** session to clear. **Returns:** nothing. Removes that session's retained traces and notifies listeners; other session traces remain. Does not cancel your application's in-flight SDK work.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `void` | No data; affected listeners are notified. |

```ts
recorder.clear("local");
```

**Example walkthrough:** Only retained traces for the local session are removed. Other session histories and application inference continue.

### recorder.withFlow

```ts
recorder.withFlow<T>(link: { runId: string; stepId: string; executionId: string }, onTrace: (id: string) => void, callback: () => T): T
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `link` | `{ runId: string; stepId: string; executionId: string }` |
| `onTrace` | `(id: string) => void` |
| `callback` | `() => T` |

**Inputs:** flow linkage, trace-ID callback, and request callback. **Returns:** the callback's result unchanged, including a promise if it returns one. Establishes async recording context and calls through immediately. Normally invoked by the adapter's observer; standalone custom integrations should keep the call-through synchronous.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `T` | The callback result unchanged, including a promise when applicable. |

```ts
return recorder.withFlow(link, (traceId) => { latestTraceId = traceId; }, callback);
```

**Example walkthrough:** The wrapper establishes flow linkage around the request callback. `onTrace` stores the captured trace ID, while the callback’s result is returned unchanged.

## Observer hooks

`FlowObserver` is exported as a type from `jev-devtools/flow`. Pass an implementation as `devtools` to a run; the server adapter already implements it. Observers record execution and must not control application work. Current working-tree observer failure containment is unreleased relative to npm 0.4.1.

### observer.startFlow

```ts
observer.startFlow(definition: FlowDefinition, run: FlowRun): { update; request } | undefined
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `definition` | `FlowDefinition` |
| `run` | `FlowRun` |

**Inputs:** the graph and initial captured run. **Returns:** per-run `update`/`request` hooks, or `undefined` to skip observation. The adapter's `startFlow` records to the current session and returns `undefined` when disabled. Usually you never call it directly.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `{ update, request } \| undefined` | Per-run hooks, or undefined to skip recording. |
| update | `(run: FlowRun) => void` | Receives execution updates. |
| request | `Generic callback wrapper` | Links a request to its flow step; signature below. |

```ts
await program.run(input, { client, devtools: inspector }); // runner calls startFlow
```

**Example walkthrough:** Passing the inspector as `devtools` lets the runner call `startFlow` and manage the returned hooks. Application code does not need to invoke those hooks manually.

### observer.update

```ts
hooks.update(run: FlowRun): void
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `run` | `FlowRun` |

**Input:** latest run snapshot with step status, outcome, or error. **Returns:** nothing. Store/send the snapshot in a custom viewer integration; do not use it to execute business actions. The runner calls this as execution changes.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `void` | No application result is produced. |

```ts
const hooks = {
  update(run: FlowRun) { console.log(run.id, run.status); },
  request<T>(_link: unknown, _onTrace: (id: string) => void, callback: () => T): T {
    return callback();
  },
};
```

**Example walkthrough:** The update hook logs the run ID and status. Its companion request hook calls through immediately; these hooks observe execution rather than implement application steps.

### observer.request

```ts
hooks.request<T>(link: { runId: string; stepId: string; executionId: string }, onTrace: (id: string) => void, callback: () => T): T
```

**Input interface**

| Parameter / option | Type |
| --- | --- |
| `link` | `{ runId: string; stepId: string; executionId: string }` |
| `onTrace` | `(id: string) => void` |
| `callback` | `() => T` |

**Inputs:** execution linkage, a callback to report the captured trace ID, and the request callback. **Returns:** the callback's original result. Call through synchronously so recording context is established; the runner owns the result. Custom observers can delegate to a recorder.

**Return interface**

| Value / member | Type | Description |
| --- | --- | --- |
| Return | `T` | The original request callback result. |

```ts
request<T>(link: Link, onTrace: (id: string) => void, callback: () => T): T {
  return recorder.withFlow(link, onTrace, callback);
} // method inside a custom hook object; Link is the shape above
```

**Example walkthrough:** The custom observer delegates to `withFlow()` so the recorder can associate the SDK request with its run, step, and execution ID. Returning the callback result preserves the runner’s request behavior.

## Public types

Use `import type` for these contracts. The expandable declarations below are read from the actual public package exports at docs build time, including their supporting structural types. They supplement the method explanations above and make exact fields and unions available without a browser TypeScript runtime. A type's declaration is not a promise that the same API exists in an older installed package.

<!-- public-api-types -->
