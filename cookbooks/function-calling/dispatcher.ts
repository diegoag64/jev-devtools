// Adapted from TypeSafe dispatch.py; see provenance.json and LICENSE.typesafe.
import { readFileSync } from "node:fs";
import { choice, noul } from "@typesafe-ai/sdk";
export type Value = string | boolean | string[] | number | null;
export type Shape = {
  shape: "choice" | "set" | "flag" | "unquestioned";
  members?: string[];
  default?: Value;
};
export type ArgumentSpec = {
  question: string;
  stated?: string;
  options?: Record<string, string>;
};
export const spec: {
  question: string;
  functions: Record<
    string,
    { description: string; arguments: Record<string, ArgumentSpec> }
  >;
} = JSON.parse(readFileSync(new URL("./spec.json", import.meta.url), "utf8"));
export const signatures: Record<string, Record<string, Shape>> = JSON.parse(
  readFileSync(new URL("./signatures.json", import.meta.url), "utf8"),
);
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type Answers = Record<string, unknown>;
export type Argument = {
  name: string;
  value: Value;
  omitted: boolean;
  decisions: Record<string, number>;
  distribution: Record<string, number>;
  probability: number;
  apiConfidence: number | null;
};
export function functionRequest(message: string) {
  const questions: Record<
    string,
    ReturnType<typeof choice> | ReturnType<typeof noul>
  > = {
    __tool__: choice(
      spec.question,
      Object.fromEntries(
        Object.entries(spec.functions).map(([name, entry]) => [
          name,
          entry.description,
        ]),
      ),
    ),
  };
  for (const [name, entry] of Object.entries(spec.functions)) {
    for (const [arg, body] of Object.entries(entry.arguments)) {
      const qid = `${name}.${arg}`,
        shape = signatures[name][arg];
      if (shape.shape === "choice")
        questions[qid] = choice(
          body.question,
          Object.fromEntries(shape.members!.map((m) => [m, body.options![m]])),
        );
      else if (shape.shape === "set")
        for (const member of shape.members!)
          questions[`${qid}.${member}`] = noul(
            body.question.replaceAll("{}", member),
            { true: body.options![member] },
          );
      else questions[qid] = noul(body.question);
      if (body.stated) questions[`${qid}?`] = noul(body.stated);
    }
  }
  return { model: "jev-1.12", state: message, questions };
}
function probability(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  )
    throw new Error("Invalid probability");
  return value;
}
export function readNoul(answers: Answers, key: string) {
  const answer = answers[key] as { type?: string; noul?: unknown } | undefined;
  if (answer?.type !== "noul") throw new Error(`Expected Noul: ${key}`);
  return probability(answer.noul);
}
function readChoice(
  answers: Answers,
  key: string,
  members: string[],
): ChoiceAnswer {
  const answer = answers[key] as ChoiceAnswer | undefined;
  if (answer?.type !== "choice" || !members.includes(answer.choice))
    throw new Error(`Expected closed-set Choice: ${key}`);
  probability(answer.probabilities[answer.choice]);
  return answer;
}
function argument(
  name: string,
  value: Value,
  decisions: Record<string, number>,
  distribution: Record<string, number> = {},
  omitted = false,
  apiConfidence: number | null = null,
): Argument {
  return {
    name,
    value,
    decisions,
    distribution,
    omitted,
    apiConfidence,
    probability: Object.values(decisions).reduce((a, b) => a * b, 1),
  };
}
export function selectTool(answers: Answers) {
  const selected = readChoice(answers, "__tool__", Object.keys(spec.functions));
  return {
    name: selected.choice,
    tool: argument(
      "__tool__",
      selected.choice,
      { __tool__: selected.probabilities[selected.choice] },
      selected.probabilities,
      false,
      selected.confidence,
    ),
    names: Object.keys(spec.functions[selected.choice].arguments),
  };
}
export function presence(name: string, arg: string, answers: Answers) {
  // Like upstream read(), a missing presence answer means no presence decision.
  const key = `${name}.${arg}?`;
  const stated = Object.hasOwn(answers, key) ? readNoul(answers, key) : null;
  return { stated, omitted: stated !== null && stated < 0.5 };
}
export function omitArgument(arg: string, stated: number): Argument {
  return argument(arg, null, { [`${arg}?`]: 1 - stated }, {}, true);
}
export function readArgument(
  name: string,
  arg: string,
  stated: number | null,
  answers: Answers,
): Argument {
  const qid = `${name}.${arg}`,
    shape = signatures[name][arg];
  const decisions: Record<string, number> =
    stated === null ? {} : { [`${arg}?`]: stated };
  if (shape.shape === "choice") {
    const answer = readChoice(answers, qid, shape.members!);
    return argument(
      arg,
      answer.choice,
      { ...decisions, [arg]: answer.probabilities[answer.choice] },
      answer.probabilities,
      false,
      answer.confidence,
    );
  }
  if (shape.shape === "set") {
    const distribution: Record<string, number> = {},
      members: string[] = [];
    for (const member of shape.members!) {
      const p = readNoul(answers, `${qid}.${member}`);
      distribution[member] = p;
      decisions[`${arg}.${member}`] = p >= 0.5 ? p : 1 - p;
      if (p >= 0.5) members.push(member);
    }
    return argument(arg, members, decisions, distribution);
  }
  const p = readNoul(answers, qid);
  return argument(
    arg,
    p >= 0.5,
    { ...decisions, [arg]: p >= 0.5 ? p : 1 - p },
    { true: p },
  );
}
export function assembleCall(
  selected: ReturnType<typeof selectTool>,
  args: Argument[],
) {
  const kwargs = Object.fromEntries(
    args.filter((a) => !a.omitted).map((a) => [a.name, a.value]),
  );
  const defaults = Object.fromEntries(
    Object.entries(signatures[selected.name])
      .filter(
        ([name, shape]) =>
          !Object.hasOwn(kwargs, name) && Object.hasOwn(shape, "default"),
      )
      .map(([name, shape]) => [name, shape.default!]),
  );
  const decisions = Object.assign(
    {},
    selected.tool.decisions,
    ...args.map((a) => a.decisions),
  ) as Record<string, number>;
  const weakest = args.reduce<Argument | null>(
    (a, b) => (a === null || b.probability < a.probability ? b : a),
    null,
  );
  return {
    name: selected.name,
    tool: selected.tool,
    kwargs,
    defaults,
    arguments: args,
    decisions,
    confidence: Math.min(1, ...Object.values(decisions)),
    weakest: weakest?.name ?? null,
    proposal: `${selected.name}(${Object.entries(kwargs)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(", ")})`,
    executed: false as const,
  };
}
export type FunctionResult = ReturnType<typeof assembleCall>;
