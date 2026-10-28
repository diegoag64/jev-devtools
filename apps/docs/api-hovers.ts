import ts from "typescript";
import { apiHelp, type Help } from "./api-help.js";

type Kind = string | undefined;
type Scope = Map<string, Kind>;
type Spec = {
  help: string;
  result?: string;
  options?: [number, string];
  callbacks?: Record<number, string>;
  lanes?: number;
};
type Context = { options?: string; params?: string[]; lanes?: boolean };
export type ApiHover = {
  start: number;
  end: number;
  target: string;
  help: Help;
};
const functions: Record<string, Spec> = {
  define: { help: "define", result: "program", callbacks: { 1: "builder" } },
  adapterCreate: {
    help: "adapterCreate",
    result: "adapter",
    options: [0, "adapterCreate"],
  },
  adapterShared: {
    help: "adapterShared",
    result: "adapter",
    options: [1, "adapterCreate"],
  },
  recorder: { help: "recorder", result: "recorder", options: [0, "recorder"] },
  replay: { help: "replay" },
  inspection: { help: "inspection", options: [0, "inspection"] },
  all: { help: "all", result: "expression" },
  any: { help: "any", result: "expression" },
  not: { help: "not", result: "expression" },
};
const methods: Record<string, Record<string, Spec>> = {
  builder: {
    jev: { help: "jev", result: "answers", options: [1, "jev"] },
    branch: { help: "branch", result: "expression", options: [1, "branch"] },
    output: { help: "output", result: "expression" },
    task: { help: "task", result: "expression", options: [1, "task"] },
    map: {
      help: "map",
      result: "expression",
      options: [1, "map"],
      callbacks: { 2: "builder" },
    },
    loop: {
      help: "loop",
      result: "expression",
      options: [1, "loop"],
      callbacks: { 2: "builder" },
    },
    if: { help: "if", result: "expression", options: [1, "if"] },
    parallel: { help: "parallel", result: "joined", lanes: 1 },
  },
  program: { run: { help: "run", options: [1, "run"] } },
  answers: { answer: { help: "answer", result: "answer" } },
  expression: Object.fromEntries(
    ["get", "eq", "lt", "gt", "gte"].map((name) => [
      name,
      { help: name, result: "expression" },
    ]),
  ),
  adapter: {
    createClient: { help: "adapterClient", options: [1, "adapterClient"] },
    middleware: { help: "adapterMiddleware" },
    handle: { help: "adapterHandle" },
    handleNodeRoute: { help: "adapterRoute" },
    run: { help: "adapterRun" },
    dispose: { help: "adapterDispose" },
  },
  recorder: {
    instrument: {
      help: "recorderInstrument",
      options: [1, "recorderInstrument"],
    },
    transport: { help: "recorderTransport" },
    subscribe: { help: "recorderSubscribe" },
    snapshot: { help: "recorderSnapshot" },
  },
};
const exportsByModule: Record<string, Record<string, string>> = {
  "jev-devtools": { JevDevtools: "component", FlowFixture: "fixture" },
  "jev-devtools/viewer": {
    JevFlowViewer: "viewer",
    useJevInspection: "fn:inspection",
  },
  "jev-devtools/server": {
    createJevDevtools: "fn:adapterCreate",
    getJevDevtools: "fn:adapterShared",
    JevRecorder: "fn:recorder",
  },
  "jev-devtools/flow": {
    defineJevFlow: "fn:define",
    replayClient: "fn:replay",
    FlowFixture: "fixture",
    all: "fn:all",
    any: "fn:any",
    not: "fn:not",
  },
};
// Fragments explicitly name the surrounding context that their prose supplies.
// Complete examples infer API receivers from imports, factory results and callbacks.
const contexts: Record<string, Record<string, string>> = {
  core: {},
  server: { inspector: "adapter", createJevDevtools: "fn:adapterCreate" },
  expressions: {
    flow: "builder",
    classification: "answers",
    eligibility: "answers",
    risk: "answers",
    all: "fn:all",
    any: "fn:any",
    not: "fn:not",
  },
  parallel: { flow: "builder" },
};

export function apiHovers(
  code: string,
  language: string,
  profile = "core",
): ApiHover[] {
  if (!Object.hasOwn(contexts, profile))
    throw new Error(`Unknown API help context: ${profile}`);
  const source = ts.createSourceFile(
    "example." + language,
    code,
    ts.ScriptTarget.Latest,
    true,
    language === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const selected = new Map<number, ApiHover>();
  const scope: Scope = new Map(Object.entries(contexts[profile]));
  const add = (node: ts.Node, help: Help) =>
    selected.set(node.getStart(source), {
      start: node.getStart(source),
      end: node.end,
      target: node.getText(source),
      help,
    });
  const propertyHelp = (family: string, name: string): Help | undefined => {
    const owner = apiHelp[family];
    const key = Object.keys(owner.props ?? {}).find(
      (key) => key.replace(/\?$/, "") === name,
    );
    return key
      ? {
          title: `${owner.title} · ${key}`,
          signature: name,
          description: owner.props![key],
        }
      : undefined;
  };
  function callSpec(expression: ts.Expression, env: Scope): Spec | undefined {
    if (ts.isIdentifier(expression)) {
      const kind = env.get(expression.text);
      return kind?.startsWith("fn:") ? functions[kind.slice(3)] : undefined;
    }
    if (ts.isPropertyAccessExpression(expression))
      return methods[kindOf(expression.expression, env) ?? ""]?.[
        expression.name.text
      ];
  }
  function kindOf(node: ts.Expression, env: Scope): Kind {
    if (ts.isParenthesizedExpression(node)) return kindOf(node.expression, env);
    if (ts.isIdentifier(node)) return env.get(node.text);
    if (ts.isCallExpression(node) || ts.isNewExpression(node))
      return callSpec(node.expression, env)?.result;
    if (ts.isPropertyAccessExpression(node)) {
      const owner = kindOf(node.expression, env);
      if (
        (owner === "builder" && node.name.text === "input") ||
        owner === "answer" ||
        owner === "joined"
      )
        return "expression";
    }
  }
  function bindName(name: ts.BindingName, env: Scope, kind?: string) {
    if (ts.isIdentifier(name)) env.set(name.text, kind);
    else
      for (const item of name.elements)
        if (ts.isBindingElement(item)) bindName(item.name, env);
  }
  function visit(node: ts.Node, env: Scope, context: Context = {}) {
    if (ts.isImportDeclaration(node)) {
      const module = ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : "";
      const names = node.importClause?.namedBindings;
      if (names && ts.isNamedImports(names))
        for (const item of names.elements) {
          const exported = (item.propertyName ?? item.name).text;
          const kind =
            exportsByModule[module]?.[exported] ??
            (module.startsWith(".") &&
            /\/(server(?:\.js)?|server\/jev(?:\.js)?)$/.test(module) &&
            exported === "inspector"
              ? "adapter"
              : undefined);
          env.set(item.name.text, kind);
        }
      return; // Import names are not interactive.
    }
    if (ts.isParenthesizedExpression(node))
      return visit(node.expression, env, context);
    if (ts.isBlock(node) || ts.isSourceFile(node)) {
      const local = new Map(env);
      // Shadow outer API bindings even before local declarations are visited.
      for (const statement of node.statements)
        if (ts.isVariableStatement(statement))
          for (const declaration of statement.declarationList.declarations)
            bindName(declaration.name, local);
      for (const statement of node.statements) visit(statement, local, context);
      return;
    }
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node)
    ) {
      const local = new Map(env);
      node.parameters.forEach((param, index) =>
        bindName(param.name, local, context.params?.[index]),
      );
      if (node.body) visit(node.body, local, { options: context.options });
      return;
    }
    if (ts.isReturnStatement(node)) {
      if (node.expression) visit(node.expression, env, context);
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      const fixture =
        node.type &&
        ts.isTypeReferenceNode(node.type) &&
        ts.isIdentifier(node.type.typeName) &&
        env.get(node.type.typeName.text) === "fixture";
      if (fixture && node.type && ts.isTypeReferenceNode(node.type))
        add(node.type.typeName, apiHelp.fixture);
      bindName(
        node.name,
        env,
        node.initializer ? kindOf(node.initializer, env) : undefined,
      );
      if (node.initializer)
        visit(node.initializer, env, {
          options: fixture ? "fixture" : undefined,
        });
      return;
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const spec = callSpec(node.expression, env);
      if (spec)
        add(
          ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name
            : node.expression,
          apiHelp[spec.help],
        );
      visit(node.expression, env);
      node.arguments?.forEach((arg, index) =>
        visit(arg, env, {
          options: spec?.options?.[0] === index ? spec.options[1] : undefined,
          params: spec?.callbacks?.[index]
            ? [spec.callbacks[index]]
            : undefined,
          lanes: spec?.lanes === index,
        }),
      );
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      const kind = kindOf(node.expression, env);
      const member = node.name.text;
      const method = methods[kind ?? ""]?.[member];
      if (method) add(node.name, apiHelp[method.help]);
      else if (kind === "builder" && member === "input")
        add(node.name, apiHelp.input);
      else if (kind === "answer" && ["choice", "noul"].includes(member))
        add(node.name, apiHelp[member]);
      visit(node.expression, env);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (
          ts.isPropertyAssignment(prop) ||
          ts.isShorthandPropertyAssignment(prop)
        ) {
          const name =
            ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
              ? prop.name.text
              : "";
          const help = context.options
            ? propertyHelp(context.options, name)
            : undefined;
          if (help) add(prop.name, help);
          if (ts.isPropertyAssignment(prop)) {
            const builder =
              context.lanes ||
              (["branch", "if"].includes(context.options ?? "") &&
                ["then", "else"].includes(name));
            const condition = context.options === "loop" && name === "while";
            visit(prop.initializer, env, {
              params: builder
                ? ["builder"]
                : condition
                  ? ["expression"]
                  : undefined,
            });
          }
        } else visit(prop, env);
      }
      return;
    }
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (
        ts.isIdentifier(node.tagName) &&
        ["component", "viewer"].includes(env.get(node.tagName.text) ?? "")
      ) {
        const key =
          env.get(node.tagName.text) === "viewer" ? "viewer" : "react";
        add(node.tagName, apiHelp[key]);
        for (const attr of node.attributes.properties)
          if (ts.isJsxAttribute(attr)) {
            const help = propertyHelp(key, attr.name.getText(source));
            if (help) add(attr.name, help);
          }
      }
      ts.forEachChild(node.attributes, (child) => visit(child, env));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, env));
  }
  visit(source, scope);
  return [...selected.values()].sort((a, b) => a.start - b.start);
}
