import ts from "typescript";

type Help = {
  title: string;
  signature: string;
  description: string;
  props?: Record<string, string>;
};

// Authored explanations for this teaching example, not replacement declarations.
// Twoslash still checks the original source against the public package types.
const help = {
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
      "Add a Jev request step. It returns references to answers you can use in later steps.",
    props: {
      id: "A unique step ID within this flow.",
      state:
        "Context sent with the request. Flow references are resolved when the step runs.",
      questions:
        "Named questions to ask. Their keys identify the returned answers.",
      "display?": "Optional labels and display metadata for DevTools.",
    },
  },
  input: {
    title: "flow.input",
    signature: "flow.input: FlowExpression<Input>",
    description:
      "A reference to the data passed to run(). Here it resolves to the object containing the customer's message.",
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
    title: "path.output()",
    signature: "path.output(name, value?, display?)",
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
    title: "triage.run()",
    signature: "triage.run(input, { client, devtools?, signal? })",
    description:
      "Execute the flow with new input. Resolves to { runId, outcome, value? }.",
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
    signature: 'classification.answer("team")',
    description:
      "Reference the result of a named question. Here, team is the key declared in questions; its choice field holds the selected label.",
  },
  choice: {
    title: "answer.choice",
    signature: 'choice: FlowExpression<"billing" | "other">',
    description:
      "A reference to the selected label. This example can return billing or other, the alternatives declared in the question.",
  },
  eq: {
    title: "expression.eq()",
    signature: 'choice.eq("billing"): FlowExpression<boolean>',
    description:
      "Build an equality condition. It checks the resolved choice when the flow runs; it does not compare values during definition.",
  },
  state: {
    title: "state",
    signature: "state: flow.input",
    description:
      "Context sent to Jev for this request. Here it uses the input object, including message. You can also compose context from earlier flow references.",
  },
  questions: {
    title: "questions",
    signature: "questions: { [name]: question }",
    description:
      "A nonempty set of named questions. Use these names with answer() to reference their results. team is an application-defined name, not a reserved API property.",
  },
  when: {
    title: "when",
    signature: "when: FlowExpression<boolean>",
    description:
      "The condition that selects the path. Here, a billing choice takes then; any other choice takes else.",
  },
  then: {
    title: "then",
    signature: "then: (path) => path.output(name)",
    description:
      "Build the path used when the condition is true. Return an output or another branch so this path finishes with an outcome.",
  },
  else: {
    title: "else",
    signature: "else: (path) => path.output(name)",
    description:
      "Build the path used when the condition is false. Return an output or another branch so this path finishes with an outcome.",
  },
  client: {
    title: "client",
    signature: "client: jev",
    description:
      "The client used to execute this run's Jev requests. Here, jev is the instrumented client created by the shared server adapter.",
  },
  devtools: {
    title: "devtools (optional)",
    signature: "devtools: inspector",
    description:
      "Pass the shared server adapter to record the flow's execution and link request traces to steps. This does not mount the browser drawer.",
  },
} satisfies Record<string, Help>;

type Key = keyof typeof help;
// Explicit call sites keep imports, local variables, SDK functions, and user
// object keys out of the hover UI, even when they share an API member's name.
const calls: Record<string, { key: Key; props?: Key[] }> = {
  defineJevFlow: { key: "define" },
  "flow.jev": { key: "jev", props: ["state", "questions"] },
  "flow.branch": { key: "branch", props: ["when", "then", "else"] },
  "path.output": { key: "output" },
  "triage.run": { key: "run", props: ["client", "devtools"] },
  "classification.answer": { key: "answer" },
};

export function flowHovers(code: string): Map<number, Help> {
  const source = ts.createSourceFile(
    "flow.ts",
    code,
    ts.ScriptTarget.Latest,
    true,
  );
  const selected = new Map<number, Help>();
  const add = (node: ts.Node, key: Key) =>
    selected.set(node.getStart(source), help[key]);
  const isAnswerChoice = (node: ts.Node): boolean =>
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "choice" &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(source) === "classification.answer";
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const call = calls[node.expression.getText(source)];
      if (call) {
        add(
          ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name
            : node.expression,
          call.key,
        );
        for (const arg of node.arguments) {
          if (!ts.isObjectLiteralExpression(arg)) continue;
          for (const prop of arg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              call.props?.includes(prop.name.text as Key)
            )
              add(prop.name, prop.name.text as Key);
          }
        }
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (node.getText(source) === "flow.input") add(node.name, "input");
      else if (isAnswerChoice(node)) add(node.name, "choice");
      else if (node.name.text === "eq" && isAnswerChoice(node.expression))
        add(node.name, "eq");
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return selected;
}
