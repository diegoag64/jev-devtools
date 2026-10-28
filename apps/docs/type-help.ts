import ts from "typescript";
import type { Help } from "./api-help.js";
import type { ApiHover } from "./api-hovers.js";

// Curated reading aids, not generated expansions of every generic. Keep these
// aligned with the public declarations; type-reference.ts reuses descriptions.
export const typeHelp: Record<string, Help> = {
  JevFlowViewerProps: {
    title: "JevFlowViewerProps",
    importFrom: "jev-devtools/viewer",
    description:
      "Unreleased. Graph, optional captured execution, and presentation controls for the embedded flow viewer. Filtering and highlighting do not change execution.",
    signature:
      "type JevFlowViewerProps = { definition: FlowDefinition; run?: FlowRun; traces?: Trace[]; selectedNodeId?: string; onNodeSelect?: (id: string) => void; visibleNodeIds?: readonly string[]; highlightedNodeIds?: readonly string[]; nodeAccents?: Readonly<Record<string, string>>; }",
  },
  InspectionSnapshot: {
    title: "InspectionSnapshot",
    importFrom: "jev-devtools/viewer",
    description:
      "Unreleased. Latest validated, display-masked request and flow history, plus the inspector connection status.",
    signature:
      "type InspectionSnapshot = { traces: Trace[]; flows: { runs: FlowRun[]; definitions: FlowDefinition[] }; connection: string; }",
  },
  CaptureContext: {
    title: "CaptureContext",
    importFrom: "jev-devtools/server",
    description:
      "Unreleased. Frozen capture-kind context passed as the third redactor argument. Distinguishes identical paths without changing existing policies or stored captures.",
    signature:
      'type CaptureContext = { readonly kind: "request" | "response" | "step-data" | "condition-rule" | "outcome"; }',
  },
  CaptureOptions: {
    title: "CaptureOptions",
    importFrom: "jev-devtools/server",
    description:
      "Controls retained history, optional aggregate flow value bytes, and captured-value redaction. Shared by JevRecorder and the server adapter; it does not change the SDK response your application receives.",
    signature:
      "type CaptureOptions = {\n  limit?: number;\n  flowCaptureBytes?: number;\n  redact?: (path: string[], value: unknown, context: CaptureContext) => unknown;\n}",
    props: {
      "limit?":
        "Maximum retained traces across all sessions. Defaults to 50; clamped to 1–200.",
      "flowCaptureBytes?":
        "Unreleased. Optional nonnegative safe integer. Caps aggregate UTF-8 JSON bytes of flow step data and outcomes, including nested runs. Zero omits those fields with metadata. Excludes structural metadata, definitions, request traces, and observer memory. Used only by the adapter; no default cap.",
      "redact?":
        "Called with the unchanged field path, bounded detached value, and frozen capture-kind context. Access to omitted content fails closed with capture warnings. Existing two-argument callbacks remain valid. Return the value to store in the captured copy, for example a masked string. Keep credentials on the server.",
    },
  },
  JevDevtoolsProps: {
    title: "JevDevtoolsProps",
    importFrom: "jev-devtools",
    description:
      "Props for the React inspector. Enable it explicitly in development and point it at the matching server endpoint.",
    signature:
      "type JevDevtoolsProps = {\n  enabled?: boolean;\n  endpoint?: string;\n  defaultOpen?: boolean;\n  redactAdditionalSensitiveData?: boolean;\n}",
    props: {
      "enabled?": "Defaults to false. Starts the browser inspector when true.",
      "endpoint?": "Same-origin inspector path; defaults to /api/jev-devtools.",
      "defaultOpen?": "Defaults to true. Controls the initial drawer state.",
      "redactAdditionalSensitiveData?":
        "Available since 0.5.0. Defaults to true; masks supported personal fields in the display, not the stored capture.",
    },
  },
  JevDevtoolsServerOptions: {
    title: "JevDevtoolsServerOptions",
    importFrom: "jev-devtools/server",
    description:
      "Server adapter configuration. Extends CaptureOptions with enablement, origin checks, routing, and session selection.",
    signature:
      "type JevDevtoolsServerOptions = CaptureOptions & {\n  origin: string;\n  enabled?: boolean;\n  endpoint?: string;\n  authorize?: (request: Request) => boolean | Promise<boolean>;\n  getSession?: (request: Request) => string | Promise<string>;\n}",
    props: {
      origin: "Exact browser origin, including port.",
      "enabled?": "Recording is disabled unless explicitly enabled.",
      "authorize?":
        "Application access check; required for non-loopback origins.",
      "getSession?":
        "Derives the recording session on the server; defaults to local.",
    },
  },
  ClientMetadata: {
    title: "ClientMetadata",
    importFrom: "jev-devtools/server",
    description:
      "Optional labels attached to captured calls. A sample label does not prevent a real network request.",
    signature:
      'type ClientMetadata = { label?: string; source?: "sample" | "live" }',
    props: {
      "label?": "Name shown for captured requests.",
      "source?":
        "Marks captures as sample or live; it does not alter the client transport.",
    },
  },
  FlowRunOptions: {
    title: "FlowRunOptions",
    importFrom: "jev-devtools/flow",
    description:
      "Execution settings passed to a flow's run() method. The client is required even when the flow contains only tasks.",
    signature:
      'type FlowRunOptions = {\n  client: Pick<TypeSafeClient, "systemOne">;\n  devtools?: FlowObserver;\n  signal?: AbortSignal;\n}',
    props: {
      client:
        "Executes Jev request steps. Use your server client for live requests.",
      "devtools?":
        "Observer that records the execution, usually the server adapter.",
      "signal?":
        "Cancels the run. Tasks should cooperate with the signal they receive.",
    },
  },
  FlowOutcome: {
    title: "FlowOutcome",
    importFrom: "jev-devtools/flow",
    description:
      "The broad compatibility shape for a completed flow. Inferred definitions can preserve literal names and resolved values; run() adds a runId.",
    signature: "type FlowOutcome = { outcome: string; value?: unknown }",
    props: {
      outcome: "The name passed to the selected output() step.",
      "value?": "The resolved output data, when supplied.",
    },
  },
  FlowDisplay: {
    title: "FlowDisplay",
    importFrom: "jev-devtools/flow",
    description:
      "Optional labels for a step in the inspector. These are display metadata, not instructions to the model or changes to execution.",
    signature: "type FlowDisplay = { title?: string; description?: string }",
    props: {
      "title?": "A readable step title.",
      "description?":
        "Short explanation for someone inspecting the flow. Keep it safe to display.",
    },
  },
  TaskContext: {
    title: "TaskContext",
    importFrom: "jev-devtools/flow",
    description:
      "The second argument received by a task's run callback, containing cancellation and execution identifiers.",
    signature:
      "type TaskContext = {\n  signal: AbortSignal;\n  runId: string;\n  stepId: string;\n  executionId: string;\n}",
    props: {
      signal: "Pass to cancellable work such as fetch.",
      runId: "Identifies this flow run.",
      stepId: "Identifies the defined step.",
      executionId:
        "Identifies this execution of the step, including repeated map or loop work.",
    },
  },
  FlowTask: {
    title: "FlowTask",
    importFrom: "jev-devtools/flow",
    description:
      "Configuration for application code inside a flow. Input references resolve before the callback runs; the callback can return a value or a promise.",
    signature:
      "type FlowTask<I, O> = {\n  input: I;\n  run: (input: Resolved<I>, context: TaskContext) => O | Promise<O>;\n  timeoutMs?: number;\n}",
    props: {
      input: "Values or nested flow references passed to the callback.",
      run: "Receives actual values and produces the task result.",
      "timeoutMs?":
        "Limits the wait and signals cancellation. It cannot undo side effects or forcibly stop non-cooperating work.",
    },
  },
  FlowRequestFactory: {
    title: "FlowRequestFactory",
    importFrom: "jev-devtools/flow",
    description:
      "Builds an SDK request from resolved input during flow execution. The factory itself must return synchronously; the runner sends and awaits the request.",
    signature:
      "type FlowRequestFactory<I, Q extends Questions> = {\n  input: I;\n  request: (input: Resolved<I>) => SystemOneRequest<Q>;\n}",
    props: {
      input: "Data to resolve before constructing the question.",
      request:
        "Returns an SDK request. Use an earlier task for asynchronous preparation.",
    },
  },
  Resolved: {
    title: "Resolved",
    importFrom: "jev-devtools/flow",
    description:
      "Replaces flow references inside task inputs, map items and loop state with their actual value types, including nested objects and arrays, while preserving branded primitives. Whole-value reference payloads are already resolved and remain intact.",
    signature:
      "// Example of the resulting type:\nResolved<{ name: FlowExpression<string> }>\n// becomes { name: string }",
  },
  FlowExpression: {
    title: "FlowExpression",
    importFrom: "jev-devtools/flow",
    description:
      "A typed reference to a value that becomes available when the flow runs. It is not the value itself and is not a promise to await.",
    signature: "FlowExpression<T>",
    props: {
      get: "Select an own object field, array index, or array length. Array methods and primitive properties are unsupported.",
      "eq / lt / gt / gte":
        "Build scalar equality or numeric ordering conditions. Execution validates matching scalar types and finite numbers.",
    },
  },
  FlowBuilder: {
    title: "FlowBuilder",
    importFrom: "jev-devtools/flow",
    description:
      "A terminal-capable root, branch path, or parallel lane. The enclosing scope restricts maps and loops even inside lanes. Its methods describe future work.",
    signature: 'FlowBuilder<Input, Scope = "flow">',
    props: {
      input: "A reference to this builder's input shape.",
      "task / jev": "Define application work or a model request.",
      "if / branch / parallel / map / loop":
        "Define conditional, concurrent, or repeated work.",
      output: "Return a named terminal outcome and optional value.",
    },
  },
  FlowValueBuilder: {
    title: "FlowValueBuilder",
    importFrom: "jev-devtools/flow",
    description:
      "A map, loop, or if value body without terminal output or branch methods. Map scope also omits map and loop; loop scope omits loop. Restrictions follow nested paths and lanes.",
    signature: 'FlowValueBuilder<Input, Scope = "flow">',
  },
  DefinedJevFlow: {
    title: "DefinedJevFlow",
    importFrom: "jev-devtools/flow",
    description:
      "An executable definition with typed input and outcome. The default outcome is the broad FlowOutcome for compatible application helpers.",
    signature: "DefinedJevFlow<Input, Outcome = FlowOutcome>",
  },
  FlowResult: {
    title: "FlowResult",
    importFrom: "jev-devtools/flow",
    description:
      "An application outcome plus runId. This preserves inferred terminal unions independently of redacted or truncated captures.",
    signature: "FlowResult<Outcome = FlowOutcome>",
  },
  FlowObserver: {
    title: "FlowObserver",
    importFrom: "jev-devtools/flow",
    description:
      "Records flow progress and request linkage. The server adapter implements this interface. Observation must not control application work.",
    signature: "FlowObserver",
    props: {
      startFlow:
        "Receives the definition and initial run; returns per-run hooks or undefined to skip recording.",
      update: "Receives run updates.",
      request: "Calls through synchronously to preserve request linkage.",
    },
  },
  FlowFixture: {
    title: "FlowFixture",
    importFrom: "jev-devtools/flow",
    description:
      "Available since 0.5.0. Stored Jev responses used for replay. It contains neither the original flow implementation nor its input.",
    signature:
      "type FlowFixture = {\n  version: 1;\n  flow: string;\n  steps: Record<string, unknown>;\n}",
    props: {
      flow: "Must match the flow name being replayed.",
      steps:
        "Saved response bodies keyed by step ID, including composed map/loop IDs. Tasks still execute during replay.",
    },
  },
};

// Explicitly opted-in reference snippets may be abbreviated signatures rather
// than valid programs. Scan identifiers so comments and string contents never
// become help targets; only names in the curated registry are eligible.
export function typeHovers(code: string): ApiHover[] {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    code,
  );
  const result: ApiHover[] = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    if (scanner.getToken() !== ts.SyntaxKind.Identifier) continue;
    const target = scanner.getTokenText();
    if (!Object.hasOwn(typeHelp, target)) continue;
    result.push({
      start: scanner.getTokenPos(),
      end: scanner.getTextPos(),
      target,
      help: typeHelp[target],
    });
  }
  return result;
}
