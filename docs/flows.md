# Define and inspect connected Jev calls

The flow API was introduced in **0.3.0**. This guide covers **0.4.0**, including function steps, runtime requests, collections, returning conditionals, and loops. Existing single-request integrations remain supported; adopting flows is optional. For publication status, check the [changelog](../CHANGELOG.md#040--october-24-2026-experimental).

Start with the [integration guide](integration.md) or [Next.js setup](nextjs.md) to mount the drawer and expose the shared inspector. For coding agents, the [bundled flow recipe](../packages/jev-devtools/skills/setup-jev-devtools/references/flows.md) includes a complete parallel-checks → decision → branch example and no-key verification. It ships with npm for offline, version-matched use.

The examples below import `@typesafe-ai/sdk` question helpers; declare it as a direct dependency in the server workspace (0.4.0 requires SDK `>=0.7.0 <0.8.0`, verified with 0.7.0). Keep API keys and both `/server` and `/flow` imports in Node code.

`jev-devtools/flow` is a TypeScript/Node entry point. A definition builds an inspectable, bounded graph once; each `run()` executes an independent instance. This is an in-process helper for Jev calls and application-owned function steps. Tasks can execute server code with side effects; the runner does not provide durable execution or rollback.

```ts
import { choice, noul } from "@typesafe-ai/sdk";
import { defineJevFlow, all } from "jev-devtools/flow";
import { createJevDevtools } from "jev-devtools/server";

type Ticket = { message: string };
const inspector = createJevDevtools({
  enabled: process.env.NODE_ENV === "development",
  origin: "http://localhost:3000",
});
const client = inspector.createClient({ apiKey: process.env.TYPESAFE_API_KEY });

const refundFlow = defineJevFlow<Ticket>("refund-review", (flow) => {
  const triage = flow.jev("triage", {
    state: flow.input,
    questions: { category: choice("Refund request?", { refund: null, other: null }) },
  });
  return flow.branch("refund-request", {
    when: triage.answer("category").choice.eq("refund"),
    then: (branch) => {
      const review = branch.jev("review", {
        state: { ticket: flow.input, category: triage.answer("category").choice },
        questions: { eligible: noul("Eligible?"), risky: noul("Risky?") },
      });
      return branch.branch("approval", {
        when: all(review.answer("eligible").noul.gte(0.9), review.answer("risky").noul.lt(0.2)),
        then: (path) => path.output("approve", { eligibility: review.answer("eligible").noul }),
        else: (path) => path.output("manual-review"),
      });
    },
    else: (branch) => branch.output("other"),
  });
});
const abortController = new AbortController();
const result = await refundFlow.run({ message: "Please refund my duplicate charge." }, {
  client,
  devtools: inspector,
  signal: abortController.signal, // optional
});
// { runId, outcome: "approve", value: { eligibility: 0.94 } }
// Your application decides what to do with the outcome. No refund is executed.
```

Mount the existing `<JevDevtools enabled={...} />` and serve the inspector endpoint as in the [integration guide](integration.md). In Next.js, define and run the flow in Node server code; keep the drawer in its existing client component. Do not import `/flow` into the browser.

## Operations and references

- `jev(id, request)` queues one ordinary SDK `systemOne` call. Preserve SDK questions, model selection, assets, and multiple questions. `state` may contain nested expressions. SDK assets remain SDK assets; the flow does not invent another question format.
- `flow.input` references the run input. Use `flow.input.get("message")` for typed fields. Answer names and fields come from the supplied questions: Choice labels/probabilities, Score numbers/legend, Noul probabilities, and Box coordinates/confidence. Use `.get(key)` to select nested fields.
- Scalar references support `.eq(value)`. Numeric references support `.lt(value)`, `.gt(value)`, and `.gte(value)`. `all`, `any`, and `not` compose Boolean expressions. There is no `eval`, arbitrary predicate callback, or CEL interpreter. All operands are evaluated; a missing value is an error even if another operand would short-circuit. Equality requires matching scalar types; ordering requires finite numbers.
- `branch(id, { when, then, else })` is terminal in its block. Both synchronous callbacks build possible paths; exactly one executes. Each path must return its terminal `output()` or nested `branch()`. For paths that return values and continue into shared work, use `flow.if()`.
- `output(name, value?)` returns a named outcome and optional resolved value. Output names are also node IDs, so they must be unique across the definition. This is data, not an action.
- IDs are unique across the whole definition, including untaken paths and parallel lanes: 1–80 letters, digits, `_`, or `-`, starting with a letter or digit. Definitions are limited to 256 nodes, including map/loop templates, and 16 nested blocks. Runs share a 1,024-expanded-node budget. Use `flow.loop()` for bounded stateful iteration.

Definitions are synchronous and make no SDK calls. Plain request/value templates are copied at definition time. Treat SDK asset instances as immutable. References from another definition, a sibling lane, or a branch-local scope cannot be used outside their available scope. Structural validation happens while defining, before any run can dispatch; input-dependent missing values and invalid comparisons fail when reached during execution.

Question/answer reference types are inferred. `run()` returns `{runId, outcome: string, value?: unknown}` in v1: supplying `defineJevFlow<Ticket>` keeps the input ergonomic, but does not infer a discriminated union of all terminal values. Narrow the returned value in application code.

## Function steps and runtime requests

Function steps and runtime request factories are included in **0.4.0**. Existing static requests and flow behavior remain supported. They run on Node; never import `/flow` into a browser component.

`task(id, { input, run, timeoutMs? }, display?)` executes a server function after its dependencies. Nested references in `input` resolve to ordinary values. The callback's return type becomes a typed `FlowExpression`, so its fields can feed another task, request, condition, or output. The optional third argument uses the same static `title` and `description` as other steps.

```ts
const shortlist = flow.task("shortlist", {
  input: { probabilities: ranking.answer("skills").probabilities, limit: 3 },
  run: ({ probabilities, limit }) => Object.entries(probabilities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name]) => name),
}, {
  title: "Keep the top skills",
  description: "Application code sorts the probabilities before another assessment.",
});

const selection = flow.jev("select", {
  input: { message: flow.input.get("message"), skills: shortlist },
  request: ({ message, skills }) => ({
    state: { message, skills },
    questions: {
      selected: choice("Which skill fits best?",
        Object.fromEntries(skills.map((name) => [name, null]))),
    },
  }),
}, { title: "Assess the shortlist" });

return flow.output("suggestion", selection.answer("selected").choice);
```

Here `ranking` is an earlier Jev request with a Choice question named `skills`. This is a minimal API illustration, not the complete official skill-suggestion cookbook.

Factory inputs use the same JSON-compatible snapshot contract as tasks. Construct SDK assets inside the factory when needed, rather than passing asset instances through its inputs. A request factory is **synchronous**: return an ordinary SDK request, with no unresolved expressions. Use a preceding task for asynchronous work. The runner makes the SDK call through the supplied client, so retries, request linkage, questions, and answer inspection remain intact. No factory runs during definition. Referenced question names are checked against the generated request before dispatch. Known keys retain inference; genuinely dynamic keys require runtime checking. The factory has no separate diagram node; its resulting Jev request is the visible step. `request.answers` is a typed reference to its complete answer map: pass it to a task when keys such as `fits::<skill>` are generated at runtime. `request.answer("known-key")` still provides individual field references.

Tasks may be synchronous or asynchronous. The second callback argument is `TaskContext`: `{ signal, runId, stepId, executionId }`. A task can call a remote service with ordinary server code:

```ts
const evaluation = flow.task("external-evaluation", {
  input: { document: flow.input.get("document") },
  timeoutMs: 30_000,
  run: async (input, { signal }) => {
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok) throw new Error("Evaluation failed");
    return response.json();
  },
}, { title: "External evaluation" });
```

`serviceUrl` and any credentials belong to trusted server configuration. Functions/closures are never serialized to the browser or uploaded for remote execution. Keep Jev calls in `flow.jev()` when they need their own linked request diagram; arbitrary calls hidden inside a task are not automatically modeled as child flow steps.

### Task values, lifetime, and capture

- Inputs and outputs must be JSON-compatible: null, booleans, finite numbers, strings, arrays, and plain objects. Return `null` for no value. Undefined, functions, dates, class instances, BigInt, cycles, and nesting beyond 40 levels fail rather than being silently converted. `Resolved<T>`, `FlowTask`, `FlowRequestFactory`, and `TaskContext` are exported types. JSON validity is also checked at runtime.
- Each callback receives detached input data. Its output is snapshotted before downstream use. Mutating callback inputs or retaining/mutating a returned object does not rewrite earlier state or captured previews.
- A timeout must be a positive integer no larger than 2,147,483,647 milliseconds. There is no default timeout or automatic task retry. A timeout fails the step with `TimeoutError`; cancellation records `cancelled`. Dependent steps do not run. Late fulfillment/rejection cannot resurrect a completed, failed, or cancelled run.
- Abort signals are cooperative. The runner can stop waiting for asynchronous work that ignores a signal, but cannot kill arbitrary JavaScript, undo side effects, or guarantee remote cancellation. CPU-bound work blocks the event loop until it returns; a result returned after its timeout is rejected. Use a worker/service for expensive computation.
- Task cards show their status, duration, and returned value as typed, collapsible properties. Nested objects and arrays expand on demand; long values and additional properties stay accessible in a bounded scroll area. Select one for expandable inputs/outputs and capture warnings. Conditions referencing task results read the **redacted captured output** in the viewer.
- Task input/output capture uses the existing size/depth limits and default secret-key redaction. Custom redaction paths start with `steps`, the step ID, `data`, then `input` or `output`. Capture truncation/redaction never changes the value executed or returned. Capture failures suppress the data and do not fail the task. Only error names are recorded; exception messages/stacks remain server-side.
- The wire format adds an optional task kind/data to version 1. Existing captures remain readable; use the matching updated drawer for function previews. Dynamic fan-out is provided by the `map()` API below. Stateful iteration is provided by `loop()` below. These APIs do not add persisted jobs, distributed execution, or automatic deployment.

### Try the local sample

From the repository root run `npm run dev`, open `http://127.0.0.1:4182/`, and select **Flow · Functions + dynamic questions (synthetic)**. Run the sample, open **Jev DevTools → Flows**, and select **Keep the top three skills**. Inspect its output, then the next request's three Choice criteria. Both model responses are synthetic fixtures; no API key or remote call is required. This demonstrates the API, not a faithful port of the official cookbook.

## Explain steps in the diagram

All builder methods accept an optional final display argument: `{ title, description }`. It is the third argument for `jev`, `task`, `if`, `branch`, `parallel`, and `output`, and the fourth for `map` and `loop`.
Use it to explain the purpose of a request, a condition, a parallel join, or an outcome:

```ts
path.output("ready-output", { eligibility: checks.eligibility }, {
  title: "Ready for approval",
  description: "Readiness is at least 90%. Return the checks to the application for its next action.",
});
```

For an output with no value, pass `undefined` as the second argument. The same pattern works with `jev(id, request, display)`, `branch(id, paths, display)`, and `parallel(id, lanes, display)`. `FlowDisplay` is exported from `jev-devtools/flow`.

Titles accept 1–120 characters; descriptions accept 1–600. Supplied text must be nonblank and is trimmed and copied when the definition is built. Existing calls and older captures continue to use step IDs when no title is provided. IDs, returned outcome names, SDK requests, and routing behavior are unchanged. This is developer-authored context, not model reasoning or extra instructions sent to Jev.

Cards preview the description; select a step and open **Show details** in the bottom bar to read its full text. The panel starts collapsed, scrolls independently, and retains its height while switching steps or hiding/reopening it. Drag its top divider vertically, or focus the divider and use Up/Down (Shift for larger steps), Home, or End. Resizing leaves space for the canvas. Output cards identify the returned outcome versus an untaken route, and show the then/else route. Parallel cards show each lane's recorded status and a completion count; select one for the full lane list when there are more than four.

Titles and descriptions are definition metadata and are **not passed through request redaction**. Write static, public-safe explanations; never interpolate user inputs, credentials, or other secrets.

## Parallel calls and the join

Steps in a block are sequential. Explicit named lanes overlap; their result references become available only after all lanes complete:

```ts
const reviewFlow = defineJevFlow<Ticket>("parallel-review", (flow) => {
  const checks = flow.parallel("checks", {
    eligibility: (lane) => lane.jev("eligibility", {
      state: flow.input,
      questions: { eligible: noul("Eligible?") },
    }).answer("eligible").noul,
    risk: (lane) => lane.jev("risk", {
      state: flow.input,
      questions: { risky: noul("Risky?") },
    }).answer("risky").noul,
  });
  const decision = flow.jev("combined", {
    state: { ticket: flow.input, eligibility: checks.eligibility, risk: checks.risk },
    questions: { ready: noul("Ready?") },
  });
  return flow.output("reviewed", { readiness: decision.answer("ready").noul });
});
```

Each lane returns an expression. The join exposes a named reference with that expression's type. Lane-local references cannot escape directly or be consumed by a sibling; use the returned `checks` references. The diagram's parallel node represents the join, with incoming edges from lane tails.

## Errors, cancellation, and recording

The flow preserves SDK retries within each Jev step and adds no flow retries. Failed work blocks dependents. A failed parallel lane aborts sibling calls, waits for them to settle, then rejects with the first failure. An external abort propagates through SDK request signals and rejects; work already completed remains completed. Untaken branches remain untaken. Remaining unreachable work is blocked on failure or cancelled on external abort. Successful steps record duration and decision nodes record the evaluated Boolean independently of captured/redacted answers.

`run()` works with an ordinary SDK client and no inspector, or a disabled inspector. To link nodes to request details, pass a client created by the **same** inspector. A plain client still executes and records flow-level states when an inspector is supplied, but there is no request capture to link. For custom session scoping, wrap `run()` in the inspector's existing `inspector.run(request, callback)` helper.

Definitions and runs are separate schema-version-1 records. Each definition instance has a unique ID; re-defining it creates a new identity (including hot reload). Each run and each potential step have independent IDs. The flow stream sends retained order, changed runs, and newly encountered definitions; reconnect receives a full retained snapshot. It uses the same origin, authorization, and server-derived session gates as requests.

The existing `limit` bounds flow-run history independently from request history (default 50, maximum 200). Definitions are pruned when no retained run references them. Clear affects both histories and cannot resurrect an in-flight cleared run. Requests can be evicted before their flow; the overview then explains that details are unavailable. Capture, transport and parsing continue while the drawer is closed; its React work remains suspended.

Definition captures contain structural IDs/dependencies and parallel lane names and condition expressions. New captures include bounded rule literals, processed by the configured redaction callback under `conditions.<step-id>…`; older captures keep literals hidden. State, questions, probabilities, and images stay in the ordinary bounded/redacted request captures. Outcome values use the existing redaction/size limits. Decision results are actual execution facts; they are not recalculated from snapshots. Step IDs, flow names, output names, and branch decisions are structural metadata: do not put secrets in their names. Errors show error classes rather than possibly sensitive application messages.

## Drawer and samples

Choose **Flows** after capturing a run. Captured Jev calls render their existing request diagrams together on **one canvas**: state, instructions, the selected question's answer, probabilities and output branches. Each request keeps its question picker, Show More and complete probability table. Long input previews remain bounded; expand **Show details**, then **Inspect request** opens Questions/Context/Transport/Raw for the full captured details.

Arrows connect requests, conditions and outcomes in execution order; redundant transitive edges are omitted so they do not cross intervening steps. Parallel paths converge at **Wait for both checks** (or **Wait for all N paths**), showing their lane names. Selecting it explains that downstream calls wait until every lane succeeds, and that the marker does not make another Jev call. Untaken, waiting or evicted requests show an explicit placeholder rather than invented content.

The view starts focused on the first Jev request. Use the **Step** picker or **Focus step** to frame a request, and **Fit flow** for the whole graph. All diagrams share pan/zoom; there are no nested cameras. Opening Flows pins the displayed run. Camera, run/node selection, question selection and expanded categories survive incoming updates and closing/reopening. Switching runs starts a new view. Resizing a request updates the layout without resetting the camera.

Run `npm run dev` and choose the Flow samples: Approve, Manual review, Other, Parallel checks + join, Failed review, and Slow call (then press Cancel). These are fixed samples and never use live inference.

Local verification/scaling harness (no hosted benchmarks):

```sh
npm run build:package
node --import tsx benchmarks/flow-server.mjs  # http://127.0.0.1:4230
# In another terminal:
node scripts/verify-flows.mjs
node benchmarks/flows-isolated.mjs
```

The new-flow scaling suite measures 11/51/151-node linear graphs and 200 retained 11-node runs, opening and keyboard pan CPU in isolated Chromium. It is not a before/after optimization claim. For existing request regressions, use `BENCH_SUITE=rerenders npm run bench:compare -- main` and keep those findings separate. Generated data and screenshots stay in ignored `benchmarks/results/`; report comparisons and limitations in the PR.

Version 0.4.0 includes tasks, runtime request factories, maps, returning conditionals, and loops. It does not include a standalone viewer, durable execution, cross-process coordination, or distributed persistence. Tasks run application-owned code and may have side effects; the runner does not deploy services or provide rollback. A run belongs to one process and its supplied SDK client. Large flow canvases are bounded, not virtualized. They mount the retained request diagrams; CSS content visibility skips offscreen layout/paint where supported while preserving local controls. This uses more DOM and memory than status cards. Only the selected full tabbed inspector mounts; all captured answers remain accessible through each request’s question picker and the Questions tab.

### Structured content in request cards

State and instruction objects show their top-level properties, with nested objects and arrays collapsed by default. Numbers, booleans, nulls, and text have distinct styling. Expand a property to inspect its children; collections initially render 12 entries and offer more in batches. Long strings offer **Full text** / **Less text**. Content scrolls inside the card without zooming or moving the diagram, and expansion survives closing/reopening the drawer. Displayed values come from the captured snapshot; existing redaction and capture limits still apply. JSON stored as a string remains text, without coercing its type.

### Branch rules

Condition cards separate **Incoming value** from **Requirement**, alongside your authored description. For example, `decision.answer("ready").noul.gte(0.9)` shows **Ready: 94%** (using the captured answer) and **At least 90%**. The selected-step details retain the technical rule `combined.ready ≥ 90%` when the request step ID is `combined`. Comparisons preserve their operators and AND/OR/NOT grouping. The condition's recorded decision shows **then** or **else**; the viewer never re-evaluates a rule against potentially redacted snapshots. Selecting the card and opening **Show details** reveals its full captured rule; the card itself previews three lines.

Rule literals now appear in captures, including numeric thresholds and string comparison labels. They use the existing capture limits and `redact` callback, with paths prefixed by `["conditions", stepId]`; a literal's final path segment is `value`. For example, return `"[redacted]"` whenever `path[0] === "conditions" && path.at(-1) === "value"` to hide all rule literals. Redaction/truncation is displayed explicitly and never changes execution. Rules are bounded to 128 expression nodes before capture. Existing integrations and older captures remain supported; old captures show their original rule with hidden literals.

Incoming values are read from linked, retained Jev captures and respect their redaction. Missing or evicted captures, older rule metadata, and references to flow input or parallel aggregate values that are not request answers show **Not captured**; the viewer does not collect extra runtime values or infer them from the chosen route. Duplicate input names include their source step title to distinguish them. The card previews up to three inputs; select it for the complete list and technical references. Compound requirements preserve AND/OR/NOT grouping and use the same readable input names.

## Dynamic collections: `flow.map()`

`map(id, options, buildItem, display?)` runs the same item program over an array produced at runtime. The callback builds a template once; it does not execute application work during definition.

```ts
const assessed = flow.map("assess-passages", {
  items: retrieved, // FlowExpression<Passage[]> or an ordinary array
  input: { query: flow.input.get("query") }, // explicit shared context
  concurrency: 4, // default 4; 1–16
  maxItems: 12, // required; 1–64; exceeding it fails without truncating
}, (item) => {
  const request = item.jev("assess", {
    state: {
      query: item.input.get("context").get("query"),
      passage: item.input.get("item"),
    },
    questions: { relevant: noul("Is the passage relevant to the query?") },
  });
  return item.task("result", {
    input: { passage: item.input.get("item"), relevance: request.answer("relevant").noul },
    run: (value) => value,
  });
});
// assessed is a typed FlowExpression<Array<{ passage: Passage; relevance: number }>>.
```

`item.input` contains `{ item, index, context }`; index is zero-based. Pass outer references explicitly through `input`; they cannot be captured directly inside the item builder. Each item receives a detached JSON-compatible snapshot. A template can contain tasks, Jev calls, returning conditionals and static parallel lanes, and returns an expression. The runner adds the item-result output. Terminal `output()`/`branch()` calls in the item builder and nested maps are unsupported. Use `if()` for returning paths or a task for deterministic routing that returns a value.

Results preserve input order regardless of completion order. An empty list returns `[]` and executes no item steps. The map waits for every item before advancing. A failed item aborts running siblings, blocks queued items, and prevents downstream work; external cancellation marks queued work cancelled. There is no partial-success mode or automatic map/task retry. SDK retries remain governed by the supplied client. Signals are cooperative for remote side effects; cancellation cannot undo work already performed.

Definitions are limited to 256 nodes including item templates; runs permit at most 1,024 expanded nodes including root nodes and item-result nodes. Limits reject excess work rather than silently reducing the list. Concurrency is per map, not a global provider limit across simultaneous flow runs. Stateful iteration uses the separate `loop()` API below. Neither API adds durable or distributed execution.

The collection card shows progress and an item selector. **View Flow** expands the selected item’s complete connected diagram directly below the card, linked by a labeled connector. Changing the selector or using the arrows on either side updates the inline diagram. The arrows wrap between the first and last items and are disabled for a single-item collection; **Hide Flow** collapses it. Parent and item diagrams share one canvas. Opening, switching, or collapsing an item keeps the original step positions and camera unchanged. Expanded wrappers are centered beneath their collection, with a connector to the center of their top edge and navigation arrows outside the frame. Item changes use a short directional fade/slide, disabled for reduced-motion preferences. Use **Fit flow** to bring everything—including previews extending left of the original graph—into view. Item requests have distinct execution IDs and are linked to their parent run using `map-id/index/step-id`. Only started items have a diagram; queued, blocked and cancelled-before-start items retain their status. Older captures remain readable with the matching updated drawer; this optional map metadata extends wire version 1.

Item input/output and result snapshots follow the same capture limits and redaction as other steps. Custom redaction paths are prefixed with `steps`, map ID, `items`, index before child paths. Template conditions are prefixed with `conditions`, map ID, `items`. Inputs never become structural labels. Runtime values stay untruncated; capture failures do not change execution. Clear/eviction still cannot resurrect a run.

Try the [RAG passage cookbook](../cookbooks/rag-passages/README.md) for a twelve-item sample with four concurrent requests and every passage inspectable.

## Returning conditionals: `flow.if()`

Use `flow.if(id, { when, then, else }, display?)` when one path should produce a value and **both paths continue into shared work**. `flow.branch()` still ends its block with a named outcome. Returning conditionals and strict `.gt()` comparisons are included in **0.4.0**.

```ts
const selected = flow.if("choose-extractor", {
  when: assessment.get("maxFieldProbability").gt(0.7),
  then: path => path.task("strong", {
    input: { document: path.input.get("document") },
    run: ({ document }, { signal }) => extractWithStrongModel(document, signal),
  }, { title: "Run the stronger extractor" }),
  else: () => cheapRecord, // An existing in-scope expression is valid too.
}, {
  title: "Escalate a flagged field",
  description: "Use a stronger extractor only when a field flag is above 70%.",
});
const formatted = flow.task("format-record", {
  input: selected,
  run: record => formatRecord(record),
});
return flow.output("final-record", formatted);
```

This snippet belongs inside a definition with `assessment` and `cheapRecord` references from earlier steps and application-owned `extractWithStrongModel`/`formatRecord` functions. Functions run in your Node process; they may call remote providers with server credentials and the provided signal. The flow API does not transmit executable code to Jev or add a remote job runner.

- Both callbacks define their paths once, synchronously. Only the selected path's **runtime tasks and requests** execute. Put side effects in task callbacks, never in the definition callbacks.
- Both arms must return a `FlowExpression`. Return a task result, an answer value, an earlier reference, or another `if()` result. Direct `output()` or terminal `branch()` arms are rejected; put the named output after the conditional, or use `branch()` for terminal routing.
- The result type is the union of the arm values (`FlowExpression<A | B>`). Narrow discriminated unions inside task callbacks as usual. Arm-local references cannot escape into siblings or shared code; use the returned `selected` reference.
- The diagram shows a condition, both possible paths, and an automatically generated **Selected result** merge card. Only the chosen incoming edge is highlighted. The merge captures JSON-compatible returned values under the ordinary redaction/size limits. If a direct reference cannot be captured as JSON, the viewer reports that limitation without changing the runtime value or stopping execution. A direct-return arm still connects the condition to the merge.
- The merge is a real counted node with a generated collision-safe ID; do not depend on that ID. Existing 256-definition-node, depth-16 and 1,024-expanded-node limits still apply. Returning conditionals compose with nested conditionals, parallel lanes, and collection item programs.
- Failure or cancellation prevents the merge and shared continuation. The untaken path stays untaken; no fallback, automatic retry, or error recovery is implied.
- Numeric expressions now support `.gt(numberOrReference)` for strict greater-than, alongside `.lt()` and `.gte()`. The condition card preserves the actual operator. In the SDE recipe, exactly 0.70 does **not** escalate.

New `if` and `merge` kinds extend the version-1 flow records; use the matching updated server and drawer. Older captured flows remain readable. For four complete no-key samples, see the [SDE cascade cookbook](../cookbooks/sde-cascade/README.md).

## Stateful iteration: `flow.loop()`

`flow.loop(id, { initial, input, while, maxIterations }, buildIteration, display?)` returns the final state as a typed `FlowExpression<S>`. Included in **0.4.0**.

```ts
const final = flow.loop("count", {
  initial: { count: 0 },
  input: { increment: 1 },
  while: state => state.get("count").lt(3),
  maxIterations: 3,
}, iteration => iteration.task("advance", {
  input: iteration.input,
  run: ({ state, context }) => ({ count: state.count + context.increment }),
}), { title: "Count up to three" });
return flow.output("done", final);
```

The `while` callback builds an inspectable expression **once**, using only its state reference and literal thresholds. It is not an arbitrary runtime predicate. Put computed Boolean state fields in a task when the continuation rule needs application logic. Outer step references cannot be captured by the predicate; include necessary values in the initial state. The body is also built once; execute side effects only in tasks or Jev requests.

Before each iteration, the runner checks the condition against the current state. An initially false condition runs zero iterations and returns the initial state. Each iteration sees `{ state, index, context }` through `iteration.input`; index is zero-based and context resolves the explicit `input` template. Return an expression of the same state type. Each next state is a detached JSON-compatible snapshot. Direct outer references, terminal `output()`/`branch()` bodies and non-JSON states are rejected. Use `if()` within an iteration when paths should rejoin.

`maxIterations` is required, integer 1–64. After the last permitted iteration, the condition is checked again: false means normal completion; true throws exported `FlowLoopLimitError`. The loop records `stopReason: "limit"`, keeps completed iterations inspectable, and blocks shared downstream work. A partial state is not returned as a successful final result. Task/request failures and cancellation also stop iteration. No automatic task retry, fallback, persistence or resume is added; remote side effects still require cooperative cancellation.

An iteration can contain tasks, Jev requests, `if()`, parallel lanes and **one level of `map()`**. Nested loops, loops inside maps and nested maps are unsupported. Pass outer data through `input`. Loop and collection templates count recursively toward the 256-node definition limit. The entire run shares the 1,024-expanded-step budget across sibling loops and all nested item executions; each program invocation reserves its own nodes and a map reserves all its immediate item programs before dispatch. The budget never resets at iteration boundaries. Exceeding it fails explicitly rather than truncating the work. The existing per-map concurrency limit is not a global request-rate limiter.

In the drawer, a **Loop** card shows completed iterations, the continuation rule and its stop reason. Choose **Iteration → View Flow** to reveal that iteration’s complete connected diagram underneath. Previous/next iteration arrows preserve the parent graph and camera. A collection within the selected iteration can expose its own item flow. Initial/latest states and the condition’s captured incoming values are available in Details; each iteration’s returned state is its captured outcome. Captures remain bounded/redacted, so a large state may be truncated in the inspector even though runtime execution uses the full value. Request links include both iteration and item paths and retain distinct execution IDs. New loop metadata extends version-1 records; use the matching updated drawer and server.

Try the [hierarchical classification cookbook](../cookbooks/hierarchical-classification/README.md), including beam recovery, deterministic paths, a zero-iteration leaf, and an intentional iteration-limit failure.
