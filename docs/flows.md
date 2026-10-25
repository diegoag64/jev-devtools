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
- Task input/output capture uses the existing size/depth limits and mandatory credential redaction. The default-on `redactAdditionalSensitiveData` component prop masks supported personal fields only in DevTools views, including existing nested task/collection/loop data, outcomes and linked Jev requests. Those personal values remain in captures and SSE payloads; use custom server redaction to prevent browser delivery. See the [exact policy and limits](integration.md#redaction-policy). Custom redaction stays active in both modes; paths start with `steps`, the step ID, `data`, then `input` or `output`. Capture truncation/redaction never changes the value executed or returned. Capture failures suppress the data and do not fail the task. Only error names are recorded; exception messages/stacks remain server-side.
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

Request observation is best effort: a recording hook that throws or rejects cannot replace the SDK result or its real error. Each Jev step invokes the supplied client's `systemOne` at most once; repeated or deferred observer callbacks reuse that invocation, while SDK retries remain unchanged. Custom request observers should call their callback synchronously to establish recording context. If a hook fails before calling through, the runner dispatches the request itself unless cancelled; trace linkage may be unavailable for that request.

The flow preserves SDK retries within each Jev step and adds no flow retries. Failed work blocks dependents. A failed parallel lane aborts sibling calls, waits for them to settle, then rejects with the first failure. An external abort propagates through SDK request signals and rejects; work already completed remains completed. Untaken branches remain untaken. Remaining unreachable work is blocked on failure or cancelled on external abort. Successful steps record duration and decision nodes record the evaluated Boolean independently of captured/redacted answers.

`run()` works with an ordinary SDK client and no inspector, or a disabled inspector. To link nodes to request details, pass a client created by the **same** inspector. A plain client still executes and records flow-level states when an inspector is supplied, but there is no request capture to link. For custom session scoping, wrap `run()` in the inspector's existing `inspector.run(request, callback)` helper.

Definitions and runs are separate schema-version-1 records. Each definition instance has a unique ID; re-defining it creates a new identity (including hot reload). Each run and each potential step have independent IDs. The flow stream sends retained order, changed runs, and definitions missing from that connection, including definitions first used in another session. Clear and eviction discard unused definitions on both sides; reuse sends them again when needed. Reconnect resets the browser's flow cache and receives a full retained snapshot. Slow readers catch up to current retained state and may skip intermediate updates. The stream uses the same origin, authorization, and server-derived session gates as requests.

The existing `limit` bounds flow-run history independently from request history (default 50, maximum 200). Definitions are pruned when no retained run references them. Clear affects both histories and cannot resurrect an in-flight cleared run. Requests can be evicted before their flow; the overview then explains that details are unavailable. Capture, transport and parsing continue while the drawer is closed; its React work remains suspended.

Definition captures contain structural IDs/dependencies and parallel lane names and condition expressions. New captures include bounded rule literals, processed by the configured redaction callback under `conditions.<step-id>…`; older captures keep literals hidden. State, questions, probabilities, and images stay in the ordinary bounded/redacted request captures. Outcome values use the existing redaction/size limits. Flow observers and redactors receive detached data, so in-place edits cannot change task inputs, loop state, or returned results. Unchanged data snapshots are reused across updates, and shared references reuse one detached object within each snapshot. Serialized captures still use the recorder’s existing repeated-reference marker. Non-JSON direct outputs still reach the caller unchanged, but their observer value is `[capture unavailable]`. Decision results are actual execution facts; they are not recalculated from snapshots. Step IDs, flow names, output names, and branch decisions are structural metadata: do not put secrets in their names. Errors show error classes rather than possibly sensitive application messages.

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

Condition cards separate **Incoming value** from **Requirement**, alongside your authored description. For example, `decision.answer("ready").noul.gte(0.9)` shows **Ready: 94%** (using the captured answer) and **At least 90%**. The selected-step details retain the technical rule `combined.ready ≥ 90%` when the request step ID is `combined`. Comparisons preserve their operators and AND/OR/NOT grouping. The condition's recorded decision shows **then** or **else**; the card never re-evaluates a rule against potentially redacted snapshots (see [What-if thresholds](#what-if-thresholds) for the separate replay). Selecting the card and opening **Show details** reveals its full captured rule; the card itself previews three lines.

Rule literals now appear in captures, including numeric thresholds and string comparison labels. They use the existing capture limits and `redact` callback, with paths prefixed by `["conditions", stepId]`; a literal's final path segment is `value`. For example, return `"[redacted]"` whenever `path[0] === "conditions" && path.at(-1) === "value"` to hide all rule literals. Redaction/truncation is displayed explicitly and never changes execution. Rules are bounded to 128 expression nodes before capture. Existing integrations and older captures remain supported; old captures show their original rule with hidden literals.

Incoming values are read from linked, retained Jev captures and respect their redaction. Missing or evicted captures, older rule metadata, and references to flow input or parallel aggregate values that are not request answers show **Not captured**; the viewer does not collect extra runtime values or infer them from the chosen route. Duplicate input names include their source step title to distinguish them. The card previews up to three inputs; select it for the complete list and technical references. Compound requirements preserve AND/OR/NOT grouping and use the same readable input names.

### What-if thresholds

Select a `branch()` or `if()` condition step and open **Show details** to find **What if** below its recorded decision. Each numeric threshold in the rule (`.lt()`, `.gt()` or `.gte()` against a number) gets an input prefilled with its captured value; Noul thresholds are edited as percentages. Change one to see whether the selected run would keep its recorded route or take the other one, and how many retained runs of the same definition would change. **Reset** restores the captured values. Under each input, a strip plots the recorded value from every retained run of the same definition against the threshold: filled dots pass, hollow dots fail, and the selected run's dot is ringed. Its summary line counts the values that pass and, for Noul thresholds, those within 3 percentage points of the threshold. Equal values stack in place, and a threshold edited outside the plotted range is pinned to the edge with a caret. Overrides are local to the selected run and step and are not saved.

Thresholds can compare Jev answers or the captured output of a task, a `flow.if()` result or a loop's final state. Inside an expanded map item or loop iteration, select a condition in that item's flow to replay it against that item. Its counts and strip cover every retained item or iteration of that map or loop, across the retained runs of the parent flow. Each condition replays on its own recorded values, so a changed route doesn't re-run the steps after it. The merge after a `flow.if()` copies the condition's decision and isn't counted again. A loop's `while` rule isn't replayed, because a different threshold would change how many iterations run.

What-if replays the retained request captures and captured task outputs locally. It makes no Jev calls. A run counts only when replaying it unchanged reproduces its recorded decision. Rules that reference flow input, values after a parallel join or a map's collected results can't be replayed, because those values aren't captured. Truncated rules, evicted captures, unfinished task steps, values past the capture limits and placeholder values such as `"[redacted]"` are skipped. So is the `length` of a captured list that may have been cut at its 150-entry limit, and any text from a capture whose long text was cut. A `redact` callback that rewrites a value into another plausible value (for example 0.94 into 0.9, or one label into another) can't be detected, and the replay uses that value as captured. When a new threshold flips the route, the other route didn't run in that capture, so no outcome is shown.

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

## Replay a run in tests

Unreleased: not in npm 0.4.1 yet.

### Copy a fixture from DevTools

Open **Flows**, select a finished run, then click **Copy fixture** in the run header. On success the button briefly animates and says **Copied**, then returns to **Copy fixture** after two seconds. Reduced-motion preferences disable the animation. If clipboard access is unavailable, a read-only JSON field appears for manual copying; focusing it selects the JSON. Copying is disabled while a run is pending or has no completed Jev requests.

A fixture saves the responses of completed Jev requests, not every diagram node. One response can contain several answers. For example, the refund flow records two entries: `triage` holds its category answer, and `review` holds both eligibility and risk. Conditions, tasks and flow outputs are recomputed when you replay the flow. This tests your application logic against known answers; it does not test model quality or new prompts.

Warnings about failed/cancelled runs, missing responses and capture issues remain visible so you know when an export is partial. Only successful captured responses are included; see the limitations below before relying on a fixture as a complete reproduction.

Changing the displayed capture data or masking settings clears previous copy feedback and fallback JSON. Click **Copy fixture** again to export the current view. A clipboard operation already in progress cannot restore the old fallback or replace a newer copy result; data already sent to the system clipboard is not retracted.

### One-command playground replay

After clicking **Copy fixture**, run this from the repository root on macOS:

```sh
npm run replay -- --clipboard
```

The command builds the local package, selects the flow by its fixture name, and prints the input, outcome and output value. No playground server or API key is needed. It supports the refund, parallel review and synthetic skill-shortlist examples; cookbook and custom flows still need their own definition and input with `replayClient` below. This helper runs local sample tasks and rejects unexpected `fetch` calls.

For a saved fixture (all platforms), or to check an expected outcome:

```sh
npm run replay -- benchmarks/results/my-fixture.json --expect approve
# Alternatively, read JSON from stdin:
pbpaste | npm run replay -- - --expect approve
```

`--expect` exits with code 1 if the outcome differs. For example, changing the refund fixture's `steps.review.answers.risky.noul` from `0.1` to `0.9` routes to `manual-review` and fails `--expect approve`. Missing answers and partial fixtures also fail with an explanation; failed requests are not replayed as recorded errors.

Fixtures do not include the original input. By default this helper uses `{ "message": "I was charged twice and need a refund." }`. To reproduce your original input, save its JSON to a file and add `--input path/to/input.json` (an object with a string `message`). Run `npm run replay -- --help` for options. The result prints in the terminal; this command does not add a run to the drawer.

### Use the replay client in your own tests

**Copy fixture** in a run's header exports the retained answers of its completed Jev steps as JSON, including steps inside map items and loop iterations. Save it with your tests and run the flow with `replayClient` from `jev-devtools/flow`. Jev calls replay with no network access or API key. Map items and loop iterations replay from their own answers; tasks run again and may call outside services.

The fixture does not contain the flow code, a diagram, or the original input. When sharing a fixture, also share the flow implementation (ideally its Git commit) and input. The `flow` name is an identifier checked during execution, not a file path or code download; `version: 1` identifies the fixture format, not the code revision. You explicitly import the implementation and call its `run()` method; the playground helper adds a small lookup of its three supported flow definitions by name. Each Jev call is then matched to `steps` by its step ID, such as `triage` or `review`. The diagram comes from the flow definition and run events, not from reconstructing code out of the fixture.

```ts
import { readFileSync } from "node:fs";
import { replayClient, type FlowFixture } from "jev-devtools/flow";

const fixture: FlowFixture = JSON.parse(
  readFileSync(new URL("./refund-approve.json", import.meta.url), "utf8"),
);

const result = await refundFlow.run(input, { client: replayClient(fixture) });
assert.equal(result.outcome, "approve");
```

Each Jev step is answered with `fixture.steps[stepId]`, in any order and across parallel lanes and concurrent items. Steps inside a map item or loop iteration use the same ID as their request link: `parent-id/index/step-id`, where the parent is the map or loop and the index is the item or iteration (from 0). A map inside a loop composes both, so the `assess` step of the second item in the first iteration of `rounds` is `rounds/0/batch/1/assess`. `fixture.flow` is always the root flow's name.

Conditions, `if()` arms, map item counts and loop conditions still evaluate the replayed answers, so a test covers the flow's own routing. `if()` merges are not fixture entries. Tasks are never fixture entries: they run locally on replay with the replayed values, so a task that calls a provider or other service still makes that call. Runtime request factories also run, and replay checks the question names they generate.

You can write a fixture by hand to mock Jev by step ID: `{ version: 1, flow, steps }` with one response body (`{ model, answers }`) per step. In code, `flowFixture(definition, run, traces)` from `jev-devtools` or `jev-devtools/flow` returns `{ fixture, missing, warnings }`; save `fixture` as JSON.

Replay matches step IDs, the flow name, and question names. It does not check prompts or state, and SDK request validation still applies. Each mismatch rejects with a plain error:

- A fixture from another flow: `Fixture was recorded from flow "A" but is replaying flow "B".`
- A step with no response: `Fixture has no response for step "x". The run took a route the fixture didn't record, or that step's capture was missing when the fixture was copied.` More items or iterations than the capture had also end here, naming the composed ID.
- Answers missing a requested question, naming the step and the questions. Re-record the fixture after changing a flow's requests.
- A call made outside a flow run.

The drawer reports completed steps it could not include and any capture warnings. Request history is bounded by `limit`, so a large map or loop can evict early item captures; raise `limit` before recording such a run. A failed or cancelled run gives a partial fixture without its failed steps. Fixtures hold the answers supplied to `flowFixture`, so capture truncation and server redaction remain in them. **Copy fixture** also includes the drawer's current display masking controlled by `redactAdditionalSensitiveData`; calling `flowFixture` directly on server captures does not add that display masking. Structural question IDs and Choice labels/probabilities are preserved even when they resemble sensitive field names; sensitive fields inside answer content can still be redacted.

## Compare a live run with a fixture

Unreleased: not in npm 0.4.1 yet.

After you change a prompt or a model, re-run your saved cases with `compareWithFixture` to see what moved. It replays the fixture offline, runs the flow with your client on the same input, and reports the differences:

- `outcome` and `value`, recorded and live.
- `decisions`: each `branch()` and `if()` either side evaluated. `if()` merges and loop conditions are not decisions.
- `steps`: Jev steps only one side ran.
- `answers`: every scalar answer field of the Jev steps both sides ran, such as `noul`, `choice`, `confidence`, `probabilities.refund` or `box.left`. Numeric fields carry a `delta` when both sides and their difference are finite. Infinite values compare exactly, and a difference too large to represent counts as changed. When a request factory generates different question names on each side, a name only one side asked shows `(none)` on the other.

Steps inside map items and loop iterations use the same composed IDs as fixtures, such as `rounds/0/batch/1/assess`. The report prints decisions, then recorded-only steps, then live-only steps, then answers. Each group follows the flow's definition order and walks the items of a map or loop by index, each item in full before the next, whatever order they completed in. When item 1 of a `classify` map takes the other `if()` arm live, the report reads:

```text
decision classify/1/gate: then -> else
step classify/1/detail: recorded only
classify/1/assess.relevant.noul: 0.95 -> 0.30 (-0.65)
```

A loop that ran an extra iteration live adds lines such as `step rounds/2/ask: live only`.

`tolerance` (default 0) applies only to answer fields. It is an absolute difference, used for every numeric field, so pick it with score and box edges in mind as well as probabilities. A numeric field counts as changed when its delta exceeds it. The value comparison is exact. `changed` is set when the outcome, the value or any decision differs, or when a Jev step ran on only one side, such as a loop that ran a different number of iterations or a map over a different number of items. Answer drift alone does not set it. `formatComparison(comparison)` prints one line per change, or `no changes from fixture`; it cuts values and string answers longer than 160 characters to their length and an excerpt that includes the first difference, while the comparison object keeps them in full.

Tasks run on both sides; the recorded side runs them on the replayed answers. Tasks run whenever either run reaches them, including during replay, so side effects can repeat. A task that calls an outside service makes that call from the recorded side too, so that side is only offline when your tasks are. Tasks never appear in `answers` or `steps`; a task result that changes a condition shows up as a decision change.

A fixture copied from the drawer holds redacted and truncated captures. Redaction or truncation in a fixture can show up as answer drift, or stop the replay when a later step needs the missing value.

Fixtures don't store inputs, so pass the input each case was recorded with. Any failure on the recorded side other than cancellation, such as a missing fixture step, a task that throws, the step budget or a loop limit, rejects as `Fixture replay failed: ...` with the original as `cause`. The live run's errors pass through unchanged. Cancellation and an invalid fixture reject with their own errors. Pass `devtools` to record the live run in the inspector, with linked traces when the live client comes from the same inspector. The replay is never recorded.

```ts
import { compareWithFixture, formatComparison } from "jev-devtools/flow";

for (const { name, input, fixture } of savedCases) {
  const comparison = await compareWithFixture(refundFlow, input, fixture, {
    client: jev,
    tolerance: 0.05,
  });
  // changed covers routing and steps; answers also catch drift above tolerance.
  if (comparison.changed || comparison.answers.some((a) => a.changed))
    console.log(`${name}\n${formatComparison(comparison)}`);
}
```

Recording observer failures or mutations to run snapshots do not change comparison results. The comparison copies each resolved client response on capture, so an observer that retains a response cannot rewrite the captured answers or live fixture during later run updates.

Save `comparison.liveFixture` to update the case. It is the fixture `flowFixture` builds from the live run, item steps included, with unredacted, untruncated responses, so review it before committing it.
