export type Help = {
  title: string;
  signature: string;
  description: string;
  props?: Record<string, string>;
  importFrom?: string;
};

// Authored API summaries, not replacement declarations.
// Twoslash still checks the original source against the public package types.
const flowHelp = {
  define: {
    title: "defineJevFlow()",
    signature: "defineJevFlow<Input>(name, build)",
    description:
      "Describe a flow once, then run it with different inputs. Defining it does not send requests.",
    props: {
      name: "The flow name shown in DevTools.",
      build: "Receives a builder. Return an output or a terminal branch.",
    },
  },
  jev: {
    title: "flow.jev()",
    signature: "flow.jev(id, { state, questions }, display?)",
    description:
      "Define a Jev request step synchronously. Returns future-answer references, not a promise. The request runs and is awaited when you call program.run().",
    props: {
      id: "A unique step ID within this flow.",
      state:
        "Context sent to Jev for this request. Flow references are resolved when the step runs.",
      questions:
        "Named questions to ask. Their keys identify the returned answers.",
      "display?": "Optional labels and display metadata for DevTools.",
    },
  },
  input: {
    title: "flow.input",
    signature: "flow.input: FlowExpression<Input>",
    description:
      "A reference to the data passed to run(). Inside map/loop programs, it refers to the item or iteration input instead.",
  },
  branch: {
    title: "flow.branch()",
    signature: "flow.branch(id, { when, then, else }, display?)",
    description:
      "Finish the flow by choosing one of two paths. Each path must return an output or another branch.",
    props: {
      id: "A unique step ID within this flow.",
      when: "A flow condition evaluated when the branch runs.",
      then: "The path used when the condition is true.",
      else: "The path used when the condition is false.",
      "display?": "Optional labels and display metadata for DevTools.",
    },
  },
  output: {
    title: "flow.output()",
    signature: "flow.output(name, value?, display?)",
    description:
      "Finish this path with a named outcome and, optionally, a value for your application.",
    props: {
      name: "The outcome string returned by run().",
      "value?":
        "Optional result data. Narrow its type in your application before using it.",
      "display?": "Optional labels and display metadata for DevTools.",
    },
  },
  run: {
    title: "program.run()",
    signature: "program.run(input, { client, devtools?, signal? })",
    description:
      "Start the flow with new input and await its steps, including SDK requests. Use await to read { runId, outcome, value? }.",
    props: {
      input: "Data matching the input type declared in defineJevFlow.",
      client: "The TypeSafe-compatible client that executes Jev requests.",
      "devtools?":
        "An optional observer, such as the shared server adapter, that records execution.",
      "signal?": "An optional AbortSignal to cancel the run.",
    },
  },
  answer: {
    title: "answer()",
    signature: "request.answer(name)",
    description:
      "Reference the result of a named question. The name must match a key in questions; answer fields can be used in later steps.",
  },
  choice: {
    title: "answer.choice",
    signature: "choice: FlowExpression<Label>",
    description:
      "A reference to the label selected by a Choice question. Its allowed labels come from that question’s alternatives.",
  },
  eq: {
    title: "expression.eq()",
    signature: "expression.eq(value)",
    description:
      "Build an equality condition for strings, numbers, booleans, or null. TypeScript rejects non-scalar receivers; execution checks matching types and finite numbers.",
  },
} satisfies Record<string, Help>;

const entry = (
  title: string,
  signature: string,
  description: string,
  props?: Record<string, string>,
): Help => ({ title, signature, description, props });
const capture = {
  limit:
    "Maximum retained request traces across sessions. Defaults to 50; clamped to 1–200.",
  redact:
    "Transform the captured copy before storage or streaming. Incompatible structured content remains as JSON in Trace.capture with warnings. The drawer keeps usable fields visible beside unavailable placeholders. SDK inputs and application values stay unchanged.",
};
const adapter = {
  enabled:
    "Opt into server capture and inspector endpoints. Defaults to false; disabling capture does not stop inference.",
  origin: "The exact browser origin, including scheme, hostname, and port.",
  endpoint:
    "The inspector URL path. Defaults to /api/jev-devtools; must match the browser component.",
  ...capture,
  authorize:
    "Your application access check. Required for an enabled non-loopback origin.",
  getSession:
    "Derive a trusted recording scope from the request. Defaults to the shared local scope.",
};
export const apiHelp: Record<string, Help> = {
  ...flowHelp,
  viewer: entry(
    "JevFlowViewer",
    "<JevFlowViewer definition={definition} run={run} traces={traces} />",
    "Unreleased. Embed the drawer's flow diagram in a Shadow DOM. Without a run it shows the authored structure; rendering never executes the flow.",
    {
      definition: "The authored FlowDefinition to render.",
      run: "Optional captured execution for this definition.",
      traces: "Captured request details; defaults to an empty array.",
      selectedNodeId: "Control which top-level node is selected.",
      onNodeSelect: "Receive the selected node ID.",
      visibleNodeIds:
        "Limit the presented top-level nodes without modifying execution.",
      highlightedNodeIds: "Outline matching nodes.",
      nodeAccents: "CSS colors indexed by node ID for source-to-diagram cues.",
    },
  ),
  inspection: entry(
    "useJevInspection()",
    "useJevInspection({ enabled, endpoint? })",
    "Unreleased. Subscribe to validated, display-masked flow and trace snapshots from the existing server adapter.",
    {
      enabled:
        "Opt in to connecting. Defaults to false; enable the server separately.",
      endpoint:
        "Same-origin inspector path, default /api/jev-devtools. Queries and fragments are rejected.",
    },
  ),
  react: entry(
    "JevDevtools",
    "<JevDevtools enabled defaultOpen={false} />",
    "Mount the inspector once near your application root. It connects after mounting when enabled; it renders nothing during SSR.",
    {
      enabled:
        "Load and connect the browser inspector. Defaults to false; enable the server adapter separately.",
      defaultOpen:
        "Whether the drawer starts expanded. Defaults to true; false starts at the launcher.",
      endpoint:
        "Same-origin inspector path. Defaults to /api/jev-devtools; must match the server adapter.",
      redactAdditionalSensitiveData:
        "Mask supported personal fields in the display. Does not remove captured data. Available since 0.5.0; defaults to true.",
    },
  ),
  adapterCreate: entry(
    "createJevDevtools()",
    "createJevDevtools(options)",
    "Create an independent Node server adapter. Share it between your HTTP endpoints and instrumented clients.",
    adapter,
  ),
  adapterShared: entry(
    "getJevDevtools()",
    "getJevDevtools(key, createOptions)",
    "Reuse an adapter for a stable key in the same Node realm. The options factory runs once per key; restart after configuration changes. Different processes do not share history.",
    {
      key: "A stable, nonempty application key.",
      createOptions: "Return the server options, including enabled and origin.",
    },
  ),
  adapterClient: entry(
    "adapter.createClient()",
    "adapter.createClient(options, metadata?)",
    "Create an instrumented TypeSafe client. Captures systemOne calls when recording is enabled; otherwise returns an ordinary SDK client. Keep credentials on the server.",
    {
      label: "Optional capture label. Defaults to Jev request.",
      source:
        "Capture label: sample or live. Defaults to live. This does not switch transports or prevent inference.",
    },
  ),
  adapterMiddleware: entry(
    "adapter.middleware",
    "app.use(adapter.middleware)",
    "Mount at the application root to serve inspector endpoints and their subpaths. Unrelated routes call next().",
  ),
  adapterHandle: entry(
    "adapter.handle()",
    "adapter.handle(request)",
    "Handle a Web Request with its actual public URL and return a Web Response. Applies the adapter's access checks.",
  ),
  adapterRoute: entry(
    "adapter.handleNodeRoute()",
    "adapter.handleNodeRoute(request)",
    "Check Host, normalize a Node framework's internal request URL, and apply the adapter's access checks. Route the base endpoint and all subpaths here.",
  ),
  adapterRun: entry(
    "adapter.run()",
    "adapter.run(request, callback)",
    "Run application code in the request's server-derived recording scope. Needed when getSession is customized. Authenticate the application action separately.",
  ),
  adapterDispose: entry(
    "adapter.dispose()",
    "adapter.dispose()",
    "Disable the adapter and close active streams. A shared adapter also releases its key. Use at shutdown, not after each request.",
  ),
  recorder: entry(
    "JevRecorder",
    "new JevRecorder(options?)",
    "Create a lower-level in-memory request recorder for a custom integration.",
    capture,
  ),
  recorderInstrument: entry(
    "recorder.instrument()",
    "recorder.instrument(client, metadata)",
    "Wrap a TypeSafe client to record its systemOne calls. Pair with recorder.transport() to capture request transport details.",
    {
      session: "The recording scope for this request.",
      label: "A human-readable request label.",
      source:
        "Label the capture as sample or live; does not change the underlying transport.",
    },
  ),
  recorderTransport: entry(
    "recorder.transport()",
    "recorder.transport(fetcher)",
    "Wrap a fetch implementation to observe request transport details. Pass the wrapper to the SDK client's fetch option.",
  ),
  recorderSubscribe: entry(
    "recorder.subscribe()",
    "recorder.subscribe(listener)",
    "Listen for changed session IDs. Returns an unsubscribe function; call it when the listener is no longer needed.",
  ),
  recorderSnapshot: entry(
    "recorder.snapshot()",
    "recorder.snapshot(session)",
    "Read a cloned snapshot of retained traces for one session, newest first. Changing the snapshot does not change recorder history.",
  ),
  task: entry(
    "flow.task()",
    "flow.task(id, { input, run, timeoutMs? }, display?)",
    "Resolve input references, run application code, and return a reference to its result. Tasks do not retry automatically.",
    {
      input: "Values and nested flow references resolved before run is called.",
      run: "Your callback receives the resolved input and task context, including a cancellation signal.",
      "timeoutMs?":
        "Optional time limit. The callback must cooperate with cancellation; a timeout cannot undo side effects.",
    },
  ),
  map: entry(
    "flow.map()",
    "flow.map(id, options, build, display?)",
    "Run a bounded item program for each item. Results preserve input order even when items execute concurrently.",
    {
      items:
        "An array or a reference to one. Each item is passed to the item program.",
      input:
        "Explicit shared context for each item program, available as input.context.",
      maxItems: "Required bound on the number of items.",
      "concurrency?":
        "Maximum number of item programs allowed to run concurrently.",
      build:
        "Receives a builder with input { item, index, context }. Return an expression for the item result.",
    },
  ),
  if: entry(
    "flow.if()",
    "flow.if(id, { when, then, else }, display?)",
    "Choose one value-returning path, then continue with its result. Unlike branch(), this does not finish the flow.",
    {
      when: "A flow condition evaluated during the run.",
      then: "Build the path selected when the condition is true. Return an expression for its value.",
      else: "Build the path selected when the condition is false. Return an expression for its value.",
    },
  ),
  loop: entry(
    "flow.loop()",
    "flow.loop(id, options, build, display?)",
    "Test a condition before each iteration and return the final state. Rejects if the condition still holds at the iteration limit.",
    {
      initial: "The starting JSON state, or a reference to it.",
      input:
        "Explicit shared context, available to the iteration program as input.context.",
      while:
        "Build a Boolean flow condition from the current state. Tested before each iteration.",
      maxIterations:
        "Required bound. Exceeding it while the condition is still true rejects with FlowLoopLimitError.",
      build:
        "Receives a builder with input { state, index, context }. Return an expression for the next state.",
    },
  ),
  parallel: entry(
    "flow.parallel()",
    "flow.parallel(id, lanes, display?)",
    "Run named lanes concurrently and join their returned expressions. Each lane's work stays sequential. Lane names belong to your application.",
    {
      lanes:
        "An object of builder callbacks, each returning an expression. Private sibling intermediates are not available across lanes.",
    },
  ),
  get: entry(
    "expression.get()",
    "expression.get(key)",
    "Select a field owned by an object, an array index, or array length. TypeScript rejects array methods. Missing fields and array bounds remain execution checks; use a task for string operations.",
  ),
  lt: entry(
    "expression.lt()",
    "expression.lt(value)",
    "Build a strictly-less-than condition. Compares finite numeric values when the flow runs.",
  ),
  gt: entry(
    "expression.gt()",
    "expression.gt(value)",
    "Build a strictly-greater-than condition. Compares finite numeric values when the flow runs.",
  ),
  gte: entry(
    "expression.gte()",
    "expression.gte(value)",
    "Build a greater-than-or-equal condition. Compares finite numeric values when the flow runs.",
  ),
  noul: entry(
    "answer.noul",
    "answer.noul",
    "Reference the probability of true returned by a Noul question. Any threshold you apply is your application's policy, not a TypeSafe default.",
  ),
  all: entry(
    "all()",
    "all(...conditions)",
    "Combine Boolean flow conditions: every condition must be true. All operands are evaluated; this does not short-circuit missing references.",
  ),
  any: entry(
    "any()",
    "any(...conditions)",
    "Combine Boolean flow conditions: at least one condition must be true. All operands are evaluated.",
  ),
  not: entry(
    "not()",
    "not(condition)",
    "Invert a Boolean flow condition, evaluated when the flow runs.",
  ),
  replay: entry(
    "replayClient() · unreleased",
    "replayClient(fixture)",
    "Return an SDK-compatible client that serves saved answers without a key or inference call. Missing responses reject. Tasks and request factories still execute again.",
  ),
  fixture: entry(
    "FlowFixture · unreleased",
    "{ version: 1, flow, steps }",
    "Saved responses for replay. Does not contain the original input or the flow implementation.",
    {
      version: "Fixture format version. Currently 1.",
      flow: "The name of the flow this fixture can replay.",
      steps:
        "Saved responses indexed by step ID. IDs inside map/loop programs include their execution path.",
    },
  ),
};
