import { randomUUID } from "node:crypto";
import type {
  Questions,
  ResultFor,
  SystemOneRequest,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import type {
  FlowDefinition,
  FlowCondition,
  FlowDisplay,
  FlowNode,
  FlowRun,
  FlowStep,
} from "../src/flow-protocol.js";
import { jsonSnapshot, runCallback } from "./runtime.js";
export type {
  FlowDisplay,
  FlowDefinition,
  FlowRun,
  FlowStep,
} from "../src/flow-protocol.js";

type Ast =
  | { op: "input" }
  | { op: "ref"; id: string }
  | { op: "get"; from: Ast; key: string }
  | { op: "literal"; value: unknown }
  | { op: "eq" | "lt" | "gt" | "gte" | "all" | "any" | "not"; args: Ast[] };
const owners = new WeakMap<object, object>();
const builderIds = new WeakMap<object, Set<string>>();
function freezeAst(ast: Ast, depth = 0): void {
  if (depth > 80) throw new Error("Expression nesting exceeds 80");
  if (Object.isFrozen(ast)) return;
  if (ast.op === "get") freezeAst(ast.from, depth + 1);
  if ("args" in ast) {
    if (ast.args.length > 256) throw new Error("Too many condition operands");
    for (const child of ast.args) freezeAst(child, depth + 1);
    Object.freeze(ast.args);
  }
  Object.freeze(ast);
}
/** Inspectable expression, not an application callback. Use get() for input fields. */
export class FlowExpression<T> {
  private declare readonly valueType: T;
  constructor(
    readonly ast: Ast,
    owner?: object,
  ) {
    if (owner) owners.set(this, owner);
    freezeAst(ast);
    Object.freeze(this);
  }
  get<K extends keyof T & (string | number)>(key: K): FlowExpression<T[K]> {
    return expression({ op: "get", from: this.ast, key: String(key) }, [this]);
  }
  eq(value: T | FlowExpression<T>): FlowExpression<boolean> {
    return operation("eq", [this, value]);
  }
  lt(
    this: FlowExpression<number>,
    value: number | FlowExpression<number>,
  ): FlowExpression<boolean> {
    return operation("lt", [this, value]);
  }
  gt(
    this: FlowExpression<number>,
    value: number | FlowExpression<number>,
  ): FlowExpression<boolean> {
    return operation("gt", [this, value]);
  }
  gte(
    this: FlowExpression<number>,
    value: number | FlowExpression<number>,
  ): FlowExpression<boolean> {
    return operation("gte", [this, value]);
  }
}
function expression<T>(ast: Ast, values: unknown[]): FlowExpression<T> {
  const tokens = new Set(
    values
      .filter((v) => v instanceof FlowExpression)
      .map((v) => owners.get(v as object))
      .filter(Boolean),
  );
  if (tokens.size > 1) throw new Error("References belong to different flows");
  return new FlowExpression<T>(ast, tokens.values().next().value);
}
function operation(
  op: "eq" | "lt" | "gt" | "gte" | "all" | "any" | "not",
  args: unknown[],
): FlowExpression<boolean> {
  return expression(
    {
      op,
      args: args.map((v) =>
        v instanceof FlowExpression ? v.ast : { op: "literal", value: v },
      ),
    },
    args,
  );
}
export const all = (...conditions: FlowExpression<boolean>[]) =>
  operation("all", conditions);
export const any = (...conditions: FlowExpression<boolean>[]) =>
  operation("any", conditions);
export const not = (condition: FlowExpression<boolean>) =>
  operation("not", [condition]);
export type FlowOutcome = { outcome: string; value?: unknown };
type AnswerRefs<Q extends Questions> = {
  /** All answers, including question names created by a runtime request factory. */
  readonly answers: FlowExpression<{ [K in keyof Q]: ResultFor<Q[K]> }>;
  answer<K extends keyof Q & string>(
    name: K,
  ): { [F in keyof ResultFor<Q[K]>]: FlowExpression<ResultFor<Q[K]>[F]> };
};
type Request<Q extends Questions> = Omit<SystemOneRequest<Q>, "state"> & {
  state: unknown;
};
/** Resolve nested references before invoking a server callback. */
export type Resolved<T> =
  T extends FlowExpression<infer V>
    ? V
    : T extends readonly unknown[]
      ? { [K in keyof T]: Resolved<T[K]> }
      : T extends object
        ? { [K in keyof T]: Resolved<T[K]> }
        : T;
export type TaskContext = {
  signal: AbortSignal;
  runId: string;
  stepId: string;
  executionId: string;
};
export type FlowTask<I, O> = {
  input: I;
  run: (input: Resolved<I>, context: TaskContext) => O | Promise<O>;
  timeoutMs?: number;
};
export type FlowRequestFactory<I, Q extends Questions> = {
  input: I;
  /** Synchronous construction only; the runner executes the SDK request. */
  request: (input: Resolved<I>) => SystemOneRequest<Q>;
};
type Block = { nodes: Step[]; result?: FlowExpression<unknown> };
type Step = {
  id: string;
  kind: FlowNode["kind"];
  request?: Request<Questions>;
  when?: FlowExpression<boolean>;
  then?: Block;
  else?: Block;
  lanes?: Record<string, Block>;
  value?: unknown;
  outcome?: string;
  input?: unknown;
  task?: (input: never, context: TaskContext) => unknown;
  factory?: (input: never) => SystemOneRequest<Questions>;
  timeoutMs?: number;
  answerNames?: Set<string>;
  mergeOf?: string;
  loop?: {
    initial: unknown;
    context: unknown;
    when: FlowExpression<boolean>;
    maxIterations: number;
    program: ReturnType<typeof defineJevFlow<unknown>>;
  };
  collection?: {
    items: unknown;
    context: unknown;
    concurrency: number;
    maxItems: number;
    program: ReturnType<typeof defineJevFlow<unknown>>;
  };
};
/** Observer contract used by createJevDevtools; execution never depends on successful recording. */
export type FlowObserver = {
  startFlow(
    definition: FlowDefinition,
    run: FlowRun,
  ):
    | {
        update(run: FlowRun): void;
        request<T>(
          link: { runId: string; stepId: string; executionId: string },
          onTrace: (id: string) => void,
          callback: () => T,
        ): T;
      }
    | undefined;
};
export type FlowRunOptions = {
  client: Pick<TypeSafeClient, "systemOne">;
  devtools?: FlowObserver;
  signal?: AbortSignal;
};
// Nested programs share a reservation budget without exposing execution internals in the API.
const executionBudgets = new WeakMap<FlowRunOptions, { used: number }>();
function withBudget(
  options: FlowRunOptions,
  budget: { used: number },
): FlowRunOptions {
  executionBudgets.set(options, budget);
  return options;
}
function definitionSize(definition: FlowDefinition): number {
  return definition.nodes.reduce(
    (count, node) =>
      count +
      1 +
      (node.itemDefinition ? definitionSize(node.itemDefinition) : 0),
    0,
  );
}
export class FlowLoopLimitError extends Error {
  readonly name = "FlowLoopLimitError";
  constructor() {
    super("Loop condition is still true at maxIterations");
  }
}
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === "object" &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);
function mapValue(
  value: unknown,
  ref: (expr: FlowExpression<unknown>) => unknown,
  seen = new Set<object>(),
  depth = 0,
): unknown {
  if (depth > 40) throw new Error("Flow value nesting exceeds 40");
  if (value instanceof FlowExpression) return ref(value);
  if (typeof value === "function")
    throw new Error("Flow values cannot contain callbacks");
  if (!Array.isArray(value) && !plain(value)) return value; // Preserve SDK assets.
  if (seen.has(value)) throw new Error("Cyclic flow value");
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((v) => mapValue(v, ref, seen, depth + 1))
    : Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          mapValue(v, ref, seen, depth + 1),
        ]),
      );
  seen.delete(value);
  return result;
}
const inspectAst = (ast: Ast, ref: (id: string) => void): void => {
  if (ast.op === "ref") ref(ast.id);
  else if (ast.op === "get") inspectAst(ast.from, ref);
  else if ("args" in ast) ast.args.forEach((a) => inspectAst(a, ref));
};
function describe(ast: Ast): string {
  if (ast.op === "input") return "input";
  if (ast.op === "ref") return ast.id;
  if (ast.op === "get") return `${describe(ast.from)}.${ast.key}`;
  if (ast.op === "literal") return "[literal]";
  return `${ast.op}(${ast.args.map(describe).join(", ")})`;
}
function conditionRule(
  ast: Ast,
  requests: Set<string>,
  tasks: Set<string>,
): FlowCondition {
  let remaining = 128;
  const visit = (node: Ast): FlowCondition => {
    if (--remaining < 0) return { op: "literal", value: "[rule truncated]" };
    if (node.op === "input" || node.op === "ref" || node.op === "get") {
      const path: string[] = [];
      let base: Ast = node;
      while (base.op === "get") {
        path.unshift(base.key);
        base = base.from;
      }
      const answer =
        base.op === "ref" && requests.has(base.id) && path[0] === "answers";
      const probability = answer && path.length === 3 && path[2] === "noul";
      const root =
        base.op === "input"
          ? "input"
          : base.op === "ref"
            ? base.id
            : describe(base);
      const fields = probability
        ? path.slice(1, -1)
        : answer
          ? path.slice(1)
          : path;
      const label =
        root +
        fields
          .map((key) =>
            /^[a-zA-Z_$][\w$]*$/.test(key)
              ? `.${key}`
              : `[${JSON.stringify(key)}]`,
          )
          .join("");
      return {
        op: "reference",
        label,
        probability,
        name: answer
          ? path.length === 3 && ["noul", "choice", "score"].includes(path[2])
            ? path[1]
            : path.slice(1).join(" ")
          : path.at(-1) ?? "Input",
        ...(base.op === "ref" && requests.has(base.id)
          ? { stepId: base.id, path }
          : base.op === "ref" && tasks.has(base.id)
            ? { stepId: base.id, path, source: "task" as const }
            : {}),
      };
    }
    if (node.op === "literal")
      return {
        op: "literal",
        value:
          node.value === null ||
          typeof node.value === "string" ||
          typeof node.value === "boolean" ||
          (typeof node.value === "number" && Number.isFinite(node.value))
            ? (node.value as string | number | boolean | null)
            : "[value unavailable]",
      };
    const args: FlowCondition[] = [];
    for (const arg of node.args) {
      args.push(visit(arg));
      if (remaining < 0) break;
    }
    return { op: node.op, args };
  };
  return visit(ast);
}
function evaluate(
  ast: Ast,
  input: unknown,
  values: Map<string, unknown>,
): unknown {
  if (ast.op === "input") return input;
  if (ast.op === "literal") return ast.value;
  if (ast.op === "ref") {
    if (!values.has(ast.id)) throw new Error(`Unavailable result: ${ast.id}`);
    return values.get(ast.id);
  }
  if (ast.op === "get") {
    const obj = evaluate(ast.from, input, values);
    if (
      obj === null ||
      typeof obj !== "object" ||
      !Object.hasOwn(obj, ast.key) ||
      (obj as Record<string, unknown>)[ast.key] === undefined
    )
      throw new Error(`Missing value: ${describe(ast)}`);
    return (obj as Record<string, unknown>)[ast.key];
  }
  // Evaluate every operand: a missing value must never hide behind short-circuiting.
  const args = ast.args.map((a) => evaluate(a, input, values));
  if (ast.op === "all" || ast.op === "any" || ast.op === "not") {
    if (args.some((v) => typeof v !== "boolean"))
      throw new Error("Boolean condition required");
    return ast.op === "not"
      ? !args[0]
      : ast.op === "all"
        ? args.every(Boolean)
        : args.some(Boolean);
  }
  const [a, b] = args;
  if (ast.op === "eq") {
    if (
      a === undefined ||
      b === undefined ||
      (a !== null && !["string", "number", "boolean"].includes(typeof a)) ||
      (b !== null && !["string", "number", "boolean"].includes(typeof b)) ||
      typeof a !== typeof b ||
      (typeof a === "number" && (!Number.isFinite(a) || !Number.isFinite(b)))
    )
      throw new Error("eq requires matching scalar values");
    return a === b;
  }
  if (
    typeof a !== "number" ||
    typeof b !== "number" ||
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  )
    throw new Error("Numeric comparison requires finite numbers");
  return ast.op === "lt" ? a < b : ast.op === "gt" ? a > b : a >= b;
}

export interface FlowBuilder<T> {
  readonly input: FlowExpression<T>;
  jev<const Q extends Questions>(
    id: string,
    request: Request<Q>,
    display?: FlowDisplay,
  ): AnswerRefs<Q>;
  jev<I, const Q extends Questions>(
    id: string,
    request: FlowRequestFactory<I, Q>,
    display?: FlowDisplay,
  ): AnswerRefs<Q>;
  task<I, O>(
    id: string,
    task: FlowTask<I, O>,
    display?: FlowDisplay,
  ): FlowExpression<Awaited<O>>;
  /** Execute a reusable item program with bounded concurrency; return results in input order. */
  map<I, C, O>(
    id: string,
    options: {
      items: FlowExpression<readonly I[]> | readonly I[];
      input: C;
      concurrency?: number;
      maxItems: number;
    },
    build: (
      item: FlowBuilder<{ item: I; index: number; context: Resolved<C> }>,
    ) => FlowExpression<O>,
    display?: FlowDisplay,
  ): FlowExpression<O[]>;
  /** Pre-test loop with JSON state, explicit context and a required iteration limit. */
  loop<S, C>(
    id: string,
    options: {
      initial: S | FlowExpression<S>;
      input: C;
      while: (state: FlowExpression<NoInfer<S>>) => FlowExpression<boolean>;
      maxIterations: number;
    },
    build: (
      iteration: FlowBuilder<{ state: S; index: number; context: Resolved<C> }>,
    ) => FlowExpression<NoInfer<S>>,
    display?: FlowDisplay,
  ): FlowExpression<S>;
  /** Execute one value-returning path, then continue with its typed result. */
  if<A, B>(
    id: string,
    paths: {
      when: FlowExpression<boolean>;
      then: (path: FlowBuilder<T>) => FlowExpression<A>;
      else: (path: FlowBuilder<T>) => FlowExpression<B>;
    },
    display?: FlowDisplay,
  ): FlowExpression<A | B>;
  /** Terminal decision: each callback must return output() or another branch(). */
  branch(
    id: string,
    paths: {
      when: FlowExpression<boolean>;
      then: (path: FlowBuilder<T>) => FlowExpression<FlowOutcome>;
      else: (path: FlowBuilder<T>) => FlowExpression<FlowOutcome>;
    },
    display?: FlowDisplay,
  ): FlowExpression<FlowOutcome>;
  parallel<
    const B extends Record<
      string,
      (lane: FlowBuilder<T>) => FlowExpression<unknown>
    >,
  >(
    id: string,
    lanes: B,
    display?: FlowDisplay,
  ): { [K in keyof B]: ReturnType<B[K]> };
  output(
    name: string,
    value?: unknown,
    display?: FlowDisplay,
  ): FlowExpression<FlowOutcome>;
}
export function defineJevFlow<T>(
  name: string,
  build: (flow: FlowBuilder<T>) => FlowExpression<FlowOutcome>,
) {
  const owner = {},
    ids = new Set<string>(),
    nodes: FlowNode[] = [];
  const input = new FlowExpression<T>({ op: "input" }, owner);
  let building = true;
  let templateSteps = 0;
  let activeBlock: object | undefined;
  function block(
    callback: (builder: FlowBuilder<T>) => FlowExpression<unknown>,
    available: Set<string>,
    path: string[],
    previous: string[] = [],
    depth = 0,
    requireOutcome = false,
    requireValue = false,
  ): Block {
    if (depth > 16) throw new Error("Flow nesting exceeds 16");
    const token = {};
    const result: Block = { nodes: [] };
    let terminal = false;
    const validate = (value: unknown) =>
      mapValue(value, (expr) => {
        if (owners.get(expr) !== owner)
          throw new Error("Foreign or unowned flow reference");
        inspectAst(expr.ast, (id) => {
          if (!available.has(id))
            throw new Error(`Unavailable reference: ${id}`);
        });
        return expr;
      });
    function add(
      id: string,
      kind: FlowNode["kind"],
      value?: unknown,
      display?: FlowDisplay,
    ): Step {
      if (!building) throw new Error("Flow definition is closed");
      if (activeBlock !== token)
        throw new Error("Use the current branch or lane builder for steps");
      if (terminal)
        throw new Error("No steps allowed after a terminal output or branch");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id) || ids.has(id))
        throw new Error(`Invalid or duplicate step ID: ${id}`);
      if (ids.size + templateSteps >= 256)
        throw new Error("Flows support at most 256 steps");
      const copy: FlowDisplay = {};
      if (display !== undefined) {
        if (!display || typeof display !== "object" || Array.isArray(display))
          throw new Error("Step display metadata must be an object");
        for (const [key, max] of [
          ["title", 120],
          ["description", 600],
        ] as const) {
          const text = display[key];
          if (text === undefined) continue;
          if (typeof text !== "string" || !text.trim() || text.length > max)
            throw new Error(
              `${key} must be a non-empty string of at most ${max} characters`,
            );
          copy[key] = text.trim();
        }
      }
      ids.add(id);
      validate(value);
      const dependencies = new Set(previous);
      mapValue(value, (expr) => {
        inspectAst(expr.ast, (r) => dependencies.add(r));
        return expr;
      });
      nodes.push({
        id,
        kind,
        dependencies: [...dependencies],
        path: [...path],
        ...copy,
      });
      previous = [id];
      available.add(id);
      const step: Step = { id, kind };
      result.nodes.push(step);
      return step;
    }
    const builder: FlowBuilder<T> = {
      input,
      jev<I, Q extends Questions>(
        id: string,
        request: Request<Q> | FlowRequestFactory<I, Q>,
        display?: FlowDisplay,
      ) {
        const dynamic = "request" in request;
        if (dynamic && typeof request.request !== "function")
          throw new Error("Request factory must be a function");
        const frozen = mapValue(
          dynamic ? request.input : request,
          (expr) => expr,
        );
        const step = add(id, "jev", frozen, display);
        if (dynamic) {
          step.input = frozen;
          step.factory = request.request as Step["factory"];
          step.answerNames = new Set();
        } else step.request = frozen as Request<Questions>;
        return {
          answers: new FlowExpression(
            { op: "get", from: { op: "ref", id }, key: "answers" },
            owner,
          ) as never,
          answer(question: string) {
            if (!dynamic && !Object.hasOwn(step.request!.questions, question))
              throw new Error(`Unknown question: ${question}`);
            step.answerNames?.add(question);
            const type = dynamic
              ? undefined
              : step.request!.questions[question].type;
            const fields = dynamic
              ? [
                  "type",
                  "noul",
                  "choice",
                  "score",
                  "confidence",
                  "probabilities",
                  "legend",
                  "box",
                ]
              : type === "noul"
                ? ["type", "noul"]
                : type === "choice"
                  ? ["type", "choice", "confidence", "probabilities"]
                  : type === "score"
                    ? ["type", "score", "confidence", "probabilities", "legend"]
                    : ["type", "box", "confidence"];
            return Object.fromEntries(
              fields.map((field) => [
                field,
                new FlowExpression(
                  {
                    op: "get",
                    from: {
                      op: "get",
                      from: {
                        op: "get",
                        from: { op: "ref", id },
                        key: "answers",
                      },
                      key: question,
                    },
                    key: field,
                  },
                  owner,
                ),
              ]),
            ) as never;
          },
        };
      },
      task(id, task, display) {
        if (typeof task.run !== "function")
          throw new Error("Task run must be a function");
        if (
          task.timeoutMs !== undefined &&
          (!Number.isInteger(task.timeoutMs) ||
            task.timeoutMs < 1 ||
            task.timeoutMs > 2_147_483_647)
        )
          throw new Error("Task timeoutMs must be a positive 32-bit integer");
        const frozen = mapValue(task.input, (expr) => expr);
        const step = add(id, "task", frozen, display);
        step.input = frozen;
        step.task = task.run as Step["task"];
        step.timeoutMs = task.timeoutMs;
        return new FlowExpression({ op: "ref", id }, owner) as never;
      },
      map(id, config, buildItem, display) {
        const concurrency = config.concurrency ?? 4;
        if (
          !Number.isInteger(concurrency) ||
          concurrency < 1 ||
          concurrency > 16
        )
          throw new Error("Map concurrency must be an integer from 1 to 16");
        if (
          !Number.isInteger(config.maxItems) ||
          config.maxItems < 1 ||
          config.maxItems > 64
        )
          throw new Error("Map maxItems must be an integer from 1 to 64");
        const frozen = mapValue(
          { items: config.items, context: config.input },
          (e) => e,
        ) as { items: unknown; context: unknown };
        const step = add(id, "map", frozen, display);
        const parentScope = activeBlock;
        activeBlock = undefined;
        let program: ReturnType<
          typeof defineJevFlow<{
            item: unknown;
            index: number;
            context: unknown;
          }>
        >;
        try {
          program = defineJevFlow<{
            item: unknown;
            index: number;
            context: unknown;
          }>(`Item · ${display?.title ?? id}`.slice(0, 100), (item) => {
            const result = buildItem(item as never);
            let outputId = "item-result";
            for (let suffix = 1; builderIds.get(item)!.has(outputId); suffix++)
              outputId = `item-result-${suffix}`;
            return item.output(outputId, result, {
              title: "Item result",
            });
          });
        } finally {
          activeBlock = parentScope;
        }
        if (program.definition.nodes.some((n) => n.kind === "map"))
          throw new Error("Nested maps are not supported");
        if (program.definition.nodes.some((n) => n.kind === "loop"))
          throw new Error("Loops inside maps are not supported");
        templateSteps += definitionSize(program.definition);
        if (ids.size + templateSteps > 256)
          throw new Error(
            "Flows support at most 256 steps including map templates",
          );
        step.collection = {
          ...frozen,
          concurrency,
          maxItems: config.maxItems,
          program: program as never,
        };
        nodes.find((node) => node.id === id)!.itemDefinition =
          program.definition;
        return new FlowExpression({ op: "ref", id }, owner) as never;
      },
      loop(id, config, buildIteration, display) {
        if (
          !Number.isInteger(config.maxIterations) ||
          config.maxIterations < 1 ||
          config.maxIterations > 64
        )
          throw new Error("Loop maxIterations must be an integer from 1 to 64");
        const gateOwner = {};
        const when = config.while(
          new FlowExpression({ op: "input" }, gateOwner) as never,
        );
        if (!(when instanceof FlowExpression) || owners.get(when) !== gateOwner)
          throw new Error("Loop while must be an expression of its state");
        inspectAst(when.ast, () => {
          throw new Error("Loop while cannot reference outer steps");
        });
        const frozen = mapValue(
          { initial: config.initial, context: config.input },
          (e) => e,
        ) as { initial: unknown; context: unknown };
        const step = add(id, "loop", frozen, display);
        const parentScope = activeBlock;
        activeBlock = undefined;
        let program: ReturnType<typeof defineJevFlow<unknown>>;
        try {
          program = defineJevFlow<unknown>(
            `Iteration · ${display?.title ?? id}`.slice(0, 100),
            (iteration) => {
              const result = buildIteration(iteration as never);
              let outputId = "iteration-result";
              for (
                let suffix = 1;
                builderIds.get(iteration)!.has(outputId);
                suffix++
              )
                outputId = `iteration-result-${suffix}`;
              return iteration.output(outputId, result, {
                title: "Next iteration state",
              });
            },
          );
        } finally {
          activeBlock = parentScope;
        }
        if (program.definition.nodes.some((n) => n.kind === "loop"))
          throw new Error("Nested loops are not supported");
        templateSteps += definitionSize(program.definition);
        if (ids.size + templateSteps > 256)
          throw new Error(
            "Flows support at most 256 steps including iteration templates",
          );
        step.loop = {
          ...frozen,
          when,
          maxIterations: config.maxIterations,
          program,
        };
        const node = nodes.find((n) => n.id === id)!;
        node.itemDefinition = program.definition;
        // Point displayed gate inputs at the loop's captured latest state.
        // Execution still evaluates the original isolated state expression.
        const referenceState = (ast: Ast): Ast => {
          if (ast.op === "input") return { op: "ref", id };
          if (ast.op === "get")
            return { ...ast, from: referenceState(ast.from) };
          if ("args" in ast)
            return { ...ast, args: ast.args.map(referenceState) };
          return ast;
        };
        node.conditionRule = conditionRule(
          referenceState(when.ast),
          new Set(),
          new Set([id]),
        );
        return new FlowExpression({ op: "ref", id }, owner) as never;
      },
      if(id, paths, display) {
        if (!(paths.when instanceof FlowExpression))
          throw new Error("if requires a condition expression");
        const step = add(id, "if", paths.when, display);
        step.when = paths.when;
        const node = nodes.find((n) => n.id === id)!;
        node.condition = describe(paths.when.ast);
        node.conditionRule = conditionRule(
          paths.when.ast,
          new Set(nodes.filter((n) => n.kind === "jev").map((n) => n.id)),
          new Set(
            nodes
              .filter(
                (n) =>
                  n.kind === "task" || n.kind === "merge" || n.kind === "loop",
              )
              .map((n) => n.id),
          ),
        );
        step.then = block(
          paths.then,
          new Set(available),
          [...path, `${id}:then`],
          [id],
          depth + 1,
          false,
          true,
        );
        step.else = block(
          paths.else,
          new Set(available),
          [...path, `${id}:else`],
          [id],
          depth + 1,
          false,
          true,
        );
        // A separate merge keeps the diagram acyclic and gives downstream refs a
        // scope-safe identity, including when an arm returns an existing value.
        const base = `${id.slice(0, 65)}-result`;
        let mergeId = base;
        for (let suffix = 2; ids.has(mergeId); suffix++)
          mergeId = `${base}-${suffix}`;
        const merge = add(mergeId, "merge", undefined, {
          title: "Selected result",
          description: "Continue with the value returned by the selected path.",
        });
        merge.mergeOf = id;
        const mergeNode = nodes.find((n) => n.id === mergeId)!;
        const ends = {
          then: step.then.nodes.at(-1)?.id ?? id,
          else: step.else.nodes.at(-1)?.id ?? id,
        };
        mergeNode.dependencies = [...new Set(Object.values(ends))];
        mergeNode.merge = { condition: id, ...ends };
        return new FlowExpression({ op: "ref", id: mergeId }, owner) as never;
      },
      branch(id, paths, display) {
        const step = add(id, "branch", paths.when, display);
        step.when = paths.when;
        if (!(paths.when instanceof FlowExpression))
          throw new Error("branch requires a condition expression");
        const node = nodes.find((n) => n.id === id)!;
        node.condition = describe(paths.when.ast);
        node.conditionRule = conditionRule(
          paths.when.ast,
          new Set(nodes.filter((n) => n.kind === "jev").map((n) => n.id)),
          new Set(
            nodes
              .filter(
                (n) =>
                  n.kind === "task" || n.kind === "merge" || n.kind === "loop",
              )
              .map((n) => n.id),
          ),
        );
        step.then = block(
          paths.then,
          new Set(available),
          [...path, `${id}:then`],
          [id],
          depth + 1,
          true,
        );
        step.else = block(
          paths.else,
          new Set(available),
          [...path, `${id}:else`],
          [id],
          depth + 1,
          true,
        );
        terminal = true;
        return new FlowExpression<FlowOutcome>({ op: "ref", id }, owner);
      },
      parallel(id, lanes, display) {
        const prior = [...previous],
          base = new Set(available);
        const step = add(id, "parallel", undefined, display);
        step.lanes = {};
        if (!Object.keys(lanes).length)
          throw new Error("parallel requires at least one lane");
        const refs: Record<string, FlowExpression<unknown>> = {};
        const tails: string[] = [];
        for (const [key, callback] of Object.entries(lanes)) {
          if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(key))
            throw new Error("Invalid lane name");
          const lane = block(
            callback,
            new Set(base),
            [...path, `${id}:${key}`],
            prior,
            depth + 1,
          );
          step.lanes[key] = lane;
          tails.push(lane.nodes.at(-1)?.id ?? prior.at(-1) ?? "");
          refs[key] = new FlowExpression(
            { op: "get", from: { op: "ref", id }, key },
            owner,
          );
        }
        nodes.find((n) => n.id === id)!.dependencies = tails.filter(Boolean);
        nodes.find((n) => n.id === id)!.lanes = Object.keys(lanes);
        return refs as never;
      },
      output(outcome, value, display) {
        const step = add(outcome, "output", value, display);
        step.outcome = outcome;
        step.value = mapValue(value, (e) => e);
        terminal = true;
        return new FlowExpression<FlowOutcome>(
          { op: "ref", id: outcome },
          owner,
        );
      },
    };
    builderIds.set(builder, ids);
    const parentBlock = activeBlock;
    activeBlock = token;
    let returned: FlowExpression<unknown>;
    try {
      returned = callback(builder);
    } finally {
      activeBlock = parentBlock;
    }
    if (!(returned instanceof FlowExpression))
      throw new Error(
        "Flow callbacks must return an expression, output, or branch",
      );
    if (requireValue && terminal)
      throw new Error(
        "if paths must return a value, not a terminal output or branch",
      );
    if (requireOutcome && !terminal)
      throw new Error("Branch paths must end with output or branch");
    if (
      terminal &&
      (returned.ast.op !== "ref" || returned.ast.id !== result.nodes.at(-1)!.id)
    )
      throw new Error("Return the terminal output or branch");
    validate(returned);
    result.result = returned;
    return result;
  }
  if (!name.trim() || name.length > 100) throw new Error("Invalid flow name");
  let program: Block;
  try {
    program = block(build, new Set(), [], [], 0, true);
  } finally {
    building = false;
  }
  if (!["branch", "output"].includes(program.nodes.at(-1)?.kind ?? ""))
    throw new Error("Flow must end with output or branch");
  const definition: FlowDefinition = {
    version: 1,
    id: randomUUID(),
    name,
    nodes,
  };
  const definitionView = structuredClone(definition);
  const freezeRule = (rule: unknown): void => {
    if (!rule || typeof rule !== "object") return;
    for (const value of Object.values(rule)) freezeRule(value);
    Object.freeze(rule);
  };
  for (const node of definitionView.nodes) {
    Object.freeze(node.dependencies);
    Object.freeze(node.path);
    if (node.lanes) Object.freeze(node.lanes);
    freezeRule(node.conditionRule);
    freezeRule(node.itemDefinition);
    Object.freeze(node);
  }
  Object.freeze(definitionView.nodes);
  Object.freeze(definitionView);
  return {
    definition: definitionView,
    async run(
      data: T,
      options: FlowRunOptions,
    ): Promise<{ runId: string; outcome: string; value?: unknown }> {
      const controller = new AbortController();
      // Preserve the initiating failure before aborting siblings: their cancellation
      // can reach a surrounding parallel join before the failing map settles.
      let siblingFailure: { error: unknown } | undefined;
      const stopSiblings = (error: unknown) => {
        if (!controller.signal.aborted) siblingFailure = { error };
        controller.abort(error);
      };
      const cancel = () => controller.abort(options.signal?.reason);
      if (options.signal?.aborted) cancel();
      else options.signal?.addEventListener("abort", cancel, { once: true });
      const run: FlowRun = {
        version: 1,
        id: randomUUID(),
        definitionId: definition.id,
        name,
        startedAt: Date.now(),
        status: "pending",
        steps: Object.fromEntries(
          nodes.map((n) => [
            n.id,
            { id: n.id, executionId: randomUUID(), status: "waiting" },
          ]),
        ),
      };
      const started = performance.now(),
        values = new Map<string, unknown>();
      const budget = executionBudgets.get(options) ?? { used: nodes.length };
      const reserve = (count: number) => {
        if (budget.used + count > 1024)
          throw new RangeError("Flow exceeds 1024 expanded steps");
        budget.used += count;
      };
      let observer: ReturnType<FlowObserver["startFlow"]>;
      try {
        observer = options.devtools?.startFlow(
          structuredClone(definition),
          structuredClone(run),
        );
      } catch {
        /* Recording cannot stop execution. */
      }
      const emit = () => {
        try {
          if (observer) {
            const { value, steps, ...metadata } = run;
            // Stable data snapshots are captured once by the recorder, not
            // cloned/redacted again on every unrelated step update.
            observer.update({
              ...structuredClone(metadata),
              steps: Object.fromEntries(
                Object.entries(steps).map(([id, step]) => [id, { ...step }]),
              ),
              ...(value !== undefined ? { value } : {}),
            });
          }
        } catch {
          /* Best effort capture. */
        }
      };
      const abortCheck = () => {
        if (controller.signal.aborted)
          throw new DOMException("Flow cancelled", "AbortError");
      };
      const mark = (b: Block, status: FlowStep["status"]) => {
        for (const step of b.nodes) {
          if (run.steps[step.id].status === "waiting")
            run.steps[step.id].status = status;
          if (step.then) mark(step.then, status);
          if (step.else) mark(step.else, status);
          for (const lane of Object.values(step.lanes ?? {}))
            mark(lane, status);
        }
      };
      async function execute(b: Block): Promise<unknown> {
        for (const step of b.nodes) {
          abortCheck();
          const state = run.steps[step.id],
            time = performance.now();
          state.status = "running";
          state.startedAt = Date.now();
          emit();
          try {
            let value: unknown;
            if (step.kind === "jev") {
              const generated = step.factory
                ? step.factory(
                    jsonSnapshot(
                      mapValue(step.input, (e) =>
                        evaluate(e.ast, data, values),
                      ),
                    ) as never,
                  )
                : step.request;
              if (step.factory) {
                if (
                  generated &&
                  typeof (generated as unknown as { then?: unknown }).then ===
                    "function"
                ) {
                  // Invalid async factories must not leave an unhandled rejection.
                  void Promise.resolve(generated).catch(() => {});
                  throw new TypeError("Request factory must be synchronous");
                }
                if (!plain(generated) || !plain(generated.questions))
                  throw new Error(
                    "Request factory must return a synchronous SDK request",
                  );
                for (const name of step.answerNames!)
                  if (!Object.hasOwn(generated.questions, name))
                    throw new Error(`Unknown generated question: ${name}`);
              }
              const request = mapValue(generated, (e) => {
                if (step.factory)
                  throw new Error(
                    "Request factories must return resolved values",
                  );
                return evaluate(e.ast, data, values);
              }) as SystemOneRequest<Questions>;
              abortCheck();
              const call = () =>
                options.client.systemOne(request, {
                  signal: controller.signal,
                });
              const link = {
                runId: run.id,
                stepId: step.id,
                executionId: state.executionId,
              };
              value = await runCallback(
                () =>
                  observer
                    ? observer.request(
                        link,
                        (id) => {
                          if (
                            controller.signal.aborted ||
                            state.status !== "running"
                          )
                            return;
                          state.traceId = id;
                          emit();
                        },
                        call,
                      )
                    : call(),
                controller.signal,
              );
              abortCheck();
            } else if (step.kind === "task") {
              const input = jsonSnapshot(
                mapValue(step.input, (e) => evaluate(e.ast, data, values)),
              );
              state.data = { input };
              emit();
              value = jsonSnapshot(
                await runCallback(
                  (signal) =>
                    step.task!(jsonSnapshot(input) as never, {
                      signal,
                      runId: run.id,
                      stepId: step.id,
                      executionId: state.executionId,
                    }),
                  controller.signal,
                  step.timeoutMs,
                ),
              );
              abortCheck();
              state.data = { input, output: jsonSnapshot(value) };
            } else if (step.kind === "loop") {
              const config = step.loop!;
              const initial = jsonSnapshot(
                mapValue(config.initial, (e) => evaluate(e.ast, data, values)),
              );
              const context = jsonSnapshot(
                mapValue(config.context, (e) => evaluate(e.ast, data, values)),
              );
              let current = jsonSnapshot(initial);
              state.collection = { total: 0, concurrency: 1, items: [] };
              state.loop = { maxIterations: config.maxIterations };
              state.data = { input: initial, output: current };
              for (let index = 0; ; index++) {
                abortCheck();
                const decision = evaluate(config.when.ast, current, new Map());
                if (typeof decision !== "boolean")
                  throw new TypeError(
                    "Loop condition did not return a boolean",
                  );
                state.decision = decision;
                if (!decision) {
                  state.loop = { ...state.loop, stopReason: "condition" };
                  break;
                }
                if (index === config.maxIterations) {
                  state.loop = { ...state.loop, stopReason: "limit" };
                  throw new FlowLoopLimitError();
                }
                reserve(config.program.definition.nodes.length);
                state.collection = {
                  ...state.collection,
                  total: index + 1,
                  items: [
                    ...state.collection!.items,
                    { index, status: "waiting" },
                  ],
                };
                const updateIteration = (child: FlowRun) => {
                  state.collection = {
                    ...state.collection!,
                    items: state.collection!.items.map((item) =>
                      item.index === index
                        ? {
                            index,
                            status:
                              child.status === "pending"
                                ? "running"
                                : child.status === "success"
                                  ? "completed"
                                  : child.status,
                            run: child,
                          }
                        : item,
                    ),
                  };
                  emit();
                };
                const result = await config.program.run(
                  { state: current, index, context },
                  withBudget(
                    {
                      client: options.client,
                      signal: controller.signal,
                      devtools: {
                        startFlow(_definition, child) {
                          updateIteration(child);
                          return {
                            update: updateIteration,
                            request(link, onTrace, callback) {
                              return observer
                                ? observer.request(
                                    {
                                      ...link,
                                      runId: run.id,
                                      stepId: `${step.id}/${index}/${link.stepId}`,
                                    },
                                    onTrace,
                                    callback,
                                  )
                                : callback();
                            },
                          };
                        },
                      },
                    },
                    budget,
                  ),
                );
                abortCheck();
                current = jsonSnapshot(result.value);
                state.data = { input: initial, output: current };
              }
              value = current;
            } else if (step.kind === "map") {
              const config = step.collection!;
              const items = jsonSnapshot(
                mapValue(config.items, (e) => evaluate(e.ast, data, values)),
              );
              const context = jsonSnapshot(
                mapValue(config.context, (e) => evaluate(e.ast, data, values)),
              );
              if (!Array.isArray(items))
                throw new TypeError("Map items must be an array");
              if (items.length > config.maxItems)
                throw new RangeError("Map exceeds maxItems");
              reserve(items.length * config.program.definition.nodes.length);
              state.collection = {
                total: items.length,
                concurrency: config.concurrency,
                items: items.map((_, index) => ({ index, status: "waiting" })),
              };
              emit();
              const results: unknown[] = new Array(items.length);
              let next = 0,
                failed = false,
                firstError: unknown;
              const updateItem = (index: number, child: FlowRun) => {
                state.collection = {
                  ...state.collection!,
                  items: state.collection!.items.map((item) =>
                    item.index === index
                      ? {
                          index,
                          status:
                            child.status === "pending"
                              ? "running"
                              : child.status === "success"
                                ? "completed"
                                : child.status,
                          run: child,
                        }
                      : item,
                  ),
                };
                emit();
              };
              const worker = async () => {
                while (
                  !controller.signal.aborted &&
                  !failed &&
                  next < items.length
                ) {
                  const index = next++;
                  try {
                    const result = await config.program.run(
                      { item: items[index], index, context },
                      withBudget(
                        {
                          client: options.client,
                          signal: controller.signal,
                          devtools: {
                            startFlow(_definition, child) {
                              updateItem(index, child);
                              return {
                                update(child) {
                                  updateItem(index, child);
                                },
                                request(link, onTrace, callback) {
                                  return observer
                                    ? observer.request(
                                        {
                                          ...link,
                                          runId: run.id,
                                          stepId: `${step.id}/${index}/${link.stepId}`,
                                        },
                                        onTrace,
                                        callback,
                                      )
                                    : callback();
                                },
                              };
                            },
                          },
                        },
                        budget,
                      ),
                    );
                    results[index] = result.value;
                  } catch (error) {
                    if (!failed) {
                      failed = true;
                      firstError = error;
                    }
                    stopSiblings(error);
                  }
                }
              };
              await Promise.all(
                Array.from(
                  { length: Math.min(config.concurrency, items.length) },
                  worker,
                ),
              );
              if (failed || controller.signal.aborted) {
                state.collection = {
                  ...state.collection,
                  items: state.collection!.items.map((item) =>
                    item.status === "waiting"
                      ? {
                          ...item,
                          status: options.signal?.aborted
                            ? "cancelled"
                            : "blocked",
                        }
                      : item,
                  ),
                };
                if (failed) throw firstError;
                abortCheck();
              }
              value = results;
            } else if (step.kind === "merge") {
              value = values.get(step.mergeOf!);
              state.decision = run.steps[step.mergeOf!].decision;
              // Capture is observational; a direct input/reference can contain
              // a non-JSON value even though task boundaries require JSON.
              try {
                state.data = { output: jsonSnapshot(value) };
              } catch {
                state.data = "Selected value could not be captured as JSON.";
              }
            } else if (step.kind === "branch" || step.kind === "if") {
              const decision = evaluate(step.when!.ast, data, values);
              if (typeof decision !== "boolean")
                throw new Error("Branch condition did not return a boolean");
              state.decision = decision;
              mark(decision ? step.else! : step.then!, "untaken");
              emit();
              value = await execute(decision ? step.then! : step.else!);
            } else if (step.kind === "parallel") {
              const entries = Object.entries(step.lanes!);
              let firstError: unknown;
              let failed = false;
              const results = await Promise.allSettled(
                entries.map(async ([, lane]) => {
                  try {
                    return await execute(lane);
                  } catch (e) {
                    if (!failed) {
                      firstError = siblingFailure ? siblingFailure.error : e;
                      failed = true;
                    }
                    stopSiblings(e);
                    throw e;
                  }
                }),
              );
              if (failed) throw firstError;
              value = Object.fromEntries(
                results.map((r, i) => [
                  entries[i][0],
                  (r as PromiseFulfilledResult<unknown>).value,
                ]),
              );
            } else
              value = {
                outcome: step.outcome!,
                value: mapValue(step.value, (e) =>
                  evaluate(e.ast, data, values),
                ),
              };
            values.set(step.id, value);
            state.status = "completed";
          } catch (error) {
            state.status =
              error instanceof Error &&
              ["AbortError", "APIUserAbortError"].includes(error.name)
                ? "cancelled"
                : "error";
            state.error = error instanceof Error ? error.name : "FlowError";
            throw error;
          } finally {
            state.durationMs = performance.now() - time;
            emit();
          }
        }
        return evaluate(b.result!.ast, data, values);
      }
      try {
        const result = (await execute(program)) as FlowOutcome;
        abortCheck();
        if (!result || typeof result.outcome !== "string")
          throw new Error("Flow must return a named output");
        run.status = "success";
        run.outcome = result.outcome;
        // Only the recorder snapshots output data; runtime keeps the actual typed value.
        if (result.value !== undefined)
          run.value = result.value as FlowRun["value"];
        return { runId: run.id, ...result };
      } catch (error) {
        run.status =
          error instanceof Error &&
          ["AbortError", "APIUserAbortError"].includes(error.name)
            ? "cancelled"
            : "error";
        run.error = error instanceof Error ? error.name : "FlowError";
        mark(program, run.status === "cancelled" ? "cancelled" : "blocked");
        throw error;
      } finally {
        run.durationMs = performance.now() - started;
        emit();
        options.signal?.removeEventListener("abort", cancel);
      }
    },
  };
}
