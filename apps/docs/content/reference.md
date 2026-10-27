Look up an API by name to find its signature, parameters, return type, example, and failure behavior. Each entry has a permanent link. For a first integration, start with [Quick start](@/getting-started/). For a first flow, use [Flows from scratch](@/guides/flow-basics/).

These docs describe **version 0.5.6**. [See release notes for verified publication status.](https://github.com/diegoag64/jev-devtools/releases/tag/v0.5.6) Replay, fixture comparison, and display masking require 0.5.0 or later. Check the [changelog](@/changelog/) and your installed version.

<details class="reference-notes">
<summary>How to read the signatures</summary>

Signatures below use `Expression<T>` as shorthand for `FlowExpression<T>` and `Adapter` for `ReturnType<typeof createJevDevtools>`; these are reading aids, not additional exports. Readable signatures omit some generic detail; expand the exact declarations below when you need it. `SDKClientOptions` means the TypeSafe SDK constructor options, and `JoinedReferences` means an object of lane-name references. These labels are not package exports. SDK request/client types belong to `@typesafe-ai/sdk`.

</details>

## Find an API

<nav class="api-directory" aria-label="API categories">
<a href="#react"><strong>React</strong><span>Mount and configure the inspector.</span></a>
<a href="#server-adapter"><strong>Server adapter</strong><span>Create a client and connect HTTP routes.</span></a>
<a href="#flow-definitions-and-steps"><strong>Flows</strong><span>Define steps, run them, and read results.</span></a>
<a href="#expressions-and-conditions"><strong>Expressions</strong><span>Select values and build conditions.</span></a>
<a href="#fixtures-and-comparison"><strong>Fixtures</strong><span>Replay answers and compare executions.</span></a>
<a href="#recorder"><strong>Recorder</strong><span>Capture requests and inspect history.</span></a>
<a href="#observer-hooks"><strong>Observer hooks</strong><span>Connect a custom flow observer.</span></a>
<a href="#public-types"><strong>Types</strong><span>Read public TypeScript contracts.</span></a>
</nav>

Code fragments use `inspector` for an adapter, `recorder` for a recorder, `flow` for a builder, and `program` for a defined flow. Fragments explain individual calls; the linked guides supply complete setup. Every builder method accepts optional final `display: FlowDisplay` metadata. See [flow limits](@/api/flow/#limits-and-errors) for shared ID, nesting, and execution limits.

## React

### JevDevtools

The React component that adds the inspector drawer to your app. Use it to view requests and flow runs captured by your server adapter.

#### Signature

```ts
JevDevtools(props: JevDevtoolsProps): ReactElement | null
```

**Import:** `jev-devtools`. Render once in your React app. It returns nothing during SSR or while disabled; once enabled and mounted it loads the connected drawer.

#### Inputs

| Input prop                                | Default             | Meaning                                                                                              |
| ----------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `enabled?: boolean`                       | `false`             | Opt in to connecting and showing the inspector.                                                      |
| `endpoint?: string`                       | `/api/jev-devtools` | Same-origin inspector path; match the server.                                                        |
| `defaultOpen?: boolean`                   | `true`              | Open the drawer on its initial mount.                                                                |
| `redactAdditionalSensitiveData?: boolean` | `true`              | **0.5.0.** Mask supported personal fields in the display. Captured/streamed values remain unchanged. |

Unmounting or disabling closes its subscription. Closing the drawer alone does not stop capture. [React setup](@/api/react/) explains mounting and styling.

#### Returns

| Value / member | Type                    | Description                                                            |
| -------------- | ----------------------- | ---------------------------------------------------------------------- |
| Return         | `React element or null` | Nothing during SSR/disabled state; the mounted inspector when enabled. |

#### Example

```tsx api=core
import { JevDevtools } from "jev-devtools";

<JevDevtools enabled={import.meta.env.DEV} />;
```

<!-- Preserve the former stylesheet deep link beside the component styling guidance. -->

<a id="styles-css"></a>

#### How it works

The component enables the inspector only in Vite development builds through `import.meta.env.DEV`. Mounting it once gives the application one drawer and one connection.

The drawer injects its own stylesheet into its Shadow DOM; no CSS import is needed.

## Server adapter

Import factories from `jev-devtools/server`. All server adapter and recorder runtime code belongs on Node.

### createJevDevtools

Creates the server adapter that connects SDK request capture to the browser inspector. Share one instance between your clients and inspector routes.

#### Signature

```ts
createJevDevtools(options: JevDevtoolsServerOptions): Adapter
```

Each call creates independent in-memory histories. Use [`getJevDevtools()`](#getjevdevtools) when modules need to reuse an adapter by key.

#### Inputs

| Input                                                           | Default             | Meaning                                                       |
| --------------------------------------------------------------- | ------------------- | ------------------------------------------------------------- |
| `origin: string`                                                | Required            | Exact browser origin, including port.                         |
| `enabled?: boolean`                                             | `false`             | Enable recording and HTTP endpoints.                          |
| `endpoint?: string`                                             | `/api/jev-devtools` | Absolute path without query or fragment.                      |
| `limit?: number`                                                | `50`                | Global trace retention; clamped to 1–200.                     |
| `redact?: (path: string[], value: unknown) => unknown`          | None                | Transform the captured copy before storage/delivery.          |
| `authorize?: (request: Request) => boolean \| Promise<boolean>` | None                | Access check; required for enabled non-loopback origins.      |
| `getSession?: (request: Request) => string \| Promise<string>`  | `"local"`           | Trusted recording scope, nonempty and at most 200 characters. |

Invalid origin or endpoint configuration throws. Enabling a non-loopback origin without `authorize` also throws. See [Privacy & access](@/guides/privacy/) for authentication, session scopes, and redaction.

#### Returns

| Value / member | Type      | Description                                                                        |
| -------------- | --------- | ---------------------------------------------------------------------------------- |
| Return         | `Adapter` | Independent adapter with client, routing, session, observer, and disposal methods. |

#### Example

```ts api=core
import { createJevDevtools } from "jev-devtools/server";
const inspector = createJevDevtools({
  enabled: true,
  origin: "http://localhost:3000",
});
```

#### How it works

The example enables capture and binds inspector access to the browser origin `http://localhost:3000`. Keep this adapter instance shared between the HTTP routes and instrumented clients.

### getJevDevtools

Gets or creates a server adapter under a stable key. Use it to preserve the same recorder and history across module reloads in one Node process.

#### Signature

```ts
getJevDevtools(key: string, createOptions: () => JevDevtoolsServerOptions): Adapter
```

#### Inputs

| Parameter / option | Type                             |
| ------------------ | -------------------------------- |
| `key`              | `string`                         |
| `createOptions`    | `() => JevDevtoolsServerOptions` |

Use a nonblank, app-specific key and a synchronous options factory. The first call creates an adapter. Later calls with the same key in the same Node realm return that adapter without calling the factory again.

The first options remain in effect until disposal or process restart. Empty keys throw. Separate processes have separate histories. See [Next.js setup](@/guides/nextjs/) for sharing an adapter across module reloads.

#### Returns

| Value / member | Type      | Description                                               |
| -------------- | --------- | --------------------------------------------------------- |
| Return         | `Adapter` | Existing adapter for the key, or a newly created adapter. |

#### Example

```ts api=core
import { getJevDevtools } from "jev-devtools/server";
const inspector = getJevDevtools("my-app", () => ({
  enabled: true,
  origin: "http://localhost:3000",
}));
```

#### How it works

The stable `"my-app"` key reuses the adapter during module reloads. The callback supplies configuration only when an adapter for that key does not already exist.

### adapter.createClient

Creates a TypeSafe SDK client with request recording configured for this adapter. Use it for the calls you want to inspect.

#### Signature

```ts
inspector.createClient(options: SDKClientOptions, metadata?: ClientMetadata): TypeSafeClient
```

#### Inputs

| Parameter / option | Type               |
| ------------------ | ------------------ |
| `options`          | `SDKClientOptions` |
| `metadata?`        | `ClientMetadata`   |

Pass the TypeSafe SDK's constructor options, including a server-side key or custom `fetch`. Optional metadata defaults to `label: "Jev request"` and `source: "live"`.

When enabled, the adapter records `systemOne` calls through the returned client. When disabled, it returns an ordinary SDK client. Other SDK methods are not instrumented. `source: "sample"` only labels a capture: the client's transport still determines whether a call reaches the inference service.

#### Returns

| Value / member | Type             | Description                                           |
| -------------- | ---------------- | ----------------------------------------------------- |
| Return         | `TypeSafeClient` | SDK client; instrumented when the adapter is enabled. |

#### Example

```ts api=server
const client = inspector.createClient(
  { apiKey: process.env.TYPESAFE_API_KEY },
  { label: "Support", source: "live" },
);
```

#### How it works

The first argument configures the SDK with a server-side key. The second adds a human-readable capture label and marks the capture as live; it does not change the SDK request behavior.

### adapter.handle

Serves the inspector’s HTTP endpoints from a Web Request. Use it when your framework exposes the request’s actual public URL.

#### Signature

```ts
inspector.handle(request: Request): Promise<Response>
```

#### Inputs

| Parameter / option | Type      |
| ------------------ | --------- |
| `request`          | `Request` |

Forward the base inspector path and all its subpaths to this handler. It returns configuration JSON, an event stream, a clear response, or an HTTP error.

Disabled adapters and unmatched paths return 404. Origin or authorization failures return 403. Errors thrown by authorization or session callbacks can reject the promise, so let your framework handle them.

A Web Request does not expose the socket address. Bind the server to loopback or configure authorization.

#### Returns

| Value / member | Type                | Description                                                  |
| -------------- | ------------------- | ------------------------------------------------------------ |
| Return         | `Promise<Response>` | Resolves to an HTTP response; includes HTTP error responses. |

#### Example

```ts api=server
const response = await inspector.handle(request);
```

#### How it works

The application passes its incoming Web Request to the adapter and awaits a Web Response. Return that response from your framework’s inspector route.

### adapter.handleNodeRoute

Serves inspector endpoints in Node frameworks that may expose internal request URLs. It validates the Host header before routing the request.

#### Signature

```ts
inspector.handleNodeRoute(request: Request): Promise<Response>
```

#### Inputs

| Parameter / option | Type      |
| ------------------ | --------- |
| `request`          | `Request` |

Pass the framework's Web Request with its actual `Host` header. The handler checks Host against the configured origin's host and port, then normalizes the request URL and delegates to `handle()`.

Forwarded host headers are not trusted. The response and error behavior otherwise follows [`handle()`](#adapter-handle), including its loopback-binding or authorization requirement. See the [Next.js route example](@/guides/nextjs/#expose-the-optional-catch-all-route).

#### Returns

| Value / member | Type                | Description                                           |
| -------------- | ------------------- | ----------------------------------------------------- |
| Return         | `Promise<Response>` | Response after Host validation and URL normalization. |

#### Example

```ts api=server
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = GET;
```

#### How it works

The route exposes the same handler for GET and DELETE. The adapter checks Host before serving configuration, event streams, or a clear request.

### adapter.middleware

Connects the inspector endpoints to an Express or Connect-style server. Requests outside the inspector path continue to your application.

#### Signature

```ts
inspector.middleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void>
```

#### Inputs

| Parameter / option | Type              |
| ------------------ | ----------------- |
| `req`              | `IncomingMessage` |
| `res`              | `ServerResponse`  |
| `next`             | `() => void`      |

Mount at the application root so the inspector path reaches the middleware unchanged. It handles matching requests and calls `next()` for unrelated paths. The returned promise completes when handling or delegation finishes.

Without `authorize`, enabled endpoints accept only loopback socket connections. Route errors produce HTTP 500 when possible, or destroy a response that has already started.

#### Returns

| Value / member | Type            | Description                                                            |
| -------------- | --------------- | ---------------------------------------------------------------------- |
| Return         | `Promise<void>` | Completes after response handling or calls next for an unrelated path. |

#### Example

```ts api=server
app.use(inspector.middleware); // app is your Express/Connect server
```

#### How it works

Mounting the middleware on `app` preserves the full inspector path. Requests outside that path continue through `next()` to the application’s other handlers.

### adapter.run

Runs application work within the recording session selected for an incoming request. Use it when separate users or requests need separate inspection histories.

#### Signature

```ts
inspector.run<T>(request: Request, callback: () => T | Promise<T>): Promise<T>
```

#### Inputs

| Parameter / option | Type                    |
| ------------------ | ----------------------- |
| `request`          | `Request`               |
| `callback`         | `() => T \| Promise<T>` |

Pass the application's authenticated request and a callback containing the work to record. The adapter calls `getSession(request)` and keeps that recording scope active for the callback's asynchronous work.

The promise resolves to the callback's value and propagates failures. This wrapper is needed for custom session scopes. It does not authorize the application action.

#### Returns

| Value / member | Type         | Description                                                               |
| -------------- | ------------ | ------------------------------------------------------------------------- |
| Return         | `Promise<T>` | Resolves to the application callback’s result; callback errors propagate. |

#### Example

```ts api=server
return inspector.run(request, () => client.systemOne(input));
```

#### How it works

The request determines the recording session. The callback performs the SDK call inside that session, and its result becomes the resolved value of `inspector.run()`.

### adapter.dispose

Shuts down an adapter, stopping capture and closing its event streams. Call it when the server shuts down or you deliberately replace the adapter.

#### Signature

```ts
inspector.dispose(): void
```

#### Inputs

No parameters.

Disposal disables capture and inspector endpoints and closes active streams. A shared adapter releases its key, allowing a later `getJevDevtools()` call to create a new instance. Dispose at shutdown or deliberate reinitialization, not after each request.

#### Returns

| Value / member | Type   | Description          |
| -------------- | ------ | -------------------- |
| Return         | `void` | No data is returned. |

#### Example

```ts api=server
inspector.dispose();
```

#### How it works

This shutdown call disables recording and closes streams owned by the adapter. A shared adapter also releases its registry key.

## Flow definitions and steps

Import `defineJevFlow` from `jev-devtools/flow` on Node. Builder methods describe work synchronously; they do not execute it. The complete examples below pair each definition with an async function that awaits its `run()` and reads the result. Call that function from Node to execute the example. Start with [Flows from scratch](@/guides/flow-basics/) for a greeting task. The entries below provide complete examples for the other operations.

### defineJevFlow

Defines a reusable sequence of tasks, Jev requests, and decisions. The callback builds the recipe synchronously; calling the returned flow’s `run()` executes it.

#### Signature

```ts
defineJevFlow<Input>(name: string, build: (flow: FlowBuilder<Input>) => Expression<FlowOutcome>): { definition: FlowDefinition; run: /* see below */ }
```

#### Inputs

| Parameter / option | Type                                                        |
| ------------------ | ----------------------------------------------------------- |
| `name`             | `string`                                                    |
| `build`            | `(flow: FlowBuilder<Input>) => FlowExpression<FlowOutcome>` |

Use a nonblank name of at most 100 characters. The synchronous `build` callback must return a terminal `output()` or `branch()`.

The returned `{ definition, run }` can be reused for multiple executions. Building it sends no SDK requests. Invalid IDs, scopes, nesting, or terminal structure throw during definition.

#### Returns

| Value / member | Type                                                                                  | Description           |
| -------------- | ------------------------------------------------------------------------------------- | --------------------- |
| definition     | `FlowDefinition`                                                                      | Static graph.         |
| run            | `(input: Input, options: FlowRunOptions) => Promise<FlowOutcome & { runId: string }>` | Executes a fresh run. |

#### Example

<!-- example: first-flow.ts -->

#### How it works

`greet` records the input reference and terminal output synchronously. Calling `tryGreeting()` awaits `greet.run({ name: "Ada" }, ...)` and reads outcome `"greeted"` and value `"Ada"`. The no-inference client needs no key because this definition has no Jev steps.

### flow.run

Executes a defined flow with concrete input and a client. Await it to receive the selected outcome and resolved output value.

#### Signature

```ts
program.run(input: Input, options: FlowRunOptions): Promise<{ runId: string; outcome: string; value?: unknown }>
```

**Inputs:** the typed input promised by `defineJevFlow` and these options:

#### Inputs

| Option      | Meaning                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `client`    | Required client with SDK-compatible `systemOne`, even for task-only flows. |
| `devtools?` | Optional `FlowObserver`, usually your server adapter.                      |
| `signal?`   | Optional `AbortSignal` to cancel the run.                                  |

Each execution gets a fresh `runId` and resolves to the selected outcome and optional value. The public `value` type is `unknown`, so validate or narrow it before use. The result is not an inferred discriminated union.

Errors and cancellation reject the promise. Tasks must cooperate with their signal. Execution has no rollback or automatic retry.

#### Returns

| Value / member | Type                                       | Description                                                 |
| -------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Return         | `Promise<FlowOutcome & { runId: string }>` | Await to receive the fields below.                          |
| runId          | `string`                                   | Unique execution ID.                                        |
| outcome        | `string`                                   | Selected terminal outcome name.                             |
| value?         | `unknown`                                  | Resolved output value; narrow its type in application code. |

#### Example

```ts
const result = await program.run(
  { name: "Ada" },
  { client, devtools: inspector },
);
console.log(result.outcome, result.value);
```

#### How it works

The input object supplies Ada’s name. `client` enables SDK steps and `devtools: inspector` enables recording. Awaiting the promise yields the chosen outcome and resolved output value.

### flow.definition

The static graph describing a flow’s steps and connections. Read it to inspect the recipe or pair it with a captured run when creating a fixture.

#### Signature

```ts
program.definition: FlowDefinition
```

#### Inputs

No parameters.

Treat this graph as read-only. It contains the version, ID, name, and nodes. Reading it does not execute the flow, and mutating it is not a supported way to change execution. Pair it with a captured `FlowRun` when building a fixture.

#### Returns

| Value / member | Type             | Description                                                    |
| -------------- | ---------------- | -------------------------------------------------------------- |
| Property value | `FlowDefinition` | Version, identity, name, and graph nodes. No work is executed. |

#### Example

```ts
console.log(program.definition.name, program.definition.nodes.length);
```

#### How it works

Reading `name` and the node count inspects the recipe’s static structure. It does not execute tasks or send requests.

### flow.input

A reference to the data supplied to the current flow, map item, or loop iteration. Use it to pass input into steps or select individual fields.

#### Signature

```ts
flow.input: FlowExpression<Input>
```

#### Inputs

No parameters.

During definition, this property is a reference to the input. Its resolved shape depends on the builder:

- Ordinary flow, path, or lane: `Input`.
- Map item: `{ item, index, context }`.
- Loop iteration: `{ state, index, context }`.

Select a field with `get()`, or pass the whole reference to a task, request, or output.

#### Returns

| Value / member | Type                    | Description                                              |
| -------------- | ----------------------- | -------------------------------------------------------- |
| Property value | `FlowExpression<Input>` | Reference to the current flow, item, or iteration input. |

Inside a synchronous `defineJevFlow()` callback; these references resolve when you await the flow’s `run()`. See the [complete definition and execution](@/guides/flow-basics/#input-read-the-data-you-were-given).

#### Example

```ts api=expressions
const name = flow.input.get("name");
```

#### How it works

The `get("name")` call selects a typed field reference. Pass that reference to a task or output to resolve it during execution.

### flow.task

Adds a step that runs your application code, such as fetching data or transforming a value. Its callback receives resolved inputs and can return a value or a promise.

**0.5.1:** Task inputs reject own symbol keys, including nested objects and arrays. Literal templates fail during definition; referenced values fail when resolved, before the callback runs.

#### Signature

```ts
flow.task<I, O>(id: string, task: FlowTask<I, O>, display?: FlowDisplay): Expression<Awaited<O>>
```

#### Inputs

| Parameter / option | Type                                                            |
| ------------------ | --------------------------------------------------------------- |
| `id`               | `string`                                                        |
| `task.input`       | `I`                                                             |
| `task.run`         | `(input: Resolved<I>, context: TaskContext) => O \| Promise<O>` |
| `task.timeoutMs?`  | `number`                                                        |
| `display?`         | `FlowDisplay`                                                   |

The runner resolves nested references in `input` before calling `run(resolvedInput, context)`. The callback may return a value or a promise. Its `context` contains `signal`, `runId`, `stepId`, and `executionId`.

If provided, `timeoutMs` must be an integer from 1 to 2,147,483,647. A failure rejects the flow. A timeout stops waiting and signals cancellation, but cannot stop code that ignores the signal or undo its side effects. See the [greeting task example](@/guides/flow-basics/#task-run-your-own-code).

#### Returns

| Value / member | Type                         | Description                                          |
| -------------- | ---------------------------- | ---------------------------------------------------- |
| Builder return | `FlowExpression<Awaited<O>>` | Reference to the callback result.                    |
| Resolved value | `Awaited<O>`                 | Actual callback result after awaiting it, if needed. |

#### Example

<!-- example: flow-task.ts -->

#### How it works

`get("name")` selects the input field. The task resolves it before calling `run`, so `name` inside the callback is an ordinary string. The template literal constructs the greeting. `output("greeted", message)` resolves that task result and makes it the final flow value. Calling `tryTask()` awaits `greeting.run({ name: "Ada" }, ...)`, then reads outcome `"greeted"` and value `"Hello, Ada!"` from the finished run.

### flow.jev

Adds a Jev request step and provides references to its future answers. The request is sent when the flow runs, so later steps can use those answers.

#### Signature

```ts
flow.jev(id, request, display?): AnswerRefs
flow.jev(id, { input, request: (resolvedInput) => sdkRequest }, display?): AnswerRefs
```

#### Inputs

| Parameter / option | Type                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| `id`               | `string`                                                                 |
| `request`          | `SDK request with expression-capable state, or FlowRequestFactory<I, Q>` |
| `display?`         | `FlowDisplay`                                                            |

Choose one request form:

- **SDK request:** pass a regular request whose `state` may contain nested flow references. The runner resolves state before sending it.
- **Request factory:** pass `{ input, request }`. The runner resolves `input`, then calls the synchronous `request` callback to construct the SDK request. Use a preceding task for asynchronous preparation.

The request's `questions` define the named SDK question types. Other SDK request options pass through.

Both forms return `.answer(name)` field references and `.answers` for the full answer object, typed from the questions. Use `.answers` when a factory generates question names dynamically.

SDK failures reject the run. A request factory must return synchronously, not return a promise. Complete examples of both forms follow.

#### Returns

| Value / member         | Type                                                  | Description                                             |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| answer(name)           | `Object of typed answer-field expressions`            | Selects one question’s fields, such as choice or noul.  |
| answers                | `FlowExpression<{ [K in keyof Q]: ResultFor<Q[K]> }>` | Reference to all answers.                               |
| Resolved answer fields | `SDK ResultFor<Q[K]> fields`                          | Actual field values for the selected SDK question type. |

**Define now, request later.** `flow.jev()` returns future-answer references, not a promise. `await classify.run(...)` executes the request and waits for its answer. Call `tryClassify(jev)` with the client from the [server setup](@/api/server/).

#### Example

<!-- example: flow-jev.ts -->

#### How it works

`state: flow.input` sends the message as context. The SDK's `choice()` helper defines the allowed teams and their descriptions. `answer("team").choice` selects the model's chosen label, and `output()` returns it. `tryClassify()` supplies a concrete message to `await classify.run(...)`. After the request finishes, `result.outcome` is `"classified"` and `result.value` contains the chosen team. The selected team is not predetermined.

#### Request factory example

Use the factory form when a question needs a resolved input value. Call `tryCustomQuestion(jev)` with the same [server client](@/api/server/). This example makes a live request and requires a server-side API key.

<!-- example: flow-factory.ts -->

The factory receives the resolved message and includes it in the question. `result.answers` keeps the complete answer object, which `flow.output()` returns as the run's value. The factory returns synchronously; use a preceding task for asynchronous preparation. `await customQuestion.run(...)` executes the request before `tryCustomQuestion()` reads the result.

### request.answer

Selects one named question’s answer fields as flow references. Use it when a later step needs a specific field, such as a chosen label or numeric result.

#### Signature

```ts
result.answer<Name extends keyof Questions>(name: Name): AnswerFieldReferences
```

#### Inputs

| Parameter / option | Type                                    |
| ------------------ | --------------------------------------- |
| `name`             | `A key of the request’s Questions type` |

Use the name of a question in the Jev step. The returned object contains typed field references such as `.choice`, `.noul`, `.score`, and `.box`, plus other fields supported by that question type.

Selecting an answer does not send another request. Unknown static question names fail during definition. Questions generated by a factory must exist when executed. A Noul represents the probability that a statement is true, not a confidence score.

#### Returns

| Value / member | Type                              | Description                                                         |
| -------------- | --------------------------------- | ------------------------------------------------------------------- |
| Return         | `Object of FlowExpression fields` | Each result field is an expression with its SDK-defined value type. |

Inside a synchronous `defineJevFlow()` callback; these references resolve when you await the flow’s `run()`. See the [complete definition and execution](#flow-jev).

#### Example

```ts
const team = result.answer("team").choice; // expression for a Choice result
```

#### How it works

`answer("team")` selects the named question and `.choice` selects its chosen label. The assignment stores a reference, not an immediate model response.

### request.answers

A reference to the complete answer object from a Jev step. Use it to pass all answers onward, including questions named dynamically by a request factory.

#### Signature

```ts
result.answers: Expression<{ [Name in keyof Questions]: ResultFor<Questions[Name]> }>
```

#### Inputs

No parameters.

During definition, this property is a reference to the full SDK answer object. Pass it to a task or output to use the resolved answers. It is useful when a request factory generates question names at runtime.

#### Returns

| Value / member | Type                                                  | Description                              |
| -------------- | ----------------------------------------------------- | ---------------------------------------- |
| Property value | `FlowExpression<{ [K in keyof Q]: ResultFor<Q[K]> }>` | Reference to the complete answer object. |

Inside a synchronous `defineJevFlow()` callback; these references resolve when you await the flow’s `run()`. See the [complete definition and execution](#flow-jev).

#### Example

```ts api=parallel
return flow.output("answers", result.answers);
```

#### How it works

Passing the full answer reference to `output()` returns every answer and its SDK metadata in the flow value, rather than extracting one field.

### flow.if

Chooses between two paths and produces a value for subsequent steps. Use it when the paths should rejoin and the flow should continue.

#### Signature

```ts
flow.if<A, B>(id, { when, then, else }, display?): Expression<A | B>
```

#### Inputs

| Parameter / option | Type                                              |
| ------------------ | ------------------------------------------------- |
| `id`               | `string`                                          |
| `paths.when`       | `FlowExpression<boolean>`                         |
| `paths.then`       | `(path: FlowBuilder<Input>) => FlowExpression<A>` |
| `paths.else`       | `(path: FlowBuilder<Input>) => FlowExpression<B>` |
| `display?`         | `FlowDisplay`                                     |

`when` must be a Boolean expression. Both path callbacks build synchronously using their supplied path builder, but only the selected path executes.

Each callback must return a value reference. The selected value becomes available to later shared steps. Do not return terminal outputs here: use [`branch()`](#flow-branch) when the decision should end the flow.

#### Returns

| Value / member | Type                     | Description                                             |
| -------------- | ------------------------ | ------------------------------------------------------- |
| Builder return | `FlowExpression<A \| B>` | Reference to the selected path’s result.                |
| Resolved value | `A \| B`                 | Value from the executed path, available to later steps. |

#### Example

<!-- example: flow-if.ts -->

#### How it works

`.eq(true)` turns the `express` reference into a condition. Each path uses a task to supply a number. After the paths join, the shared `describe` task receives the selected number and formats the delivery message. This shared continuation is why the example uses `if()` rather than `branch()`. Calling `tryDelivery()` awaits `delivery.run({ express: true }, ...)`, then reads outcome `"estimated"` and value `"Delivery in 1 day(s)"` from the finished run.

### flow.branch

Chooses between two paths that each finish the flow with an outcome. Use it when the decision determines how the flow ends.

#### Signature

```ts
flow.branch(id, { when, then, else }, display?): Expression<FlowOutcome>
```

#### Inputs

| Parameter / option       | Type                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `id`                     | `string`                                                    |
| `paths.when`             | `FlowExpression<boolean>`                                   |
| `paths.then, paths.else` | `(path: FlowBuilder<Input>) => FlowExpression<FlowOutcome>` |
| `display?`               | `FlowDisplay`                                               |

`when` must be a Boolean expression. Each path callback must return `output()` or another terminal `branch()`.

Return the branch from the containing flow or path. No steps may follow this terminal decision. Use [`if()`](#flow-if) when both paths should rejoin and continue.

#### Returns

| Value / member   | Type                          | Description                                    |
| ---------------- | ----------------------------- | ---------------------------------------------- |
| Builder return   | `FlowExpression<FlowOutcome>` | Terminal result reference.                     |
| Resolved outcome | `string`                      | Name returned by the selected terminal path.   |
| Resolved value?  | `unknown`                     | Optional resolved value returned by that path. |

#### Example

<!-- example: flow-branch.ts -->

#### How it works

`.eq(true)` checks `needsReview`. The selected path calls `output()` with its own outcome name and message. Returning the branch ends the flow; there is no shared step afterward. Use [`if()`](@/api/reference/#flow-if) when the paths should rejoin. Calling `tryBranch()` awaits `route.run({ needsReview: true }, ...)`, then reads outcome `"manual-review"` and value `"A person should review this"` from the finished run.

### flow.parallel

Defines independent lanes of work that run concurrently and then join. Later steps can read each lane’s result by its name.

#### Signature

```ts
flow.parallel(id, lanes: { [name: string]: (lane) => Expression<unknown> }, display?): JoinedReferences
```

#### Inputs

| Parameter / option | Type                                                       |
| ------------------ | ---------------------------------------------------------- |
| `id`               | `string`                                                   |
| `lanes`            | `Named builder callbacks, each returning a FlowExpression` |
| `display?`         | `FlowDisplay`                                              |

Supply a nonempty object of named lane callbacks. Lane names follow the step ID naming rules, and each callback returns a value expression. The returned object preserves the lane names and their expression types.

Lanes execute concurrently, with sequential steps inside each lane. A lane cannot read a sibling's private intermediate results. If a lane fails, the runner signals cancellation to sibling work. That work must cooperate with cancellation.

#### Returns

| Value / member       | Type                        | Description                                            |
| -------------------- | --------------------------- | ------------------------------------------------------ |
| Builder return       | `Object with the lane keys` | Each member preserves its lane’s expression type.      |
| Resolved lane values | `Each lane’s result type`   | Available through the named references after the join. |

#### Example

<!-- example: flow-parallel.ts -->

#### How it works

Both lanes read the same input price through their own builders. `full-price` returns it unchanged, while `sale-price` multiplies it by `0.8`. The flow joins the lanes before resolving both references in the output object. A lane cannot read another lane's private intermediate steps. Calling `tryParallel()` awaits `totals.run({ price: 100 }, ...)`, then reads outcome `"priced"` and value `{ regular: 100, sale: 80 }` from the finished run.

### flow.map

Runs the same steps for every item in an array and collects their results in input order. Use it for repeated work with a bounded number of concurrent items.

#### Signature

```ts
flow.map<Item, Context, Output>(id, { items, input, maxItems, concurrency? }, build, display?): Expression<Output[]>
```

#### Inputs

| Parameter / option                              | Type                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`                                            | `string`                                                                                                             |
| `options.items`                                 | `readonly Item[] \| FlowExpression<readonly Item[]>`                                                                 |
| `options.input`                                 | `Context`                                                                                                            |
| `options.maxItems`                              | `number`                                                                                                             |
| `options.concurrency?`                          | `number`                                                                                                             |
| `build` (whole-array reference or scalar array) | `(item: FlowBuilder<{ item: Item; index: number; context: Resolved<Context> }>) => FlowExpression<Output>`           |
| `build` (literal/template)                      | `(item: FlowBuilder<{ item: Resolved<Item>; index: number; context: Resolved<Context> }>) => FlowExpression<Output>` |
| `display?`                                      | `FlowDisplay`                                                                                                        |

`items` accepts a literal array, a whole-array reference, or an array containing nested reference templates. `input` supplies shared context to each item program. Set `maxItems` to an integer from 1–64. `concurrency` is an integer from 1–16 and defaults to 4.

The item builder receives `{ item, index, context }` through `item.input` and must return a value reference. Whole-array references and scalar arrays preserve `Item`, including generic payloads and branded primitives. Nested templates resolve each item to `Resolved<Item>`. For example, with `items: [flow.input.get("count")]`, the item reference has type `FlowExpression<number>` and a task receiving it gets a number.

Results preserve the original item order, even when items finish out of order. Empty input resolves to an empty array. Exceeding `maxItems` rejects the run instead of truncating the input.

Pass outer data through explicit context. The item program cannot contain another map or a loop.

#### Returns

| Value / member | Type                       | Description                                   |
| -------------- | -------------------------- | --------------------------------------------- |
| Builder return | `FlowExpression<Output[]>` | Reference to the result array.                |
| Resolved value | `Output[]`                 | One result per item, in original input order. |

#### Example

<!-- example: flow-map.ts -->

#### How it works

`items` selects the input array, and `input` supplies a multiplier shared by all items. Within each item program, `get("item")` selects its number and `get("context").get("multiplier")` selects the multiplier. The task resolves both before multiplying. Up to two item programs run at once, but the result array preserves the original item order. Explicit context keeps the item program independent of outer step references. Calling `tryMap()` awaits `doubleEach.run({ numbers: [2, 4, 6] }, ...)`, then reads outcome `"doubled"` and value `[4, 8, 12]` from the finished run.

### flow.loop

Repeats a sequence of steps while a condition is true, carrying updated state between iterations. A required iteration limit bounds how long it can run.

#### Signature

```ts
// Whole-state reference or scalar: preserves State, including generic payloads.
flow.loop<State, Context>(id, { initial, input, while, maxIterations }, build, display?): Expression<State>
// Object/array template initial state: resolves nested references.
flow.loop<State, Context>(id, { initial, input, while, maxIterations }, build, display?): Expression<Resolved<State>>
```

#### Inputs

| Parameter / option                                | Type                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                              | `string`                                                                                                                             |
| `options.initial`                                 | `State \| FlowExpression<State>`                                                                                                     |
| `options.input`                                   | `Context`                                                                                                                            |
| `options.while` (whole-state reference or scalar) | `(state: FlowExpression<State>) => FlowExpression<boolean>`                                                                          |
| `options.while` (literal/template)                | `(state: FlowExpression<Resolved<State>>) => FlowExpression<boolean>`                                                                |
| `options.maxIterations`                           | `number`                                                                                                                             |
| `build` (whole-state reference or scalar)         | `(iteration: FlowBuilder<{ state: State; index: number; context: Resolved<Context> }>) => FlowExpression<State>`                     |
| `build` (literal/template)                        | `(iteration: FlowBuilder<{ state: Resolved<State>; index: number; context: Resolved<Context> }>) => FlowExpression<Resolved<State>>` |
| `display?`                                        | `FlowDisplay`                                                                                                                        |

`initial` supplies JSON state as a literal, whole-state reference, or nested object/array template. `input` supplies explicit shared context. The synchronous `while(state)` callback builds a Boolean expression from the state. Set `maxIterations` to an integer from 1–64.

The iteration builder receives `{ state, index, context }` through its input. It must return the next state reference with the shape determined by `initial`:

- Whole-state references and scalar values preserve `State`, including generic payloads.
- Object/array templates resolve nested references to `Resolved<State>`. Branded primitives keep their types.

For `initial: { count: flow.input.get("count") }`, both the condition and iteration select `count` as `FlowExpression<number>`. A task receiving that state works with an ordinary number at `state.count`.

The runner tests the condition before each iteration. When it becomes false, the loop resolves to the current state. If it starts false, the result is the initial state. If it remains true at the iteration limit, the run rejects with `FlowLoopLimitError`.

A loop may contain a map, but cannot contain another loop. Direct `output()` and `branch()` calls in map bodies, loop bodies, and `if()` paths throw definition errors that name the containing step and operation. Return a value expression instead. Parallel lanes inside these bodies still support terminal outputs and branches as lane values.

#### Returns

| Value / member                                   | Type                                                                        | Description                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Builder return (whole-state reference or scalar) | `FlowExpression<State>`                                                     | Reference to the final state, preserving the initial payload type.          |
| Builder return (literal/template)                | `FlowExpression<Resolved<State>>`                                           | Reference to the final resolved state.                                      |
| Resolved value                                   | `State` for whole-state references/scalars; `Resolved<State>` for templates | State when the condition becomes false; initial state if no iterations run. |

#### Example

<!-- example: flow-loop.ts -->

#### How it works

`initial` starts the state at zero. `while` uses `.lt(3)` to build the stopping condition. The `increment` task reads the current state and adds one, producing `0 → 1 → 2 → 3`. Before a fourth iteration, the condition is false, so the loop returns `3`. If the initial condition is false, no iterations run and the initial state is returned. Calling `tryLoop()` awaits `countToThree.run({}, ...)`, then reads outcome `"counted"` and value `3` from the finished run.

### flow.output

Defines the end of a flow or branch with a named outcome and optional result data. References in that data resolve when the flow executes.

#### Signature

```ts
flow.output(name: string, value?: unknown, display?: FlowDisplay): Expression<FlowOutcome>
```

#### Inputs

| Parameter / option | Type          |
| ------------------ | ------------- |
| `name`             | `string`      |
| `value?`           | `unknown`     |
| `display?`         | `FlowDisplay` |

The outcome `name` is also a node ID, so it must be unique in the definition. The optional `value` can contain literals and nested references, which resolve during execution. `display` supplies static inspection metadata.

Return this terminal expression from the flow or branch path. No steps may follow it. Naming an outcome does not perform a business action.

#### Returns

| Value / member   | Type                          | Description                                         |
| ---------------- | ----------------------------- | --------------------------------------------------- |
| Builder return   | `FlowExpression<FlowOutcome>` | Terminal result reference.                          |
| Resolved outcome | `string`                      | The supplied name.                                  |
| Resolved value?  | `unknown`                     | The supplied value with nested references resolved. |

Inside a synchronous `defineJevFlow()` callback; these references resolve when you await the flow’s `run()`. See the [complete definition and execution](@/guides/flow-basics/#output-finish-with-a-result).

#### Example

```ts api=parallel
return flow.output("done", { message, count });
```

#### How it works

The object groups two previously defined references, `message` and `count`. Both are resolved into ordinary values under outcome `"done"`; naming the outcome performs no external action.

## Expressions and conditions

The short expression snippets below belong inside a synchronous `defineJevFlow()` callback. They build references; use them in a step or terminal `output()`, then await the flow’s `run()` to get actual data. See the [complete expression and execution example](@/api/flow/#collections-and-loops).

All these runtime exports come from `jev-devtools/flow`. References must belong to the same flow and be available in the current execution scope. See [expression scopes](@/api/expressions/#respect-scope). **0.5.2:** construction enforces complete [expression depth and expansion limits](@/api/expressions/#expression-limits), including reused children.

### FlowExpression

A typed reference to a value available during flow execution. Builders create these references so later steps can select fields, compare values, and use earlier results.

#### Signature

```ts
new FlowExpression<T>(ast, owner?: object)
expression.ast: Ast
```

#### Inputs

| Parameter / option | Type                                              |
| ------------------ | ------------------------------------------------- |
| `ast`              | `Expression AST; see supporting structural types` |
| `owner?`           | `object; ownership is managed by the builder`     |

The constructor accepts an expression tree (`input`, `ref`, `get`, `literal`, or supported operator nodes) and an optional ownership token. It freezes the tree. The resulting `ast` describes how to obtain a value during execution; it does not contain the resolved value.

Ordinary consumers should obtain owned expressions from builders. Hand-constructed expressions are generally unowned and cannot be inserted into a flow; the optional owner is not an application integration mechanism. The structural AST is visible in installed declarations, but not exported as a named public `Ast` type.

#### Returns

| Value / member | Type                | Description                                                    |
| -------------- | ------------------- | -------------------------------------------------------------- |
| Return         | `FlowExpression<T>` | Immutable expression object.                                   |
| ast            | `Ast`               | Frozen expression structure, not a resolved application value. |

#### Example

```ts api=expressions
const message = flow.input.get("message"); // obtain an owned expression
```

#### How it works

Use the builder’s owned input reference and select its message field. This avoids manually constructing an AST or ownership token.

### expression.get

Selects an own property from a referenced object or array. Chain calls to reach nested fields while preserving their types. Primitive properties, including string length and character indexes, are unsupported.

#### Signature

```ts
expression.get<
  K extends keyof T &
    keyof ExpressionFields<T> &
    (string | number)
>(
  this: FlowExpression<object>, key: K
): FlowExpression<T[K]>
```

#### Inputs

| Parameter / option           | Type                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `this` (expression receiver) | `FlowExpression<object>`                                   |
| `key`                        | `keyof T & keyof ExpressionFields<T> & (string \| number)` |

Choose an own object field, a numeric array index, or array `length`. `ExpressionFields<T>` retains object fields and filters arrays to indices and `length`, including tuple string indices such as `"0"`. Array methods such as `map`, `slice`, and `push` are rejected by TypeScript. For unions, the key must be supported by every member. The receiver is the expression before `.get()`, not an extra argument.

Missing, inherited, or `undefined` properties fail when execution reaches them. Ordinary array bounds, including numeric tuple indices, remain runtime checks. Optional fields retain `undefined` in their inferred type. This operation does not provide optional chaining.

For a generic field-selection helper, constrain its key with `K extends keyof T & Parameters<FlowExpression<T>["get"]>[0]` and return `FlowExpression<T[K]>`. A helper that accepts every `keyof T` can otherwise admit array methods. General structural object types cannot prove that a property is owned by an instance.

**0.5.1 type correction:** primitive receivers and unions that may contain primitives are rejected during type checking. Version 0.5.0 can accept these calls in TypeScript but rejects primitive property access at runtime. To compute a string's length, pass the string reference into a task and read `.length` inside its callback.

#### Returns

| Value / member | Type                   | Description                      |
| -------------- | ---------------------- | -------------------------------- |
| Return         | `FlowExpression<T[K]>` | Reference to the selected field. |

#### Example

<!-- example: expression-get.ts -->

#### How it works

`get("tags")` selects the input array. Its `get(0)` selects the first item, and `get("length")` selects its length. `get("message")` selects a string, so the task computes its length using the resolved `message` value. `firstIsNew` compares the first tag with `"new"`. Calling `tryFieldSelection()` runs the flow with `"abc"` and two tags, returning `{ firstTag: "new", tagCount: 2, messageLength: 3, firstIsNew: true }` as its value. All `.get()` calls construct references during definition; the runner reads their values during execution.

### expression.eq

Builds a condition that checks whether two scalar values are equal when the flow runs. Use it to compare labels, numbers, booleans, or null.

#### Signature

```ts
expression.eq(
  this: FlowExpression<string | number | boolean | null>,
  value: T | FlowExpression<T>
): FlowExpression<boolean>
```

#### Inputs

| Parameter / option           | Type                                                  |
| ---------------------------- | ----------------------------------------------------- |
| `this` (expression receiver) | `FlowExpression<string \| number \| boolean \| null>` |
| `value`                      | `T \| FlowExpression<T>`                              |

Pass a literal or compatible expression. The resolved operands must have matching scalar types: string, number, Boolean, or null. This method does not perform deep object equality.

TypeScript rejects object, array, `undefined`, and unknown receivers, including unions with unsupported members. Literal labels, branded scalars, and generic scalar helpers retain their operand types. Scalar unions remain supported, but the resolved operands must have matching types. JavaScript callers, non-finite numbers, and mismatched union values still require runtime validation.

It returns a Boolean expression that evaluates during the run. Invalid scalar comparisons reject execution.

#### Returns

| Value / member | Type                      | Description                                   |
| -------------- | ------------------------- | --------------------------------------------- |
| Return         | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean`                 | True or false when the flow evaluates it.     |

#### Example

```ts api=expressions
const condition = flow.input.get("count").eq(3);
```

#### How it works

The comparison checks whether the resolved count equals 3. Pass the resulting Boolean expression to `when` or another condition helper.

### expression.lt

Builds a condition that checks whether a numeric value is below a limit. Use it for thresholds and loop stopping rules.

#### Signature

```ts
expression.lt(value: number | Expression<number>): Expression<boolean>
```

#### Inputs

| Parameter / option | Type                               |
| ------------------ | ---------------------------------- |
| `value`            | `number \| FlowExpression<number>` |

Pass a number or compatible numeric expression. Both resolved operands must be finite numbers. Missing, nullable, or nonnumeric operands reject during execution.

The comparison is strictly less than. For an inclusive upper bound, use `not(value.gt(limit))` with valid numeric operands. There is no `lte()` method.

#### Returns

| Value / member | Type                      | Description                                   |
| -------------- | ------------------------- | --------------------------------------------- |
| Return         | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean`                 | True or false when the flow evaluates it.     |

#### Example

```ts api=expressions
const condition = flow.input.get("count").lt(3);
```

#### How it works

The comparison is true when the resolved count is below 3. It describes a condition now and evaluates it when the flow runs.

### expression.gt

Builds a condition that checks whether a numeric value is above a limit. The limit itself does not satisfy the condition.

#### Signature

```ts
expression.gt(value: number | Expression<number>): Expression<boolean>
```

#### Inputs

| Parameter / option | Type                               |
| ------------------ | ---------------------------------- |
| `value`            | `number \| FlowExpression<number>` |

Pass a number or compatible numeric expression. Both resolved operands must be finite numbers. Missing, nullable, or nonnumeric operands reject during execution.

The comparison is strictly greater than. For an inclusive upper bound, use `not(value.gt(limit))` with valid numeric operands. There is no `lte()` method.

#### Returns

| Value / member | Type                      | Description                                   |
| -------------- | ------------------------- | --------------------------------------------- |
| Return         | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean`                 | True or false when the flow evaluates it.     |

#### Example

```ts api=expressions
const condition = flow.input.get("count").gt(3);
```

#### How it works

The comparison is true when the resolved count is above 3. Both operands must resolve to finite numbers.

### expression.gte

Builds a condition that checks whether a numeric value meets or exceeds a limit. Use it when the boundary value should count.

#### Signature

```ts
expression.gte(value: number | Expression<number>): Expression<boolean>
```

#### Inputs

| Parameter / option | Type                               |
| ------------------ | ---------------------------------- |
| `value`            | `number \| FlowExpression<number>` |

Pass a number or compatible numeric expression. Both resolved operands must be finite numbers. Missing, nullable, or nonnumeric operands reject during execution.

The comparison includes equality. For an inclusive upper bound, use `not(value.gt(limit))` with valid numeric operands. There is no `lte()` method.

#### Returns

| Value / member | Type                      | Description                                   |
| -------------- | ------------------------- | --------------------------------------------- |
| Return         | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean`                 | True or false when the flow evaluates it.     |

#### Example

```ts api=expressions
const condition = flow.input.get("count").gte(3);
```

#### How it works

The comparison includes the boundary: a count of 3 satisfies it. It returns a condition reference for a later decision.

### all

Combines flow conditions into one condition that requires every check to pass. Use it when several requirements must hold together.

#### Signature

```ts
all(...conditions: Expression<boolean>[]): Expression<boolean>
```

#### Inputs

| Parameter / option | Type                        |
| ------------------ | --------------------------- |
| `...conditions`    | `FlowExpression<boolean>[]` |

Pass Boolean expressions belonging to the flow. The result resolves to true only when every condition is true. Supply at least one owned condition: a zero-operand expression has no flow owner and cannot be used in a definition.

Every operand is evaluated. Unlike JavaScript `&&`, an earlier false result does not prevent a missing-reference error in a later operand.

#### Returns

| Value / member | Type                      | Description                                   |
| -------------- | ------------------------- | --------------------------------------------- |
| Return         | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean`                 | True or false when the flow evaluates it.     |

#### Example

```ts api=expressions
const ready = all(
  flow.input.get("count").gte(1),
  flow.input.get("count").lt(10),
);
```

#### How it works

The two comparisons describe an inclusive lower bound of 1 and an exclusive upper bound of 10. `all()` combines them so both must hold.

### any

Combines flow conditions into one condition that passes when at least one check passes. Use it for alternative ways to satisfy a decision.

#### Signature

```ts
any(...conditions: Expression<boolean>[]): Expression<boolean>
```

#### Inputs

| Parameter / option | Type                        |
| ------------------ | --------------------------- |
| `...conditions`    | `FlowExpression<boolean>[]` |

Pass Boolean expressions belonging to the flow. The result resolves to true when at least one condition is true. Supply at least one owned condition: a zero-operand expression has no flow owner and cannot be used in a definition.

Every operand is evaluated. Unlike JavaScript `||`, an earlier true result does not prevent a missing-reference error in a later operand.

#### Returns

| Value / member | Type                      | Description                                   |
| -------------- | ------------------------- | --------------------------------------------- |
| Return         | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean`                 | True or false when the flow evaluates it.     |

#### Example

```ts api=expressions
const boundary = any(
  flow.input.get("count").eq(0),
  flow.input.get("count").eq(10),
);
```

#### How it works

The two comparisons test the endpoints zero and ten. `any()` is true when either endpoint matches.

### not

Reverses a flow condition: true becomes false and false becomes true. Use it when a path should run only if another condition does not hold.

#### Signature

```ts
not(condition: Expression<boolean>): Expression<boolean>
```

#### Inputs

| Parameter / option | Type                      |
| ------------------ | ------------------------- |
| `condition`        | `FlowExpression<boolean>` |

Pass one Boolean expression. The returned expression resolves to its inverse during execution. The operand must still resolve successfully: `not()` does not suppress missing-reference errors.

#### Returns

| Value / member | Type                      | Description                                   |
| -------------- | ------------------------- | --------------------------------------------- |
| Return         | `FlowExpression<boolean>` | Reference to the comparison/condition result. |
| Resolved value | `boolean`                 | True or false when the flow evaluates it.     |

#### Example

```ts api=expressions
const remaining = not(flow.input.get("count").eq(0));
```

#### How it works

The equality expression checks for zero; `not()` inverts it so a nonzero count satisfies the condition.

### FlowLoopLimitError

The error raised when a loop reaches its iteration limit while its condition is still true. Catch it around an awaited run to handle loop exhaustion.

#### Signature

```ts
new FlowLoopLimitError(stepId?: string): FlowLoopLimitError
error.name: "FlowLoopLimitError"
error.stepId: string | undefined
```

#### Parameters

| Parameter | Type     | Default     | Description                                          |
| --------- | -------- | ----------- | ---------------------------------------------------- |
| `stepId`  | `string` | `undefined` | Optional loop step ID included in the error message. |

Runtime limit errors supply the failing loop ID. Zero-argument construction keeps the original generic message and an undefined `stepId`. Catch it around the awaited run if your application handles loop exhaustion, and let unrelated errors propagate. A limit error means the run failed, not that it returned a successful partial result.

#### Returns

| Value / member | Type                   | Description                                                 |
| -------------- | ---------------------- | ----------------------------------------------------------- |
| Return         | `FlowLoopLimitError`   | Error instance.                                             |
| name           | `"FlowLoopLimitError"` | Identifies a still-true condition at the loop limit.        |
| stepId         | `string \| undefined`  | Read-only failing loop ID, present on runtime limit errors. |

#### Example

```ts
import { FlowLoopLimitError } from "jev-devtools/flow";
try {
  await program.run(input, { client });
} catch (error) {
  if (!(error instanceof FlowLoopLimitError)) throw error;
  console.error("Loop reached its iteration limit:", error.stepId);
}
```

#### How it works

The catch block handles only loop exhaustion and rethrows other failures. Captured error fields keep only the error name, without the message or input values. The flow did not complete successfully, so the handler reports the limit instead of treating a partial state as a result.

## Fixtures and comparison

**New in 0.5.0.** Fixtures contain captured response bodies, not the original input or executable recipe.

### flowFixture

Builds a replay fixture from a captured flow run and its request traces. It also reports missing responses and capture limitations to review before saving.

#### Signature

```ts
flowFixture(definition: FlowDefinition, run: FlowRun, traces: ReadonlyMap<string, Trace>): BuiltFlowFixture
```

#### Inputs

| Parameter / option | Type                         |
| ------------------ | ---------------------------- |
| `definition`       | `FlowDefinition`             |
| `run`              | `FlowRun`                    |
| `traces`           | `ReadonlyMap<string, Trace>` |

Import from `jev-devtools` in browser code or `jev-devtools/flow` on Node. Pass the recorded definition, recorded run, and a trace map indexed by trace ID.

The result contains `fixture`, `missing`, and `warnings`. `missing` lists completed Jev steps whose response captures are unavailable. `warnings` reports capture redaction or truncation. Task results are not included as fixture responses.

Check both arrays before saving. Server redaction remains; this helper does not apply the drawer's current display masking. The drawer's Copy fixture action does. Failed/cancelled runs can yield partial fixtures.

#### Returns

| Value / member | Type               | Description                                          |
| -------------- | ------------------ | ---------------------------------------------------- |
| Return         | `BuiltFlowFixture` | Export result with fields below.                     |
| fixture        | `FlowFixture`      | Saved response bodies by step ID.                    |
| missing        | `string[]`         | Completed Jev steps with missing response captures.  |
| warnings       | `string[]`         | Capture limitations such as redaction or truncation. |

#### Example

```ts
const built = flowFixture(
  definition,
  capturedRun,
  new Map(traces.map((trace) => [trace.id, trace])),
);
if (built.missing.length || built.warnings.length) console.warn(built);
const json = JSON.stringify(built.fixture, null, 2);
```

#### How it works

The map indexes captures by trace ID. `flowFixture()` finds responses linked to completed Jev steps; the example checks limitations before serializing only the fixture payload.

### replayClient

Creates a client that supplies saved Jev responses during a flow run. Use it to replay requests without inference calls; application tasks still execute.

#### Signature

```ts
replayClient(fixture: FlowFixture): TypeSafeClient
```

#### Inputs

| Parameter / option | Type          |
| ------------------ | ------------- |
| `fixture`          | `FlowFixture` |

Import from `jev-devtools/flow` and pass a fixture with `{ version: 1, flow, steps }`. The returned client supplies saved responses during a flow run without an API key or inference request.

Replay checks the flow name, step IDs, and requested question names. It does not check prompts or state. Invalid fixtures throw, and missing steps or answers reject instead of falling back to live inference. Map and loop step keys include item or iteration indices.

Tasks and request factories run again and can have side effects. Pass controlled tasks in tests. [Complete replay example](@/api/flow/#replay-captured-answers).

#### Returns

| Value / member | Type             | Description                                                |
| -------------- | ---------------- | ---------------------------------------------------------- |
| Return         | `TypeSafeClient` | Supplies fixture answers when used as a flow run’s client. |

#### Example

```ts
const result = await program.run(input, { client: replayClient(fixture) });
```

#### How it works

The client supplies stored answers for Jev steps while the same recipe executes with the supplied input. Tasks and request factories still execute, so control side effects in replay tests.

### compareWithFixture

Runs a flow against saved responses and then with the supplied live client, comparing the results. Use it to inspect changes in outcomes, decisions, and answers.

#### Signature

```ts
compareWithFixture<Input>(flow: ComparableFlow<Input>, input: Input, fixture: FlowFixture, options: FlowRunOptions & { tolerance?: number }): Promise<FixtureComparison>
```

#### Inputs

| Parameter / option | Type                                      |
| ------------------ | ----------------------------------------- |
| `flow`             | `ComparableFlow<Input>`                   |
| `input`            | `Input`                                   |
| `fixture`          | `FlowFixture`                             |
| `options`          | `FlowRunOptions & { tolerance?: number }` |

Import from `jev-devtools/flow`. Pass the executable flow, input, fixture, and run options. `client` supplies the second run's answers. `devtools` and `signal` are optional. Numeric answer tolerance defaults to 0 and must be finite and nonnegative.

The helper replays the fixture first, then runs the flow again with the supplied client and the same input. Tasks execute on both sides. Only the second run reaches your observer.

The result compares outcomes, values, branch/if decisions, scalar answer fields, and executed Jev steps. It also includes a new `liveFixture`.

Check `answers` even when `changed` is false. The top-level flag tracks outcome, value, decision, or executed Jev-step differences. Answer drift alone does not set it. Numeric tolerance applies only to answer fields, not outcome or value comparisons.

Invalid tolerance or an unreplayable fixture rejects the comparison. Errors from the supplied client propagate.

The second run uses the supplied client, so a live client makes inference calls. The returned `liveFixture` contains unredacted, untruncated response bodies. Review them before storing or sharing.

#### Returns

| Value / member | Type                                                                              | Description                                                                                 |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Return         | `Promise<FixtureComparison>`                                                      | Resolves to the comparison fields below.                                                    |
| changed        | `boolean`                                                                         | Outcome, value, decision, or executed Jev steps differ; answer drift alone does not set it. |
| outcome        | `{ recorded: string; live: string; changed: boolean }`                            | Terminal outcome comparison.                                                                |
| value          | `{ recorded?: unknown; live?: unknown; changed: boolean }`                        | Resolved output comparison.                                                                 |
| decisions      | `Array<{ stepId: string; recorded?: boolean; live?: boolean; changed: boolean }>` | Branch and if decisions.                                                                    |
| answers        | `AnswerChange[]`                                                                  | Scalar answer-field comparisons, including numeric deltas when finite.                      |
| steps          | `{ onlyRecorded: string[]; onlyLive: string[] }`                                  | Jev step IDs executed on only one side.                                                     |
| liveFixture    | `FlowFixture`                                                                     | Unredacted, untruncated live response bodies.                                               |

#### Example

```ts
import { compareWithFixture, formatComparison } from "jev-devtools/flow";
const comparison = await compareWithFixture(program, input, fixture, {
  client,
  devtools: inspector,
  tolerance: 0.01,
});
console.log(formatComparison(comparison));
```

#### How it works

The helper first replays the saved fixture, then executes with the supplied client. The tolerance permits small numeric answer differences. `formatComparison()` returns a text summary, which `console.log()` prints. Neither operation changes the runs' results.

### formatComparison

Turns a fixture comparison into a readable text summary. Use it in logs or reports after running `compareWithFixture()`.

#### Signature

```ts
formatComparison(comparison: FixtureComparison): string
```

#### Inputs

| Parameter / option | Type                |
| ------------------ | ------------------- |
| `comparison`       | `FixtureComparison` |

Import from `jev-devtools/flow` and pass a comparison result. The returned text has one line per change, or `"no changes from fixture"` when there are none.

The formatter performs no I/O. Print or store the string in application code. It can report answer drift even when `comparison.changed` is false.

#### Returns

| Value / member | Type     | Description                                               |
| -------------- | -------- | --------------------------------------------------------- |
| Return         | `string` | One line per reported change, or no changes from fixture. |

#### Example

```ts
const summary = formatComparison(comparison);
console.log(summary);
```

#### How it works

Formatting produces text only. `console.log()` is the application-owned output operation; the formatter itself performs no logging.

## Recorder

Import `JevRecorder` from `jev-devtools/server`. This is for custom integrations; most apps can use the server adapter. [Complete recorder setup](@/api/recorder/#jevrecorder).

### JevRecorder

Captures SDK requests and keeps their inspection history in memory. Use it directly when building a custom integration beyond the server adapter.

#### Signature

```ts
new JevRecorder(options?: CaptureOptions): JevRecorder
```

#### Inputs

| Parameter / option | Type             |
| ------------------ | ---------------- |
| `options?`         | `CaptureOptions` |

The optional `limit` defaults to 50 and is clamped to 1–200 across all sessions. The optional `redact(path, value)` callback transforms captured values. If transformed JSON cannot support a structured request or result view, `Trace.capture` retains it and `captureWarnings` explains the unavailable view. The drawer displays usable fields beside placeholders for incompatible fields. Fixture export still reports an incompatible response as missing.

History is bounded process memory, not durable storage. Pair `instrument()` with `transport()` to record both logical SDK calls and their HTTP attempts.

#### Returns

| Value / member | Type          | Description                               |
| -------------- | ------------- | ----------------------------------------- |
| Return         | `JevRecorder` | Recorder instance with the methods below. |

#### Example

```ts api=core
import { JevRecorder } from "jev-devtools/server";
const recorder = new JevRecorder({ limit: 50 });
```

#### How it works

Constructing the recorder sets a global retention bound of 50 traces. The instance can then wrap an SDK client and expose history to a custom viewer.

### recorder.transport

Wraps the SDK’s fetch function to record HTTP attempts. Pair it with `instrument()` to connect those attempts to their logical SDK calls.

#### Signature

```ts
recorder.transport(fetcher: Fetch): Fetch
```

#### Inputs

| Parameter / option | Type                   |
| ------------------ | ---------------------- |
| `fetcher`          | `SDK-compatible Fetch` |

Pass an SDK-compatible fetch implementation such as `globalThis.fetch`, then give the returned wrapper to the SDK's `fetch` option.

The wrapper records HTTP attempts associated with instrumented calls. It does not create HTTP endpoints or capture unrelated clients.

#### Returns

| Value / member | Type    | Description                                                          |
| -------------- | ------- | -------------------------------------------------------------------- |
| Return         | `Fetch` | SDK-compatible fetch wrapper; request/response contract is retained. |

#### Example

```ts
const sdk = new TypeSafeClient({
  apiKey,
  fetch: recorder.transport(globalThis.fetch),
});
```

#### How it works

The SDK receives a wrapped `fetch`, so HTTP attempts can be associated with instrumented logical calls. Pair this client with `recorder.instrument()` to record both levels.

### recorder.instrument

Wraps a TypeSafe client to record its `systemOne` calls with session and display labels. The returned client preserves the SDK’s request and response behavior.

#### Signature

```ts
recorder.instrument<T extends TypeSafeClient>(client: T, metadata: { session: string; label: string; source: "sample" | "live" } | (() => Metadata)): T
```

#### Inputs

| Parameter / option | Type                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `client`           | `T extends TypeSafeClient`                                                                  |
| `metadata`         | `{ session: string; label: string; source: "sample" \| "live" }, or a factory returning it` |

Pass an SDK client and either complete metadata or a synchronous metadata factory. `session` partitions history, `label` identifies the call, and `source` labels it as sample or live.

The proxy preserves the client's type, SDK promise, response helpers, and application result. It records only `systemOne` calls. Pair it with `transport()` to capture HTTP attempts. A sample label does not prevent network calls.

#### Returns

| Value / member | Type | Description                                                 |
| -------------- | ---- | ----------------------------------------------------------- |
| Return         | `T`  | Instrumented client proxy preserving its original SDK type. |

#### Example

```ts
const client = recorder.instrument(sdk, {
  session: "local",
  label: "Support",
  source: "live",
});
```

#### How it works

The proxy records `systemOne` calls under the local session with the Support label. The original SDK’s response helpers remain available on the returned client.

### recorder.snapshot

Reads the retained request history for one session as a detached array. Use it to populate a viewer without changing the stored history.

#### Signature

```ts
recorder.snapshot(session: string): Trace[]
```

#### Inputs

| Parameter / option | Type     |
| ------------------ | -------- |
| `session`          | `string` |

Pass the session to read. The returned traces are detached inspection copies, ordered newest first. They remain subject to redaction and capture limits.

Reading a snapshot does not clear history or return the original SDK objects.

#### Returns

| Value / member | Type      | Description                                             |
| -------------- | --------- | ------------------------------------------------------- |
| Return         | `Trace[]` | Detached retained traces for the session, newest first. |

#### Example

```ts
const traces = recorder.snapshot("local");
```

#### How it works

The call retrieves a detached copy of the local session’s current history. Reading the array does not clear or mutate recorder storage.

### recorder.changes

Reads trace updates since a revision, together with the current retained order. Use it to keep a viewer in sync without fetching every trace again.

#### Signature

```ts
recorder.changes(session: string, after?: number): { revision: number; order: string[]; upserts: Trace[] }
```

#### Inputs

| Parameter / option | Type     |
| ------------------ | -------- |
| `session`          | `string` |
| `after?`           | `number` |

Pass the session and, after the first read, the last returned revision as `after`. Omitting `after` requests a full initial view.

Apply `upserts` to your local cache, then remove cached traces whose IDs are absent from `order`. Do this even when `upserts` is empty: `order` is the authoritative retained history, newest first. Save the returned `revision` for the next read. Returned traces are detached copies.

#### Returns

| Value / member | Type       | Description                                        |
| -------------- | ---------- | -------------------------------------------------- |
| revision       | `number`   | Cursor for the next call.                          |
| order          | `string[]` | Authoritative newest-first retained trace IDs.     |
| upserts        | `Trace[]`  | Detached traces changed since the supplied cursor. |

#### Example

```ts
const initial = recorder.changes("local");
const next = recorder.changes("local", initial.revision);
```

#### How it works

The initial call requests a full view. Passing its revision into the second call requests changed traces; use the returned order to remove traces no longer retained.

### recorder.subscribe

Registers a listener for changes to recording sessions. Use the notified session names to decide which snapshots or updates your viewer should read.

#### Signature

```ts
recorder.subscribe(listener: (sessions: ReadonlySet<string>) => void): () => void
```

#### Inputs

| Parameter / option | Type                                      |
| ------------------ | ----------------------------------------- |
| `listener`         | `(sessions: ReadonlySet<string>) => void` |

The listener receives the set of sessions affected by a change. Notifications contain session names, not trace payloads. Read `snapshot()` or `changes()` for the sessions your viewer needs.

Call the returned function to unsubscribe during cleanup.

#### Returns

| Value / member | Type         | Description                                                       |
| -------------- | ------------ | ----------------------------------------------------------------- |
| Return         | `() => void` | Unsubscribe function; call when the listener is no longer needed. |

#### Example

```ts
const stop = recorder.subscribe((sessions) => {
  if (sessions.has("local")) console.log(recorder.snapshot("local"));
});
// On shutdown:
stop();
```

#### How it works

The listener filters notifications to the local session before reading its snapshot. Calling `stop()` removes that listener during cleanup.

### recorder.clear

Removes retained traces for one recording session and notifies listeners. Use it to reset inspection history while leaving application work running.

#### Signature

```ts
recorder.clear(session: string): void
```

#### Inputs

| Parameter / option | Type     |
| ------------------ | -------- |
| `session`          | `string` |

Pass the session to clear. The recorder removes its retained traces and notifies listeners, leaving other sessions intact.

Clearing history does not cancel the application's in-flight SDK work. The method returns no value.

#### Returns

| Value / member | Type   | Description                               |
| -------------- | ------ | ----------------------------------------- |
| Return         | `void` | No data; affected listeners are notified. |

#### Example

```ts
recorder.clear("local");
```

#### How it works

Only retained traces for the local session are removed. Other session histories and application inference continue.

### recorder.withFlow

Links captured SDK requests to the flow step executing them. Custom observers use it to establish recording context around a request callback.

#### Signature

```ts
recorder.withFlow<T>(link: { runId: string; stepId: string; executionId: string }, onTrace: (id: string) => void, callback: () => T): T
```

#### Inputs

| Parameter / option | Type                                                     |
| ------------------ | -------------------------------------------------------- |
| `link`             | `{ runId: string; stepId: string; executionId: string }` |
| `onTrace`          | `(id: string) => void`                                   |
| `callback`         | `() => T`                                                |

Pass the flow linkage, a callback that receives the captured trace ID, and the request callback. The wrapper establishes asynchronous recording context and calls the request callback immediately. Its result is returned unchanged, including a promise if it returns one.

The adapter's flow observer normally handles this linkage. Custom integrations must preserve synchronous call-through.

#### Returns

| Value / member | Type | Description                                                         |
| -------------- | ---- | ------------------------------------------------------------------- |
| Return         | `T`  | The callback result unchanged, including a promise when applicable. |

#### Example

```ts
return recorder.withFlow(
  link,
  (traceId) => {
    latestTraceId = traceId;
  },
  callback,
);
```

#### How it works

The wrapper establishes flow linkage around the request callback. `onTrace` stores the captured trace ID, while the callback’s result is returned unchanged.

## Observer hooks

`FlowObserver` is exported as a type from `jev-devtools/flow`. Pass an implementation as `devtools` to a run; the server adapter already implements it. Observers record execution and must not control application work. Observer failure containment is new in **0.5.0**.

### observer.startFlow

Starts observation of a flow run and supplies the hooks for its updates and requests. The runner calls it automatically when a `devtools` observer is provided.

#### Signature

```ts
observer.startFlow(definition: FlowDefinition, run: FlowRun): { update; request } | undefined
```

#### Inputs

| Parameter / option | Type             |
| ------------------ | ---------------- |
| `definition`       | `FlowDefinition` |
| `run`              | `FlowRun`        |

The runner supplies the definition and initial captured run. Return `update` and `request` hooks for that execution, or `undefined` to skip observation.

The server adapter records in the current session and returns `undefined` when disabled. Application code normally passes the adapter as `devtools` rather than calling this method directly.

#### Returns

| Value / member | Type                               | Description                                        |
| -------------- | ---------------------------------- | -------------------------------------------------- |
| Return         | `{ update, request } \| undefined` | Per-run hooks, or undefined to skip recording.     |
| update         | `(run: FlowRun) => void`           | Receives execution updates.                        |
| request        | `Generic callback wrapper`         | Links a request to its flow step; signature below. |

#### Example

```ts
await program.run(input, { client, devtools: inspector }); // runner calls startFlow
```

#### How it works

Passing the inspector as `devtools` lets the runner call `startFlow` and manage the returned hooks. Application code does not need to invoke those hooks manually.

### observer.update

Receives the latest captured run state as execution progresses. Use it in a custom observer to update a viewer or store run information.

#### Signature

```ts
hooks.update(run: FlowRun): void
```

#### Inputs

| Parameter / option | Type      |
| ------------------ | --------- |
| `run`              | `FlowRun` |

The runner calls this hook with the latest captured run state, including step status and any outcome or error. Use the snapshot to update your viewer or storage.

The hook returns no value. Keep application actions in flow steps, not observer callbacks.

#### Returns

| Value / member | Type   | Description                        |
| -------------- | ------ | ---------------------------------- |
| Return         | `void` | No application result is produced. |

#### Example

```ts
const hooks = {
  update(run: FlowRun) {
    console.log(run.id, run.status);
  },
  request<T>(
    _link: unknown,
    _onTrace: (id: string) => void,
    callback: () => T,
  ): T {
    return callback();
  },
};
```

#### How it works

The update hook logs the run ID and status. Its companion request hook calls through immediately; these hooks observe execution rather than implement application steps.

### observer.request

Wraps a flow’s request callback so an observer can associate its capture with the current step. It must call through synchronously and preserve the callback’s result.

#### Signature

```ts
hooks.request<T>(link: { runId: string; stepId: string; executionId: string }, onTrace: (id: string) => void, callback: () => T): T
```

#### Inputs

| Parameter / option | Type                                                     |
| ------------------ | -------------------------------------------------------- |
| `link`             | `{ runId: string; stepId: string; executionId: string }` |
| `onTrace`          | `(id: string) => void`                                   |
| `callback`         | `() => T`                                                |

The runner supplies execution linkage, a callback for reporting the captured trace ID, and the request callback. Call through synchronously and return the callback's original result.

Custom observers can delegate to `recorder.withFlow()` to establish recording context. The runner owns the request result.

#### Returns

| Value / member | Type | Description                           |
| -------------- | ---- | ------------------------------------- |
| Return         | `T`  | The original request callback result. |

#### Example

```ts
request<T>(link: Link, onTrace: (id: string) => void, callback: () => T): T {
  return recorder.withFlow(link, onTrace, callback);
} // method inside a custom hook object; Link is the shape above
```

#### How it works

The custom observer delegates to `withFlow()` so the recorder can associate the SDK request with its run, step, and execution ID. Returning the callback result preserves the runner’s request behavior.

## Public types

Use `import type` for these contracts. The expandable declarations below are read from the actual public package exports at docs build time, including their supporting structural types. They supplement the method explanations above and make exact fields and unions available without a browser TypeScript runtime. A type's declaration is not a promise that the same API exists in an older installed package.

<!-- public-api-types -->
