# Build and inspect a Jev flow

For `jev-devtools` **0.6.0**, with **Unreleased** working-tree additions for scope-specific builders and inferred results. The curried definition API, `FlowValueBuilder`, `DefinedJevFlow`, and `FlowResult` below are not in 0.6.0. Check the [release notes](https://github.com/diegoag64/jev-devtools/releases/tag/v0.6.0) for verified publication status when installing from source. Read the installed package version and `lib/flow/index.d.ts` first; online `main` may describe newer APIs. Use this recipe when the user asks to connect multiple Jev requests, inspect branches, run server function steps, or visualize parallel checks, collections, and loops. Adding the inspector alone does not require converting existing calls to flows.

The source checkout's Unreleased flow delivery coalesces updates over a fixed 16 ms window after the immediate initial snapshot. Terminal states and clear use the same window; reconnect snapshots are immediate. Allow event-loop scheduling delay when verifying the inspector. Execution results remain full, and capture still has per-value limits rather than a whole-run byte or heap budget. Older installed releases can deliver intermediate updates more frequently.

## Plan the integration

When the user requests a workspace diagram without a drawer, check whether the installed package exports `jev-devtools/viewer` (added in 0.6.0). If present, use its public `JevFlowViewer` with a serialized `FlowDefinition`; add a matching captured `FlowRun` and traces for execution details. `useJevInspection({ enabled, endpoint })` subscribes to the existing adapter and defaults to disabled. The hook and drawer release streams while the page is hidden or starts navigation. They reconnect to retained history when visible or after navigation is cancelled; server capture continues within recorder limits. The viewer uses Shadow DOM styles and needs at least 400 pixels of height. `visibleNodeIds`, `highlightedNodeIds`, `nodeAccents`, `selectedNodeId`, and `onNodeSelect` control presentation only. Keep the flow runner and credentials on Node. Verify a definition before execution and a captured sample afterward; confirm source or timeline selections highlight the intended nodes when those controls are used.

1. Complete the existing [React/Node](react-node.md) or [Next.js](nextjs.md) setup. Reuse its shared inspector and instrumented client; do not create a second recorder for flows.
2. Identify the input shape, questions, execution order, decision thresholds, parallel dependencies, and named outcomes in the user's application. Preserve existing policies. If a threshold or action is unspecified, ask rather than inventing it.
3. Import `defineJevFlow` (and `all`, `any`, `not` when needed) from **server-only** `jev-devtools/flow`. Define the graph once at module scope and call `run()` from the existing Node handler/action. In Next.js, mark the module `server-only` and keep the executing route/segment on the Node runtime. No new client provider or root component is needed.
4. A named output returns data and does not execute an action. Existing business actions can remain in the application after the returned outcome; use `task()` when the user wants application-owned server work included in the flow. Preserve authorization, idempotency, input validation, and error handling. Cancellation cannot undo side effects.

If importing question helpers as below, install `@typesafe-ai/sdk` as a direct dependency in the server workspace using its package manager. Version 0.6.0 requires SDK `>=0.7.0 <0.8.0` and is verified with 0.7.0; preserve a compatible existing version rather than silently changing SDK semantics. The flow also accepts ordinary SDK question objects.

## Complete example: parallel checks, one decision, two outcomes

The 90% threshold here is an illustrative application policy, not a Jev default. The example's `inspector` and `jev` come from the shared server setup above.

```ts
import { noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";

type Ticket = { message: string };

export const reviewFlow = defineJevFlow<Ticket>("ticket-review", (flow) => {
  const checks = flow.parallel(
    "checks",
    {
      eligibility: (lane) =>
        lane
          .jev(
            "eligibility",
            {
              state: flow.input,
              questions: {
                eligible: noul("Is this ticket eligible for review?"),
              },
            },
            {
              title: "Check eligibility",
              description:
                "Evaluate whether this ticket can enter the review process.",
            },
          )
          .answer("eligible").noul,
      risk: (lane) =>
        lane
          .jev(
            "risk",
            {
              state: flow.input,
              questions: {
                risky: noul("Does this ticket need extra risk review?"),
              },
            },
            {
              title: "Check risk",
              description: "Evaluate risk independently of eligibility.",
            },
          )
          .answer("risky").noul,
    },
    {
      title: "Wait for both checks",
      description: "Continue after eligibility and risk have both succeeded.",
    },
  );

  const decision = flow.jev(
    "decision",
    {
      state: {
        ticket: flow.input,
        eligibility: checks.eligibility,
        risk: checks.risk,
      },
      questions: { ready: noul("Is this ticket ready for approval?") },
    },
    {
      title: "Assess readiness",
      description: "Ask Jev to assess the ticket using both completed checks.",
    },
  );

  return flow.branch(
    "readiness",
    {
      when: decision.answer("ready").noul.gte(0.9),
      then: (path) =>
        path.output(
          "ready",
          {
            readiness: decision.answer("ready").noul,
          },
          {
            title: "Ready for approval",
            description:
              "Return readiness to the application. No approval is executed here.",
          },
        ),
      else: (path) =>
        path.output("manual-review", undefined, {
          title: "Needs manual review",
          description: "Readiness is below the application threshold.",
        }),
    },
    {
      title: "Require at least 90% readiness",
      description: "Use the returned readiness probability to choose a route.",
    },
  );
});
```

Invoke from your existing server handler after validating the input:

```ts
const result = await reviewFlow.run(
  { message: "I was charged twice." },
  {
    client: jev, // Created by this same inspector.
    devtools: inspector,
    signal: request.signal, // Optional AbortSignal when the framework provides one.
  },
);
// { runId, outcome: 'ready', value: { readiness: 0.94 } }
// Or { runId, outcome: 'manual-review', value: undefined }.
```

For custom server-derived sessions, use `await inspector.run(request, () => reviewFlow.run(input, { client: jev, devtools: inspector, signal: request.signal }))`. This ensures the run and its calls use the same session as the authorized inspector connection. Do not accept an arbitrary client-supplied session ID.

## Choose builder and result types

**Unreleased:** Use `defineJevFlow<Input>(name)(build)` when application code needs inferred terminal results with an explicit input type. TypeScript cannot partially infer later generic arguments in the existing `defineJevFlow<Input>(name, build)` call. That form keeps its broad result for compatibility; it needs no migration. Calls without explicit type arguments also infer terminal results. Narrow an inferred result with `result.outcome` before reading a branch-specific value. Whole-expression outputs keep the exact payload type. Scalars stay exact. Direct ordinary arrays/tuples preserve positional types, readonly state, optional/rest positions, and standard methods; attached properties are not promised. Augmented variadic tuples can widen the rest element union. Direct object templates include the original value or a projected record whose declared fields may be absent. Structural types encode neither prototypes nor enumerability, so symbol/non-enumerable fields can disappear and dropped overrides can expose Object.prototype methods. Narrow fields before using them. When the handler needs an exact JSON object result, assemble it in an existing task and output the task's whole result expression. For direct opaque outputs, use presence or instanceof narrowing before calling methods, for example `value instanceof Date`. Whole-expression outputs preserve exact methods and properties. Preserve runtime class/Date/SDK asset identity; do not use type assertions to bypass projection uncertainty.

Let callback parameter types infer their scope. Value bodies use `FlowValueBuilder` and return an expression. Roots, terminal branch paths, and parallel lanes use `FlowBuilder` and support terminal outputs or branches. Map descendants cannot create maps or loops. Loop descendants can create maps but cannot create loops. These restrictions follow nested if paths, lanes, and lane branches. A lane terminal returns a lane value; it does not terminate the containing flow.

For reusable helpers, accept only the required capabilities, such as `Pick<FlowValueBuilder<Input>, "task">`. Use `DefinedJevFlow<Input, Outcome>` for executable definitions and `FlowResult<Outcome>` for application results. Their default outcome is the broad `FlowOutcome`. Keep captured `FlowRun` data separate from execution results.

## API rules that affect generated code

| API                                                                                 | Contract                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `defineJevFlow<Input>(name, build)`                                                 | Synchronous definition; no requests run while building. Return `flow.output(...)` or `flow.branch(...)`. Each `run` is independent.                                                                                      |
| `flow.jev(id, request, display?)`                                                   | One SDK `systemOne` call when reached. Sequential within its block. Use normal SDK questions/options/assets; references resolve in state.                                                                                |
| `flow.jev(id, { input, request }, display?)`                                        | Resolve input references, then synchronously build the SDK request at execution time. Use a preceding task for asynchronous preparation.                                                                                 |
| `flow.task(id, { input, run, timeoutMs? }, display?)`                               | Run server code with resolved JSON-compatible input and return a typed result reference. Cancellation is cooperative; no automatic task retry.                                                                           |
| `flow.if(id, { when, then, else }, display?)`                                       | Only the selected path executes. Each arm returns an expression; the merged result can feed shared downstream steps.                                                                                                     |
| `flow.map(id, { items, input, concurrency?, maxItems }, buildItem, display?)`       | Run a bounded item program over an array; preserve result order. Pass outer values through `input`; return an expression from the item builder.                                                                          |
| `flow.loop(id, { initial, input, while, maxIterations }, buildIteration, display?)` | Check a state expression before each iteration; return a same-type state expression from the body. Reject unfinished limit exhaustion with `FlowLoopLimitError`.                                                         |
| `flow.input.get('field')`                                                           | Select an own object field, array index, or array `length` as a typed reference resolved during execution. Primitive properties (string length/indexes included) are unsupported; compute them in a task callback.       |
| `result.answer('name')`                                                             | Typed answer fields: `.choice`, `.probabilities.get('label')`, `.confidence`, `.noul`, `.score`, `.legend`, or `.box` as supported by that question's SDK result. Select nested fields with `.get(key)`.                 |
| `value.eq(other)`, `.lt(number)`, `.gt(number)`, `.gte(number)`                     | Matching scalar equality or finite numeric comparisons. Noul values are in 0–1; use `0.9`, not `90`. There is no `.lte()` method.                                                                                        |
| `all(...)`, `any(...)`, `not(...)`                                                  | Compose Boolean expressions. Every operand evaluates; missing values are errors even in an otherwise short-circuited expression. Do not use JavaScript `if`, `&&`, or `>=` on expression objects.                        |
| `flow.branch(id, { when, then, else }, display?)`                                   | Terminal in that block. Both callbacks define paths; only one executes. Each callback must return its own builder's `output` or nested `branch`. Use `flow.if()` for value-returning paths with common continuation.     |
| `flow.parallel(id, lanes, display?)`                                                | Named lanes run concurrently. Each lane returns an expression. Use the resulting named references after all lanes succeed. Lane-local references cannot escape directly or cross into a sibling lane.                    |
| `flow.output(name, value?, display?)`                                               | Terminal named result, optionally containing nested resolved expressions. Output names are globally unique node IDs. For metadata without a value, pass `undefined` second.                                              |
| `definition.run(input, { client, devtools?, signal? })`                             | Existing explicit-input two-argument definitions return `{ runId, outcome: string, value?: unknown }`. The curried form below infers terminal outcomes and resolved values. A normal SDK client works without recording. |

The bundled declarations reject array methods such as `.get("map")` and non-scalar `.eq()` receivers or operands. Equality supports strings, finite numbers, booleans, and null, including literal and branded types. Scalar unions still need matching resolved types. Array bounds and absent optional fields remain execution checks. Preserve generic field helpers by deriving their key constraint as `K extends keyof T & Parameters<FlowExpression<T>["get"]>[0]`; unrestricted `keyof T` also includes array methods. Older package declarations may accept these invalid operations, so check the installed version.

Use the callback's current builder (`lane` or `path`) to add steps; do not call the outer builder inside it. References must belong to the same definition and be available on the current path. Reusing an earlier parent reference is allowed. IDs must be unique across all paths/lanes: 1–80 letters, digits, `_`, or `-`, starting with a letter or digit. Maximum 256 nodes including collection/iteration templates, 16 nested blocks, and 1,024 expanded steps per run. Version 0.4.0 includes tasks, factories, maps, returning conditionals and loops as described below. Plain templates are copied when defining; treat SDK assets as immutable. Define once to avoid a new definition identity on every request; hot reload can still create a new identity.

**0.5.2:** expressions are bounded during construction to depth 80 (leaf depth 0), 4,096 expanded nodes, and 256 operands per operation. Reusing a child counts its complete size again: eleven `all(e, e)` doublings of Boolean `flow.input` fit (4,095 nodes), but twelve do not. Split larger logic into tasks or smaller steps. Legacy condition descriptions are capped at 4,096 UTF-16 code units including `[condition truncated]`; structured rules keep their 128-node projection budget. Display truncation never changes accepted expression evaluation.

SDK retries remain within each request; the flow adds no retries. A failed step blocks dependents and rejects the run. A failed lane aborts siblings and waits for them to settle. External cancellation propagates to SDK signals; already completed calls stay completed. Handle rejection in the app; do not retry a whole flow automatically or imply durable/resumable execution.

## Diagram context and privacy

Every builder method accepts a final `{ title, description }` argument (`FlowDisplay`): third for `jev`, `task`, `if`, `branch`, `parallel`, and `output`; fourth for `map` and `loop`. Title: 1–120 characters; description: 1–600; supplied text must be nonblank. Titles change display text, not IDs, outcomes, questions, or execution. These are static developer-authored explanations, not model reasoning.

Titles/descriptions, flow names, step IDs, lane names and outcome names are structural metadata and are **not request-redacted**. Keep them static and public-safe. Request state/answers and output values use capture limits/redaction. Rule literals also use the configured redaction callback with paths beginning `['conditions', stepId]` and ending in `'value'`; preserve the app's redaction policy. Redaction never changes execution. Unreleased source adds `redact(path, value, context)` with a frozen `CaptureContext.kind`: `request`, `response`, `step-data`, `condition-rule`, or `outcome`. Preserve the first two arguments and existing paths. Use the kind only when the app needs different policies for colliding paths. Consult the [complete path/context table](https://github.com/diegoag64/jev-devtools/blob/main/docs/integration.md#capture-paths-and-context). Request/response paths remain body-relative even inside map/loop runs. Flow data/outcomes add `steps`, collection ID, `items`, and string index for each nesting level; nested rule paths use collection ID and `items` without an index. Policies must be deterministic because unchanged captures are cached. Callback values are bounded detached views: identity policies retain shallow data with explicit omission warnings, root replacements still run, and reading omitted fields fails the capture closed. Arrays retain their original length; oversized mutable image bytes are guarded while captures retain references/sizes. Preserve these guards when adapting policies instead of treating omitted content as absent. Verify the installed declarations before using the third argument in a released package.

Outcome `FlowRun.captureWarnings`, rule `FlowNode.conditionCaptureWarnings`, and step `FlowStep.captureWarnings` describe capture limitations independently, including nested runs. Warned captures are unsuitable as complete originals. Missing fields on older captures mean unknown completeness; do not infer control metadata from strings such as `[truncated]`. Strings retain up to 16,000 characters, arrays/general objects 150 entries, within depth-12 and approximate 96,000-character budgets. The drawer displays warnings beside values; execution remains unchanged. Custom redactors should return replacements, not mutate in place, for reliable warning detection. Fixtures only store Jev responses and trace warnings, not outcomes or rules.

Structured condition rules also have a 128-node projection budget. Exceeding it retains `conditionCaptureWarnings` before server capture; it does not change execution. Unsupported rule literals likewise carry an explicit warning.

The condition card separates incoming captured answers from requirements, e.g. **Ready: 94% → At least 90%**. Its result comes from the actual recorded decision, not a fresh evaluation of redacted data. Evicted/missing answers and flow-input/parallel aggregate references show **Not captured**. Do not promise that every runtime value is retained. Full technical rules appear in selected-step details: select a card, then open **Show details** in the bottom bar. This panel starts collapsed and supports vertical pointer/keyboard resizing; selection changes preserve its size.

History is bounded in process (default 50 runs, maximum 200, independently from request history). Capture and display default off; disabled recording does not disable flow execution. Keep flows server-side in production too if application behavior depends on them. This is not a persistent or distributed workflow engine, and large flow canvases are not virtualized.

## Verify without inference

Use a **separate, visibly labeled sample client** from the same inspector. Do not replace the user's live client or routes. With the `reviewFlow` above, this fixture exercises the actual SDK and flow executor:

```ts
import * as zlib from "node:zlib";

const sampleJev = inspector.createClient(
  {
    apiKey: "sample-only",
    logLevel: "off",
    fetch: async (_url, init) => {
      const bytes = new Uint8Array(
        await new Response(init?.body).arrayBuffer(),
      );
      const encoding = new Headers(init?.headers).get("content-encoding");
      const body = JSON.parse(
        encoding === "zstd"
          ? zlib.zstdDecompressSync(bytes).toString()
          : encoding === "gzip"
            ? zlib.gunzipSync(bytes).toString()
            : new TextDecoder().decode(bytes),
      );
      const answers = Object.fromEntries(
        Object.keys(body.questions).map((name) => [
          name,
          { type: "noul", noul: name === "risky" ? 0.1 : 0.94 },
        ]),
      );
      return Response.json({ model: "jev-sample", answers });
    },
  },
  { label: "Flow setup verification", source: "sample" },
);

const result = await reviewFlow.run(
  { message: "Sample ticket" },
  {
    client: sampleJev,
    devtools: inspector,
  },
);
// Expect outcome 'ready', value.readiness 0.94, and three captured calls.
```

Run this inside the application process serving the inspector, using a temporary development-only handler or the app's existing harness. A separate CLI has separate history. Mount the same root drawer; the existing base route must forward `/flows/events` as well as `/events` and `/clear`. The Next optional catch-all already does this.

Check these observable results:

- The Flows view shows two parallel requests, their join, one downstream readiness request, a condition and two possible outcomes. Three real SDK calls use the local fixture; no inference network call occurs.
- The join waits for both lanes. The chosen output is `ready`; `manual-review` is marked untaken. Incoming readiness is 94%, the requirement is at least 90%, and each request opens its captured details.
- Change only the fixture's `ready` probability to `0.4`: the other outcome executes. Missing values must not silently become zero. Use the app's error/cancellation harness if it has one.
- App typecheck/build passes, `/flow` and `/server` stay out of client bundles, and production disables inspector endpoints/display while the application's flow still executes. Do not call live inference just to verify this.

If the flow executes but details are absent, check: `devtools` passed to `run`, `client` from that same adapter, same process/session, capture enabled, `/flows/events` forwarded, and histories not cleared/evicted. A plain SDK client can produce flow states but cannot link request details. See [verify.md](verify.md) for general endpoint checks.

To check routing without a key, copy the run's fixture with **Copy fixture** in the Flows run header. Replay it in a test with `flow.run(input, { client: replayClient(fixture) })` from `jev-devtools/flow`. Steps in map items and loop iterations are keyed `parent-id/index/step-id` (map item or loop iteration); tasks run again on replay. A missing-step error names the composed id of the step the fixture lacks; see the [flow guide](https://github.com/diegoag64/jev-devtools/blob/main/docs/flows.md#replay-a-run-in-tests) for limits.

To check a prompt or model change against saved cases, use `compareWithFixture(flow, input, fixture, { client })` from `jev-devtools/flow` and print `formatComparison` for each case where `comparison.changed || comparison.answers.some((a) => a.changed)`. Item steps are reported under their composed ids, and tasks run on both sides.

Remove temporary verification routes unless requested as a demo. Report the installed version, integration location, outcomes observed, whether browser checks were performed, and that responses were samples. Never equate sample verification with live-model correctness.

## Function steps and runtime requests (0.4.0)

Use `task()` for application-owned server work and the request-factory overload of `jev()` when later questions depend on earlier results. Both are part of 0.4.0.

- `flow.task(id, { input, run, timeoutMs? }, display?)`: resolve nested input references, run server code, and return a typed reference. `run(input, { signal, runId, stepId, executionId })` may return a value or Promise. Inputs/outputs must be plain JSON-compatible values; return null rather than undefined. Task input literals with own symbol keys (including nested objects and arrays) fail during definition; referenced values are checked before the callback runs. No implicit retry.
- `flow.jev(id, { input, request: resolved => ({ state, questions, ...sdkOptions }) }, display?)`: construct a synchronous SDK request at execution time. Do asynchronous work in a preceding task. Keep Jev calls here to retain full linked diagrams. Never return unresolved flow references or a Promise from the factory.
- Every Jev step also has `.answers`, a typed reference to the complete answer map. Pass it to a task when a request factory generates question names dynamically; do not create new `.answer()` references inside a runtime callback.
- Neither callback executes at definition time. Runtime input snapshots protect previous values from mutation. Task timeouts/cancellation stop downstream work and signal the callback, but cannot undo side effects or forcibly interrupt synchronous code.
- Captures show function inputs/outputs under `steps.<id>.data.input/output` redaction paths, with warnings for truncation. Only error names are exposed. Definition descriptions remain static public-safe metadata. Remote function calls are ordinary server fetches, not code serialized to another machine.
- For verification, follow actual answers into a task and a subsequent generated request; confirm the latter's criteria and trace link, then inspect redacted task data. Use the synthetic playground Functions scenario for a no-key example.
- Use `map()` for bounded collections and `loop()` for stateful iteration. There is no `flow.repeat`, distributed worker API, or durable job store.

## Dynamic collections: `flow.map()` (0.4.0)

`flow.map(id, { items, input, concurrency?, maxItems }, buildItem, display?)` runs a bounded item program over an array; concurrency defaults to 4. Items may be literals, a whole-array reference, or nested object/array templates containing references. Its builder receives `item.input` shaped as `{ item, index, context }`, with item type `I` for whole-array references/scalar arrays or `Resolved<I>` for literal/template items; `context` resolves the explicit `input` option. Return a typed expression from the item builder. Use `if()` for returning paths or tasks for deterministic value-producing routing; direct terminal output/branch calls, loops inside maps, and nested maps are unsupported. Definition errors for direct terminals identify the containing step, body or path, and operation. Parallel lanes inside value-returning bodies may still use terminal outputs and branches as lane values. Unreleased scope-specific types reject unsupported methods; runtime checks still validate definition construction. Pass outer references through `input` rather than capturing them directly in the item builder. Results preserve array order. An empty array makes no calls. Concurrency is 1–16 per map, maxItems is required (1–64), definitions including templates are capped at 256 nodes and execution at 1,024 expanded nodes. Exceeding bounds fails without truncation. Failures abort siblings and block queued work; no automatic task retries or partial results. Remote cancellation remains cooperative.

Choose an item in the collection card, then **View Flow** to expand its full request/function diagram directly underneath on the same canvas. Changing the selector replaces the inline item flow; **Hide Flow** collapses it. Item values use bounded/redacted capture; don't put runtime data in structural titles. For an executable sample without local setup, open [RAG passages](https://playground.jevtools.dev/?cookbook=rag-passages). Its repository README records source fidelity. Do not promise embedding search or LLM generation in that sample: it uses fixed retrieved passages, synthetic Jev scores and a deterministic excerpt preview.

For a finite chat feed, consult `cookbooks/twitch-chat-filter/README.md` in the repository. Preserve its 29 messages, concurrency-eight input-order map, one category Choice plus toxic/spoiler Nouls per request, and precedence: toxic ≥ 0.70 hides; category hide wins next; spoiler ≥ 0.70 blurs; remaining category action follows. Quiet reapplication reuses answers without requests. The port uses synthetic fixtures and excludes ongoing Twitch ingestion.

For independent candidate scoring followed by sorting, use the repository's `cookbooks/reranking` sample at [the hosted playground](https://playground.jevtools.dev/?cookbook=reranking): one query, a 30-candidate authored retrieval fixture, a bounded map with 12 concurrent Noul requests, and a stable descending sorting task. Preserve retrieval order for ties; these independent probabilities are not Choice confidence or a normalized distribution. BM25, CLERC evaluation and live inference are excluded.

The checkout also contains `cookbooks/pre-parsed-extraction` at [the hosted playground](https://playground.jevtools.dev/?cookbook=pre-parsed-extraction): preserve sequential helper requests with map concurrency 1, runtime candidate choices, amount-dependent Noul instructions, strict credit `> 0.5`, and empty/none parsing bypasses. Its phone and decimal-string normalization tasks execute locally against fixed documents and synthetic answers.

For selected-argument routing, read `cookbooks/function-calling/README.md` in the repository checkout. The sample at [the hosted playground](https://playground.jevtools.dev/?cookbook=function-calling) uses one batched request and deterministic omit/fill tasks. Preserve the distinction between selected-label probability, argument decision products, call minimum decision mass and SDK Choice confidence. Its output is a proposed call; executing a tool requires a separate application action.

For sequential repeated assessments, the repository’s `cookbooks/consistency-choices/README.md` uses `map` with concurrency one and 15 requests. Keep its original eight-question rubric, fresh uid per repeat, ordered argmax and maximum-probability gate: below 0.60 abstains; exactly 0.60 accepts. Choice confidence is separate. Fixtures are authored demonstrations, not measured consistency; provider comparisons and live inference are excluded.

## Returning conditionals: `flow.if()` (0.4.0)

Version 0.4.0 includes `flow.if()` and strict numeric `.gt()` comparisons. Use `flow.if(id, { when, then, else }, display?)` for a conditional whose value feeds shared downstream steps. Each arm returns a `FlowExpression`; only the selected arm executes. The result type is the union of both values. An arm may return an earlier expression without adding a task. `output()` and terminal `branch()` arms are rejected. Scope-local refs must not leak; consume the returned conditional reference. Conditionals may nest and run inside parallel lanes or map items.

```ts
const record = flow.if(
  "escalate",
  {
    when: flags.get("maxFieldProbability").gt(0.7),
    then: (path) =>
      path.task("strong-extractor", {
        input: document,
        run: (text, { signal }) => strongExtractor(text, signal),
      }),
    else: () => cheapRecord,
  },
  { title: "Escalate a flagged field" },
);
// `record` is available to shared tasks/requests here; output ends the flow.
return flow.output("record", record);
```

This is a fragment inside a definition with prior `flags`, `document`, `cheapRecord` expressions and an application-owned `strongExtractor`. Do not execute application side effects while defining either arm. Runtime callbacks stay on Node; this API is not remote code execution or a durable runner. Pass provider credentials server-side and propagate the signal. Failure/cancellation blocks the merge and continuation, without executing the other arm as a fallback.

The drawer generates a Selected result merge, highlights only its selected incoming path, and captures its value with normal redaction. Generated merge IDs are not an application contract; merge nodes count toward existing limits. Use a matching server/drawer build for the new `if`/`merge` node kinds. Check both paths, a boundary and cancellation with samples before live calls.

The repository's `cookbooks/sde-cascade` provides a complete example in [the hosted playground](https://playground.jevtools.dev/?cookbook=sde-cascade): cheap extraction → runtime field verification → **any per-field probability > 0.70** → stronger extractor or keep cheap → shared comparison. The overall judge is displayed but excluded from the gate. Empty fields receive only `absence_wrong`. All four cases use synthetic probabilities and local extractor fixtures; no real provider performance or original evaluation is reproduced. Do not turn on live extraction just by adding an API key.

The repository’s `cookbooks/confidence-fallback` has a sample in [the hosted playground](https://playground.jevtools.dev/?cookbook=confidence-fallback). Preserve its 75 SIC groups, API `confidence >= 0.90` gate and parent-division lookup task. Largest class probability is a separate field, not a replacement for confidence or a Score. Verify below/equal/above boundary cases and one request on both routes; fixtures are synthetic and do not evaluate SEC filings.

## Bounded loops: `flow.loop()` (0.4.0)

Use `flow.loop()` to carry JSON-compatible state across bounded iterations. Literal initial state, whole-state references and nested reference templates are supported. Whole-state references and scalar initial values preserve their `S` payload, including generic types. For literal/template state, the gate, iteration, body return and final result use `Resolved<S>`, preserving branded primitives: for `initial: { count: flow.input.get("count") }`, task callbacks receive numeric `state.count` and can return `{ count: state.count + 1 }`. Expression methods belong on builder references, not resolved task values. Syntax:

```ts
const final = flow.loop(
  "repeat",
  {
    initial: { count: 0 },
    input: { increment: 1 },
    while: (state) => state.get("count").lt(3),
    maxIterations: 3,
  },
  (iteration) =>
    iteration.task("advance", {
      input: iteration.input,
      run: ({ state, context }) => ({ count: state.count + context.increment }),
    }),
  { title: "Count up to three" },
);
return flow.output("done", final);
```

The predicate/body callbacks build once and must not perform side effects. `while` returns an expression of its own state; pass needed outer values into the initial state. It is checked before every iteration, including the first and after the last allowed body. Initially false means zero iterations. `iteration.input` provides `{ state, index, context }`, with zero-based index and context from explicit `input`. The body returns the same state type as an expression; state/context must be JSON-compatible. Use tasks to compute application predicates and `if()` for returning paths. No outer-scope references or terminal outputs inside the body.

Require `maxIterations` (1–64). If the condition is still true at the limit, `FlowLoopLimitError` rejects the run, records an incomplete loop and blocks continuation. Runtime errors expose the failing loop ID as `stepId` and in the message. The zero-argument constructor remains supported with an undefined `stepId`. Captured error fields keep only the error name; preserve that boundary when handling or displaying failures. Never present the last state as a completed classification. Preserve completed iteration details on errors/cancellation. There is no durable execution, resume or automatic task retry.

Loops may contain one level of map, plus tasks, requests, conditions and parallel lanes. Nested loops, loops in maps and nested maps remain unsupported. All template nodes count toward the 256-node definition cap; the root execution shares a 1,024-expanded-step budget across iterations and collections. A fresh per-iteration budget would bypass that guarantee. Use a matching server and drawer. Loop cards reuse inline expansion/navigation: select an iteration → View Flow → select a nested frontier item if present. Input/latest state and child outcomes use normal redaction and capture limits.

`cookbooks/hierarchical-classification` has an executable sample in [the hosted playground](https://playground.jevtools.dev/?cookbook=hierarchical-classification). It follows the official executable algorithm’s **separate concurrent requests per frontier node**, despite introductory prose describing batching. Preserve geometric-mean decision-edge scores, epsilon 1e-9, single-child inference bypass, completed-leaf retention and top-k pruning. Samples are a small authored taxonomy and synthetic probabilities, not a replay of official benchmark data. Verify recovery, no-request paths, an initial leaf and intentional depth exhaustion before considering live execution.

For guardrail routing, see the repository [LLM guardrails example](https://github.com/diegoag64/jev-devtools/tree/main/cookbooks/guardrails) at [the hosted playground](https://playground.jevtools.dev/?cookbook=guardrails). It screens one input or output message with a single Noul/Score battery, then reuses that assessment in strict/permissive policy tasks. Preserve inclusive action thresholds 0.70/0.85, review 0.35, severity ≥ 2 upgrades of triggered reviews only, and support > block > review > pass precedence. Synthetic fixtures are sample-only; there is no LLM generation or live transport.

## Replay captures and compare runs (new in 0.5.0)

For human examples, see [the flow reference](https://docs.jevtools.dev/api/flow/) and [API glossary](https://docs.jevtools.dev/api/reference/#fixtures-and-comparison). These operations require 0.5.0 or later; inspect the installed declarations before using them with older packages.

1. Capture a complete run and use **Copy fixture** in the drawer. The browser-safe root export `flowFixture(definition, run, traces)` also builds a `BuiltFlowFixture` with the fixture and capture/missing-response warnings. A fixture stores captured response bodies and step IDs, not the original input or executable recipe.
2. On Node, import `replayClient` from `jev-devtools/flow` and call `await program.run(originalInput, { client: replayClient(fixture) })`. Use the same recipe, input, and stable step IDs. Jev steps use stored answers without a key/network call; tasks and runtime request factories still execute. Avoid uncontrolled effects in test tasks.
3. For an explicitly requested live comparison, import `compareWithFixture` and `formatComparison` from `jev-devtools/flow`. Call `await compareWithFixture(program, originalInput, fixture, { client: liveClient, devtools: inspector, tolerance: 0.01 })`, then use `formatComparison(result)` for text. Do not run live comparison merely to verify installation; use stored SDK responses for ordinary verification.
4. Tasks execute on both sides. `changed` tracks outcomes, values, decisions, and executed Jev steps; answer drift alone does not set it. Inspect `answers` separately, and apply numeric tolerance only to answer fields. The result's `liveFixture` contains unredacted live responses: review it before saving or sharing. Replay is not rollback, and incomplete captures cannot recreate missing inference results.

For the repository sample at [the hosted playground](https://playground.jevtools.dev/?cookbook=parallel-questions), preserve the five batched requests followed by five 13-item maps with `concurrency: 1`. Choice comparisons use maximum probability, independently of confidence; Score is divided by its top level. Keep the authored document and synthetic answers labeled. The sample provides no usage, cost or model timing data; local drawer durations are not inference benchmarks. See `cookbooks/parallel-questions/README.md` in the checkout for all-answer inspection and fixture limits.

## Entity-alignment repository example

For a Score-driven matching example, see `cookbooks/entity-alignment/README.md` in the repository checkout and [the hosted playground](https://playground.jevtools.dev/?cookbook=entity-alignment) in the hosted playground. Preserve the source nearest-level rule: Score < 0.5 leaves unlinked, 0.5 ≤ Score < 1.5 requests curator review, and Score ≥ 1.5 proposes sameAs. The three companion Nouls explain field agreement; Score confidence and probabilities are separate evidence, not additional routing gates. The sample uses four attributed pairs and authored synthetic responses, returns proposals without database writes, and is not included in the npm package.

## Citation-checking example

When adapting citation checks, preserve the distinction between an absent quoted string (fabricated, zero Jev calls, null confidence) and a null quote (assess the named source section). Normalize and locate quotes in a task, then use `if()` to conditionally assess support with Choice. Route on returned API confidence `>= 0.80`, independently of option probabilities. The repository-only `cookbooks/citation-checking` example demonstrates these boundaries at [the hosted playground](https://playground.jevtools.dev/?cookbook=citation-checking) with pinned RFC/citation assets and synthetic responses; its code and fixtures are not shipped in the package.

### Line-search cookbook in the repository

For a complete tagging → runtime request → ranking/lookup → branch example, use `cookbooks/line-search/README.md` at [the hosted playground](https://playground.jevtools.dev/?cookbook=line-search). Preserve one Choice + Noul request per search and document-local line IDs. Route only on Noul existence: `>= 0.70` answered, `< 0.35` absent, otherwise partial. Choice probability and API confidence have separate meanings. The pinned document is complete; responses are synthetic and the server accepts fixed sample queries only. The application result exposes every option beyond bounded DevTools previews.

### Date extraction sample

The repository’s `cookbooks/date-extraction` runs at [the hosted playground](https://playground.jevtools.dev/?cookbook=date-extraction) with synthetic responses only. Preserve the seven Choice questions per role, fixed 2026-07-30 reference date, strict earlier-than-today-minus-31-days missing-year rollover, and Monday-based current/next week conventions. Assemble calendar dates in a task and return ISO strings or `null` across flow boundaries. Route on the minimum available confidence among consumed parts, separately flagging unavailable used confidence for review; label probabilities do not substitute for Choice confidence. The README documents the stricter missing-confidence policy and invalid leap-day handling relative to the source. Verify calendar boundaries, `< 0.60` routing and one request per role before adapting the server transport.

For the repository's `cookbooks/consistency-nouls` sample ([the hosted playground](https://playground.jevtools.dev/?cookbook=consistency-nouls)), preserve fifteen sequential requests with fourteen Nouls each: `< 0.30` means no, `> 0.70` yes, and both boundaries belong to uncertain. Its tasks compute decisions and descriptive statistics from authored fixture values. Keep deterministic UID variation distinct from independent model draws; no measured consistency or provider comparison is reproduced. The per-run transport records returned models separately from the requested alias; unavailable metadata stays null.
