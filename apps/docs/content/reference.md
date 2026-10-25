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


```tsx api=core
import { JevDevtools } from "jev-devtools";

<JevDevtools enabled={import.meta.env.DEV} />;
```

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


```ts api=core
import { createJevDevtools } from "jev-devtools/server";
const inspector = createJevDevtools({ enabled: true, origin: "http://localhost:3000" });
```

### getJevDevtools

```ts
getJevDevtools(key: string, createOptions: () => JevDevtoolsServerOptions): Adapter
```

**Inputs:** a nonblank app-specific key and synchronous options factory. **Returns:** the same adapter for that key in the same Node realm; calls the factory only when creating it. The first options win until disposal or process restart. Empty keys throw. Histories are not shared across processes. Use this for module reloads in [Next.js](@/guides/nextjs/).


```ts api=core
import { getJevDevtools } from "jev-devtools/server";
const inspector = getJevDevtools("my-app", () => ({
  enabled: true, origin: "http://localhost:3000",
}));
```

### adapter.createClient

```ts
inspector.createClient(options: SDKClientOptions, metadata?: ClientMetadata): TypeSafeClient
```

**Inputs:** TypeSafe client constructor options (including your server-side key or custom `fetch`); optional `{ label?, source? }` defaults to `"Jev request"` and `"live"`. **Returns:** a client that records `systemOne` calls when enabled, otherwise an ordinary SDK client. Other SDK methods are not instrumented. Setting `source: "sample"` changes a label, not the transport or billing behavior.


```ts api=server
const client = inspector.createClient(
  { apiKey: process.env.TYPESAFE_API_KEY },
  { label: "Support", source: "live" },
);
```

### adapter.handle

```ts
inspector.handle(request: Request): Promise<Response>
```

**Input:** a Web Request with the actual public URL. **Returns:** configuration JSON, an event stream, a clear response, or an HTTP error. Forward the base path and all subpaths. Disabled/unmatched routes return 404; origin/auth failures return 403. Authorizer/session callback errors can reject, so let your framework handle errors. A Web Request provides no socket address: bind to loopback or configure authorization.


```ts api=server
const response = await inspector.handle(request);
```

### adapter.handleNodeRoute

```ts
inspector.handleNodeRoute(request: Request): Promise<Response>
```

**Input:** a Node framework's Web Request, including its actual `Host` header. **Returns:** the same response contract as `handle`, after checking Host against the configured authority and normalizing internal URLs. Forwarded host headers are not trusted. See the [Next.js route example](@/guides/nextjs/#expose-the-optional-catch-all-route).


```ts api=server
export const GET = (request: Request) => inspector.handleNodeRoute(request);
export const DELETE = GET;
```

### adapter.middleware

```ts
inspector.middleware(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void>
```

**Inputs:** Node HTTP request/response and continuation. **Returns:** a promise completing response handling, or calls `next()` for unrelated paths. Mount at the root without stripping the inspector prefix. Without `authorize`, enabled endpoints require a loopback socket. Route errors are contained as HTTP 500 or a destroyed response.


```ts api=server
app.use(inspector.middleware); // app is your Express/Connect server
```

### adapter.run

```ts
inspector.run<T>(request: Request, callback: () => T | Promise<T>): Promise<T>
```

**Inputs:** the application's authenticated request and work callback. **Returns:** the callback's resolved result; failures propagate. Chooses the recording scope through `getSession` for the callback's asynchronous work. It does not authorize the application action. Needed when using custom sessions.


```ts api=server
return inspector.run(request, () => client.systemOne(input));
```

### adapter.dispose

```ts
inspector.dispose(): void
```

Takes no arguments. Disables capture/endpoints and closes active streams. Shared adapters also release their key so a later `getJevDevtools` can create a new instance. **Returns:** nothing. Call on shutdown or deliberate reinitialization, not per request.


```ts api=server
inspector.dispose();
```

## Flow definitions and steps

Import `defineJevFlow` from `jev-devtools/flow` on Node. Builder methods describe work synchronously; they do not execute it. See [Flows from scratch](@/guides/flow-basics/) for a complete, small example of every operation.

### defineJevFlow

```ts
defineJevFlow<Input>(name: string, build: (flow: FlowBuilder<Input>) => Expression<FlowOutcome>): { definition: FlowDefinition; run: /* see below */ }
```

**Inputs:** a nonblank flow name of at most 100 characters, and a synchronous builder callback. Return the terminal `output` or `branch`. **Returns:** `{ definition, run }`, a reusable recipe. No SDK request is sent during definition. Invalid IDs, scopes, nesting, or terminal structure throw immediately.


```ts api=core
import { defineJevFlow } from "jev-devtools/flow";
const program = defineJevFlow<{ name: string }>("hello", (flow) =>
  flow.output("greeted", flow.input.get("name")),
);
```

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


```ts
const result = await program.run({ name: "Ada" }, { client, devtools: inspector });
console.log(result.outcome, result.value);
```

### flow.definition

```ts
program.definition: FlowDefinition
```

A read-only-in-use description of the recipe: version, ID, name, and nodes. **Usage:** inspect it or pair it with a captured `FlowRun` when building a fixture. Reading it does not execute a flow. Do not mutate the definition to change running behavior.


```ts
console.log(program.definition.name, program.definition.nodes.length);
```

### flow.input

```ts
flow.input: FlowExpression<Input>
```

A reference to the current recipe input, not its actual runtime value. **Returns/shape:** `Input` in ordinary flow/path/lane builders; `{ item, index, context }` inside map; `{ state, index, context }` inside loop. Select a field with `get`, or pass the whole reference into a task/request/output.


```ts api=expressions
const name = flow.input.get("name");
```

### flow.task

```ts
flow.task<I, O>(id: string, task: FlowTask<I, O>, display?: FlowDisplay): Expression<Awaited<O>>
```

**Inputs:** unique step ID; `input` containing values/references; `run(resolvedInput, context)` returning a value or promise; optional `timeoutMs` integer from 1 to 2,147,483,647. Context has `signal`, `runId`, `stepId`, `executionId`. **Returns:** a reference to the awaited callback result. Failure rejects the flow. Timeouts cancel the wait and signal work; they cannot forcibly stop non-cooperating side effects. [Beginner example](@/guides/flow-basics/#task-run-your-own-code).


```ts api=parallel
const greeting = flow.task("greet", {
  input: flow.input.get("name"),
  run: (name) => `Hello, ${name}!`,
});
```

### flow.jev

```ts
flow.jev(id, request, display?): AnswerRefs
flow.jev(id, { input, request: (resolvedInput) => sdkRequest }, display?): AnswerRefs
```

**Inputs:** unique ID and either a normal SDK request whose `state` may contain nested expressions, or a factory configuration. The factory's `input` is resolved first, then its synchronous `request` callback returns an SDK request. Use tasks for async preparation. The request's `questions` define named SDK question types; other SDK request options are passed through.

**Returns:** `.answer(name)` field references and `.answers` for all answers, typed from the questions. Runtime factories may generate question names; use `.answers` for dynamic keys. SDK failures reject the run. A request factory returning a promise is invalid. [Both forms with complete examples](@/guides/flow-basics/#jev-ask-a-question).


```ts api=parallel
const result = flow.jev("classify", {
  state: flow.input,
  questions: { team: choice("Which team?", { billing: null, support: null }) },
}); // choice is imported from @typesafe-ai/sdk
```

### request.answer

```ts
result.answer<Name extends keyof Questions>(name: Name): AnswerFieldReferences
```

**Input:** a known question name. **Returns:** an object whose answer fields are typed expressions: e.g. `.choice` for Choice, `.noul` for Noul, `.score` for Score, or `.box` for Box; other SDK result fields are available according to the question type. Calling `answer` does not send another request. Static unknown questions fail during definition; generated questions must exist when executed. A Noul is a probability of true, not a confidence score.


```ts
const team = result.answer("team").choice; // expression for a Choice result
```

### request.answers

```ts
result.answers: Expression<{ [Name in keyof Questions]: ResultFor<Questions[Name]> }>
```

The full resolved SDK answer object, useful when a factory generates question names at runtime. **Usage:** pass it to a task or output. It is still a future-value reference during definition.


```ts api=parallel
return flow.output("answers", result.answers);
```

### flow.if

```ts
flow.if<A, B>(id, { when, then, else }, display?): Expression<A | B>
```

**Inputs:** a Boolean expression `when`; `then(path)` and `else(path)` callbacks each returning a value reference. **Returns:** the chosen value reference so later shared steps can continue. Both callbacks build synchronously, only the selected path executes. Use the provided path builder; do not return terminal outputs here. [Beginner example](@/guides/flow-basics/#if-choose-a-value-then-continue).


```ts api=parallel
const days = flow.if("speed", {
  when: flow.input.get("express").eq(true),
  then: (path) => path.task("fast", { input: 1, run: (n) => n }),
  else: (path) => path.task("regular", { input: 5, run: (n) => n }),
});
```

### flow.branch

```ts
flow.branch(id, { when, then, else }, display?): Expression<FlowOutcome>
```

**Inputs:** Boolean `when`; two callbacks returning `output` or another terminal `branch`. **Returns:** the terminal result reference. Return it from the containing flow/path. No steps may follow this terminal decision. Use `if` to rejoin instead. [Beginner example](@/guides/flow-basics/#branch-choose-how-to-finish).


```ts api=parallel
return flow.branch("route", {
  when: flow.input.get("needsReview").eq(true),
  then: (path) => path.output("review"),
  else: (path) => path.output("ready"),
});
```

### flow.parallel

```ts
flow.parallel(id, lanes: { [name: string]: (lane) => Expression<unknown> }, display?): JoinedReferences
```

**Inputs:** a nonempty object of named lane callbacks, each returning a value expression. Lane names follow step ID naming rules. **Returns:** an object preserving lane names and their expression types. Lanes run concurrently; steps within a lane are sequential. Sibling intermediate results are private. A failure cancels sibling work cooperatively. [Beginner example](@/guides/flow-basics/#parallel-do-independent-work-together).


```ts api=parallel
const results = flow.parallel("prices", {
  regular: (lane) => lane.task("full", { input: 100, run: (n) => n }),
  sale: (lane) => lane.task("discount", { input: 80, run: (n) => n }),
});
return flow.output("priced", { regular: results.regular, sale: results.sale });
```

### flow.map

```ts
flow.map<Item, Context, Output>(id, { items, input, maxItems, concurrency? }, build, display?): Expression<Output[]>
```

**Inputs:** array/reference `items`; shared context `input`; required integer `maxItems` from 1–64; `concurrency` from 1–16 (default 4). `build(item)` receives `FlowBuilder<{ item: Item; index: number; context: Resolved<Context> }>` and returns a value reference.

**Returns:** results in original item order; empty input returns an empty array. Exceeding `maxItems` rejects instead of truncating. Use explicit context rather than outer references inside the item program. No nested maps or loops inside maps. [Complete beginner example](@/guides/flow-basics/#map-repeat-a-recipe-for-each-item).


```ts api=parallel
const doubled = flow.map("double", { items: [2, 4], input: {}, maxItems: 10 },
  (item) => item.task("multiply", {
    input: item.input.get("item"), run: (n) => n * 2,
  }),
);
```

### flow.loop

```ts
flow.loop<State, Context>(id, { initial, input, while, maxIterations }, build, display?): Expression<State>
```

**Inputs:** JSON state/reference `initial`; explicit shared context `input`; `while(state)` returning a Boolean expression of that state; required `maxIterations` integer 1–64. `build(iteration)` gets `{ state, index, context }` through its builder input and returns the next state reference of the same type.

**Returns:** final state when the pre-iteration condition becomes false (possibly the initial state). If still true at the limit, rejects with `FlowLoopLimitError`. Nested loops are unsupported; a loop can contain a map. [Beginner example](@/guides/flow-basics/#loop-repeat-until-a-condition-is-false).


```ts api=parallel
const final = flow.loop("count", {
  initial: 0, input: {}, while: (state) => state.lt(3), maxIterations: 3,
}, (iteration) => iteration.task("increment", {
  input: iteration.input.get("state"), run: (n) => n + 1,
}));
```

### flow.output

```ts
flow.output(name: string, value?: unknown, display?: FlowDisplay): Expression<FlowOutcome>
```

**Inputs:** outcome name (also a unique node ID), optional literal/reference or nested value, optional display metadata. **Returns:** a terminal expression. Return it from your flow or branch path. Resolves nested references when run; no business action happens just because an outcome is named. No steps may follow it.


```ts api=parallel
return flow.output("done", { message, count });
```

## Expressions and conditions

All these runtime exports come from `jev-devtools/flow`. References must belong to the same flow and be available in the current execution scope. See [expression scopes](@/api/expressions/#respect-scope).

### FlowExpression

```ts
new FlowExpression<T>(ast, owner?: object)
expression.ast: Ast
```

A typed representation of a future value. The constructor accepts an expression AST (`input`, `ref`, `get`, `literal`, or supported operator nodes) and optional ownership token; it freezes the AST. **Returns:** an expression with the methods below. Its `ast` property describes the expression, not its resolved value.

Ordinary consumers should obtain owned expressions from builders. Hand-constructed expressions are generally unowned and cannot be inserted into a flow; the optional owner is not an application integration mechanism. The structural AST is visible in installed declarations, but not exported as a named public `Ast` type.


```ts api=expressions
const message = flow.input.get("message"); // obtain an owned expression
```

### expression.get

```ts
expression.get<K extends keyof T & (string | number)>(key: K): Expression<T[K]>
```

**Input:** a valid string/number property key. **Returns:** a reference to that field; chain for nested fields. Missing values fail when execution reaches them. This is field selection, not a general optional chaining mechanism.


```ts api=expressions
const city = flow.input.get("address").get("city");
```

### expression.eq

```ts
expression.eq(value: T | Expression<T>): Expression<boolean>
```

**Input:** a literal or compatible expression. Equality for matching scalar types (string, number, Boolean, or null); not deep object equality. **Returns:** a Boolean expression, not a JavaScript Boolean. Invalid scalar comparisons reject during execution.


```ts api=expressions
const condition = flow.input.get("count").eq(3);
```

### expression.lt

```ts
expression.lt(value: number | Expression<number>): Expression<boolean>
```

**Input:** a literal or compatible expression. Strictly less than. **Returns:** a Boolean expression, not a JavaScript Boolean. Both resolved operands must be finite numbers; missing, nullable, or nonnumeric operands reject during execution. There is no `lte`; use `not(value.gt(limit))` for a valid numeric inclusive upper bound.


```ts api=expressions
const condition = flow.input.get("count").lt(3);
```

### expression.gt

```ts
expression.gt(value: number | Expression<number>): Expression<boolean>
```

**Input:** a literal or compatible expression. Strictly greater than. **Returns:** a Boolean expression, not a JavaScript Boolean. Both resolved operands must be finite numbers; missing, nullable, or nonnumeric operands reject during execution. There is no `lte`; use `not(value.gt(limit))` for a valid numeric inclusive upper bound.


```ts api=expressions
const condition = flow.input.get("count").gt(3);
```

### expression.gte

```ts
expression.gte(value: number | Expression<number>): Expression<boolean>
```

**Input:** a literal or compatible expression. Greater than or equal. **Returns:** a Boolean expression, not a JavaScript Boolean. Both resolved operands must be finite numbers; missing, nullable, or nonnumeric operands reject during execution. There is no `lte`; use `not(value.gt(limit))` for a valid numeric inclusive upper bound.


```ts api=expressions
const condition = flow.input.get("count").gte(3);
```

### all

```ts
all(...conditions: Expression<boolean>[]): Expression<boolean>
```

**Inputs:** Boolean expressions. **Returns:** a Boolean expression. True only when every condition is true. Supply at least one owned condition; a zero-operand expression has no flow owner and cannot be used in a definition. All operands are evaluated; these helpers do not short-circuit missing-reference errors like JavaScript `&&`/`||`.


```ts api=expressions
const ready = all(flow.input.get("count").gte(1), flow.input.get("count").lt(10));
```

### any

```ts
any(...conditions: Expression<boolean>[]): Expression<boolean>
```

**Inputs:** Boolean expressions. **Returns:** a Boolean expression. True when at least one condition is true. Supply at least one owned condition; a zero-operand expression has no flow owner and cannot be used in a definition. All operands are evaluated; these helpers do not short-circuit missing-reference errors like JavaScript `&&`/`||`.


```ts api=expressions
const boundary = any(flow.input.get("count").eq(0), flow.input.get("count").eq(10));
```

### not

```ts
not(condition: Expression<boolean>): Expression<boolean>
```

**Inputs:** Boolean expression. **Returns:** a Boolean expression. Inverts one Boolean expression. All operands are evaluated; these helpers do not short-circuit missing-reference errors like JavaScript `&&`/`||`.


```ts api=expressions
const remaining = not(flow.input.get("count").eq(0));
```

### FlowLoopLimitError

```ts
new FlowLoopLimitError(): Error
error.name: "FlowLoopLimitError"
```

Exported error class thrown when a loop condition remains true after its iteration limit. Takes no constructor arguments. **Usage:** catch around the awaited run; other errors should propagate. A limit error is not a successful partial result.


```ts
import { FlowLoopLimitError } from "jev-devtools/flow";
try {
  await program.run(input, { client });
} catch (error) {
  if (!(error instanceof FlowLoopLimitError)) throw error;
  console.error("The flow needs a different stopping rule or iteration limit.");
}
```

## Fixtures and comparison

**Unreleased relative to npm 0.4.1.** Use the working-tree package. Fixtures contain captured response bodies, not the original input or executable recipe.

### flowFixture

```ts
flowFixture(definition: FlowDefinition, run: FlowRun, traces: ReadonlyMap<string, Trace>): BuiltFlowFixture
```

**Import:** `jev-devtools` (browser-safe) or `jev-devtools/flow` (Node). **Inputs:** recorded definition, recorded run, and map indexed by trace ID. **Returns:** `{ fixture, missing, warnings }`. Completed Jev steps without available response captures appear in `missing`. Capture truncation/redaction warnings appear in `warnings`. Task results are not fixture responses.

Check both arrays before saving. Server redaction remains; this helper does not apply the drawer's current display masking. The drawer's Copy fixture action does. Failed/cancelled runs can yield partial fixtures.


```ts
const built = flowFixture(definition, capturedRun, new Map(traces.map((trace) => [trace.id, trace])));
if (built.missing.length || built.warnings.length) console.warn(built);
const json = JSON.stringify(built.fixture, null, 2);
```

### replayClient

```ts
replayClient(fixture: FlowFixture): TypeSafeClient
```

**Import:** `jev-devtools/flow`. **Input:** `{ version: 1, flow, steps }`. **Returns:** a client for a flow's `run` that supplies saved Jev responses without a key/network. Checks flow name, step IDs, and question names, not prompts/state. Invalid fixtures throw; missing steps/answers reject rather than falling back to inference. Item/iteration step keys include their indices.

Tasks and request factories run again and can have side effects. Pass controlled tasks in tests. [Complete replay example](@/api/flow/#replay-captured-answers-unreleased).


```ts
const result = await program.run(input, { client: replayClient(fixture) });
```

### compareWithFixture

```ts
compareWithFixture<Input>(flow: ComparableFlow<Input>, input: Input, fixture: FlowFixture, options: FlowRunOptions & { tolerance?: number }): Promise<FixtureComparison>
```

**Import:** `jev-devtools/flow`. **Inputs:** the executable recipe, the same input for both runs, saved fixture, live client, optional observer/signal, and numeric answer tolerance (default 0; finite and nonnegative). Replays the recorded side first, then runs the live side; both execute tasks. Only the live side reaches your observer.

**Returns:** outcome/value comparisons, branch/if decisions, scalar answer-field differences, step IDs unique to either side, and a new `liveFixture`. Top-level `changed` means outcome, value, decision, or executed Jev-step differences; **answer drift alone does not set it**. Tolerance applies to numeric answer-field differences, not outcome/value comparisons. Invalid tolerance or unreplayable fixtures reject; live errors propagate.

Unlike offline replay, this makes real SDK calls with the supplied client. `liveFixture` contains unredacted, untruncated live response bodies; review before storing or sharing.


```ts
import { compareWithFixture, formatComparison } from "jev-devtools/flow";
const comparison = await compareWithFixture(program, input, fixture, {
  client, devtools: inspector, tolerance: 0.01,
});
console.log(formatComparison(comparison));
```

### formatComparison

```ts
formatComparison(comparison: FixtureComparison): string
```

**Import:** `jev-devtools/flow`. **Input:** a comparison result. **Returns:** a plain-text summary with one line per change, or `"no changes from fixture"`. No I/O is performed; print or store it yourself. It may report answer drift even when `comparison.changed` is false.


```ts
const summary = formatComparison(comparison);
console.log(summary);
```

## Recorder

Import `JevRecorder` from `jev-devtools/server`. This is for custom integrations; most apps can use the server adapter. [Complete recorder setup](@/api/recorder/#jevrecorder).

### JevRecorder

```ts
new JevRecorder(options?: CaptureOptions): JevRecorder
```

**Inputs:** optional `limit` (default 50, clamped 1–200 globally) and `redact(path, value)` callback. **Returns:** a recorder with the following methods. History is bounded process memory, not durable storage. Pair `instrument` and `transport` to capture logical requests and HTTP attempts.


```ts api=core
import { JevRecorder } from "jev-devtools/server";
const recorder = new JevRecorder({ limit: 50 });
```

### recorder.transport

```ts
recorder.transport(fetcher: Fetch): Fetch
```

**Input:** SDK-compatible fetch implementation, e.g. `globalThis.fetch`. **Returns:** a compatible wrapper that records HTTP attempts associated with instrumented calls. Give it to the SDK's `fetch` option; it is not a standalone recording server.


```ts
const sdk = new TypeSafeClient({ apiKey, fetch: recorder.transport(globalThis.fetch) });
```

### recorder.instrument

```ts
recorder.instrument<T extends TypeSafeClient>(client: T, metadata: { session: string; label: string; source: "sample" | "live" } | (() => Metadata)): T
```

**Inputs:** an SDK client and complete metadata or a synchronous metadata factory. `session` partitions history; `label` identifies a call; `source` labels sample/live captures. **Returns:** an instrumented proxy preserving the client's type, SDK promise, response helpers, and application result. Only `systemOne` is captured; pair with `transport` for attempts. A sample label does not prevent network calls.


```ts
const client = recorder.instrument(sdk, { session: "local", label: "Support", source: "live" });
```

### recorder.snapshot

```ts
recorder.snapshot(session: string): Trace[]
```

**Input:** session to read. **Returns:** detached retained traces, newest first. These are bounded/redacted inspection copies, not original SDK objects. Reading does not clear history.


```ts
const traces = recorder.snapshot("local");
```

### recorder.changes

```ts
recorder.changes(session: string, after?: number): { revision: number; order: string[]; upserts: Trace[] }
```

**Inputs:** session and optional revision cursor. **Returns:** current revision, authoritative newest-first retained IDs, and detached changed traces. Omit `after` for an initial full view. Remove locally cached IDs absent from `order`, even when `upserts` is empty, and save the returned cursor.


```ts
const initial = recorder.changes("local");
const next = recorder.changes("local", initial.revision);
```

### recorder.subscribe

```ts
recorder.subscribe(listener: (sessions: ReadonlySet<string>) => void): () => void
```

**Input:** listener notified of affected sessions. **Returns:** a function to unsubscribe. Read a snapshot/changes for your session when notified. Notifications carry session names, not trace payloads.


```ts
const stop = recorder.subscribe((sessions) => {
  if (sessions.has("local")) console.log(recorder.snapshot("local"));
});
// On shutdown:
stop();
```

### recorder.clear

```ts
recorder.clear(session: string): void
```

**Input:** session to clear. **Returns:** nothing. Removes that session's retained traces and notifies listeners; other session traces remain. Does not cancel your application's in-flight SDK work.


```ts
recorder.clear("local");
```

### recorder.withFlow

```ts
recorder.withFlow<T>(link: { runId: string; stepId: string; executionId: string }, onTrace: (id: string) => void, callback: () => T): T
```

**Inputs:** flow linkage, trace-ID callback, and request callback. **Returns:** the callback's result unchanged, including a promise if it returns one. Establishes async recording context and calls through immediately. Normally invoked by the adapter's observer; standalone custom integrations should keep the call-through synchronous.


```ts
return recorder.withFlow(link, (traceId) => { latestTraceId = traceId; }, callback);
```

## Observer hooks

`FlowObserver` is exported as a type from `jev-devtools/flow`. Pass an implementation as `devtools` to a run; the server adapter already implements it. Observers record execution and must not control application work. Current working-tree observer failure containment is unreleased relative to npm 0.4.1.

### observer.startFlow

```ts
observer.startFlow(definition: FlowDefinition, run: FlowRun): { update; request } | undefined
```

**Inputs:** the graph and initial captured run. **Returns:** per-run `update`/`request` hooks, or `undefined` to skip observation. The adapter's `startFlow` records to the current session and returns `undefined` when disabled. Usually you never call it directly.


```ts
await program.run(input, { client, devtools: inspector }); // runner calls startFlow
```

### observer.update

```ts
hooks.update(run: FlowRun): void
```

**Input:** latest run snapshot with step status, outcome, or error. **Returns:** nothing. Store/send the snapshot in a custom viewer integration; do not use it to execute business actions. The runner calls this as execution changes.


```ts
const hooks = {
  update(run: FlowRun) { console.log(run.id, run.status); },
  request<T>(_link: unknown, _onTrace: (id: string) => void, callback: () => T): T {
    return callback();
  },
};
```

### observer.request

```ts
hooks.request<T>(link: { runId: string; stepId: string; executionId: string }, onTrace: (id: string) => void, callback: () => T): T
```

**Inputs:** execution linkage, a callback to report the captured trace ID, and the request callback. **Returns:** the callback's original result. Call through synchronously so recording context is established; the runner owns the result. Custom observers can delegate to a recorder.


```ts
request<T>(link: Link, onTrace: (id: string) => void, callback: () => T): T {
  return recorder.withFlow(link, onTrace, callback);
} // method inside a custom hook object; Link is the shape above
```

## Public types

Use `import type` for these contracts. The expandable declarations below are read from the actual public package exports at docs build time, including their supporting structural types. They supplement the method explanations above and make exact fields and unions available without a browser TypeScript runtime. A type's declaration is not a promise that the same API exists in an older installed package.

<!-- public-api-types -->
