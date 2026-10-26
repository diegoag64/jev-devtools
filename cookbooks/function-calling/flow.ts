import { defineJevFlow } from "jev-devtools/flow";
import { functionCases, isFunctionCase, type FunctionCase } from "./cases.js";
import {
  functionRequest,
  selectTool,
  presence,
  omitArgument,
  readArgument,
  assembleCall,
} from "./dispatcher.js";
export const functionFlow = defineJevFlow<{
  message: string;
  caseId: FunctionCase;
}>("Cookbook · Function calling", (flow) => {
  const command = flow.task(
    "validate-command",
    {
      input: flow.input,
      run: ({ message, caseId }) => {
        if (
          !isFunctionCase(caseId) ||
          message !== functionCases[caseId].message
        )
          throw new Error("No function-calling sample matches this command");
        return message;
      },
    },
    {
      title: "Validate fixed sample command",
      description:
        "Server-side allowlist. Authored commands use synthetic responses; no API key or trading service.",
    },
  );
  const response = flow.jev(
    "dispatch",
    { input: command, request: functionRequest },
    {
      title: "Choose a tool and assess its arguments",
      description:
        "One request with 54 questions over ten tools. Every answer is inspectable; only the selected tool contributes to the proposed call.",
    },
  );
  const selected = flow.task(
    "select-tool",
    { input: response.answers, run: selectTool },
    {
      title: "Select the proposed tool",
      description:
        "Read the returned tool Choice and its selected-label probability. SDK Choice confidence is retained for display, not substituted for probability.",
    },
  );
  const args = flow.map(
    "selected-arguments",
    {
      items: selected.get("names"),
      input: { name: selected.get("name"), answers: response.answers },
      maxItems: 7,
      concurrency: 1,
    },
    (item) => {
      const p = item.task(
        "read-presence",
        {
          input: item.input,
          run: ({ item: arg, context }) =>
            presence(context.name, arg, context.answers),
        },
        {
          title: "Was this argument stated?",
          description:
            "Read only this selected tool's presence Noul when available. Omit below 0.5; exactly 0.5 is included.",
        },
      );
      return item.if(
        "omit-or-fill",
        {
          when: p.get("omitted").eq(true),
          then: (path) =>
            path.task(
              "omit",
              {
                input: { arg: item.input.get("item"), stated: p.get("stated") },
                run: ({ arg, stated }) => omitArgument(arg, stated!),
              },
              {
                title: "Omit and preserve default",
                description:
                  "Only the absence decision contributes: 1 − P(stated). Do not read the omitted argument's value answer.",
              },
            ),
          else: (path) =>
            path.task(
              "fill",
              {
                input: { data: item.input, stated: p.get("stated") },
                run: ({ data, stated }) =>
                  readArgument(
                    data.context.name,
                    data.item,
                    stated,
                    data.context.answers,
                  ),
              },
              {
                title: "Fill closed-set argument",
                description:
                  "Use Choice label probability; flags and set members include at ≥0.5. Excluded members contribute 1 − P(member).",
              },
            ),
        },
        { title: "Omit or fill this argument" },
      );
    },
    {
      title: "Read only the selected tool's arguments",
      description:
        "Inspect each argument's presence branch. This collection performs deterministic assembly, with no additional Jev requests.",
    },
  );
  const proposal = flow.task(
    "assemble-proposal",
    {
      input: { selected, args },
      run: ({ selected, args }) => assembleCall(selected, args),
    },
    {
      title: "Assemble call and confidence",
      description:
        "Call confidence is the minimum relevant decision mass. Argument probability is a product. Defaults are shown separately; no quality gate is invented.",
    },
  );
  return flow.output("proposed-call", proposal, {
    title: "Proposed call · not executed",
    description:
      "Return the function name, explicit kwargs, defaults and decision evidence. Output does not invoke a tool or perform any external action.",
  });
});
