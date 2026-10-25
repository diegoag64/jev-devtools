import { typeHelp } from "./type-help.js";

// Curated receiver-aware help titles map to stable glossary headings.
// Property help uses its owning API, so generic names such as run are unambiguous.
export const apiTargets: Record<string, string> = {
  ...Object.fromEntries(Object.keys(typeHelp).map((name) => [name, name === "FlowExpression" ? "flowexpression" : `type-${name.toLowerCase()}`])),
  "defineJevFlow()": "definejevflow", "flow.input": "flow-input",
  "flow.jev()": "flow-jev", "flow.task()": "flow-task", "flow.branch()": "flow-branch",
  "flow.if()": "flow-if", "flow.output()": "flow-output", "flow.parallel()": "flow-parallel",
  "flow.map()": "flow-map", "flow.loop()": "flow-loop", "program.run()": "flow-run",
  "answer()": "request-answer", "answer.choice": "request-answer", "answer.noul": "request-answer",
  "expression.get()": "expression-get", "expression.eq()": "expression-eq",
  "expression.lt()": "expression-lt", "expression.gt()": "expression-gt", "expression.gte()": "expression-gte",
  "all()": "all", "any()": "any", "not()": "not", "JevDevtools": "jevdevtools",
  "createJevDevtools()": "createjevdevtools", "getJevDevtools()": "getjevdevtools",
  "adapter.createClient()": "adapter-createclient", "adapter.middleware": "adapter-middleware",
  "adapter.handle()": "adapter-handle", "adapter.handleNodeRoute()": "adapter-handlenoderoute",
  "adapter.run()": "adapter-run", "adapter.dispose()": "adapter-dispose",
  "JevRecorder": "jevrecorder", "recorder.instrument()": "recorder-instrument",
  "recorder.transport()": "recorder-transport", "recorder.subscribe()": "recorder-subscribe",
  "recorder.snapshot()": "recorder-snapshot", "replayClient()": "replayclient", "FlowFixture": "type-flowfixture",
};
