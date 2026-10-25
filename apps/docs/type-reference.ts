import { fileURLToPath } from "node:url";
import ts from "typescript";
import { typeHelp } from "./type-help.js";

const descriptions: Record<string, string> = {
  ...Object.fromEntries(Object.entries(typeHelp).map(([name, help]) => [name, help.description])),
  Trace: "One captured request, its attempts, answers, timing, status, and capture warnings.",
  Snapshot: "Version 1 full trace history message.",
  StreamSnapshot: "Version 2 initial trace history with a revision cursor.",
  TraceDelta: "Version 2 incremental update. order is authoritative: remove retained IDs absent from it.",
  Json: "The JSON-safe shape used for captured data, which may be redacted or truncated.",
  AnswerView: "Captured SDK answer fields; available fields depend on the question type.",
  QuestionView: "Captured question type, instructions, and criteria.",
  FlowDefinition: "Static recipe graph, including its identity, name, and node metadata.",
  FlowRun: "Captured execution state, with per-step progress and optional outcome, value, or error.",
  FlowStep: "Captured step state, timing, decisions, trace linkage, and collection/loop progress.",
  BuiltFlowFixture: "Unreleased. Exported fixture plus missing capture IDs and warnings to inspect before saving.",
  AnswerChange: "Unreleased. One scalar answer-field comparison; delta exists only for finite numeric differences.",
  ComparableFlow: "Unreleased. A definition and executable run method accepted by compareWithFixture.",
  FixtureComparison: "Unreleased. Outcome/value/decision/step changes, answer drift, and unredacted live fixture.",
};

const supportingDescriptions: Record<string, string> = {
  FlowNode: "One step in a flow’s static graph, including its kind, dependencies, and any nested item program. The inspector uses these nodes to display the recipe.",
  FlowCondition: "A recorded description of a condition, built from references, literal values, and comparison operators. It lets the inspector display the rule behind a decision.",
  AnswerValue: "A scalar answer field used in fixture comparisons: a string, number, boolean, or null.",
  Request: "The flow builder’s request shape, based on the SDK request with state that can contain flow references. The runner resolves that state before sending the request.",
  AnswerRefs: "The references returned by a Jev step: named answer fields through answer(), and the complete answer object through answers. These values resolve during execution.",
  Adapter: "The object returned by createJevDevtools(), containing client creation, HTTP handlers, session handling, and flow observation methods.",
  Ast: "The expression tree that describes how a flow value is read or calculated. It stores inputs, step references, field selections, literals, and operators for evaluation during a run.",
};

// Read the installed public declarations, never browser-load the compiler or
// import package internals into a consumer example. Package checks build these
// declarations before docs verification.
export function publicTypeReference(referenceMarkdown: string) {
  const introductions = new Map(
    [...referenceMarkdown.matchAll(/^### ([^\n]+)\n\n([^\n]+(?:\n(?!\n)[^\n]+)*)/gm)]
      .map((match) => [match[1], match[2]]),
  );
  const modules = ["jev-devtools", "jev-devtools/server", "jev-devtools/flow"];
  const roots = modules.map((name) => fileURLToPath(import.meta.resolve(name)).replace(/\.js$/, ".d.ts"));
  const program = ts.createProgram(roots, { skipLibCheck: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext });
  const checker = program.getTypeChecker();
  const publicTypes = new Map<string, { node: ts.Declaration; imports: string[] }>();
  const callables: { name: string; node: ts.Declaration; module: string }[] = [];
  const dereference = (symbol: ts.Symbol) => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  roots.forEach((root, index) => {
    const file = program.getSourceFile(root);
    const symbol = file && checker.getSymbolAtLocation(file);
    if (!symbol) throw new Error(`Build the package before generating docs: ${root}`);
    for (const exported of checker.getExportsOfModule(symbol)) {
      const node = dereference(exported).declarations?.[0];
      if (!node) continue;
      const name = exported.name;
      if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
        const entry = publicTypes.get(name) ?? { node, imports: [] };
        entry.imports.push(modules[index]);
        publicTypes.set(name, entry);
      } else if (!callables.some((item) => item.name === name)) {
        callables.push({ name, node, module: modules[index] });
      }
    }
  });
  const supporting = new Map<string, ts.Declaration>();
  const collect = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const found = checker.getSymbolAtLocation(node);
      const symbol = found && dereference(found);
      const declaration = symbol?.declarations?.[0];
      if (declaration && (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) &&
          declaration.getSourceFile().fileName.includes("/jev-devtools/lib/") &&
          !publicTypes.has(symbol!.name) && !supporting.has(symbol!.name)) {
        supporting.set(symbol!.name, declaration);
        ts.forEachChild(declaration, collect);
      }
    }
    ts.forEachChild(node, collect);
  };
  for (const { node } of [...publicTypes.values(), ...callables]) ts.forEachChild(node, collect);
  const declaration = (node: ts.Declaration) => {
    // A variable declaration has no statement wrapper in getText().
    const text = ts.isVariableDeclaration(node) ? `declare const ${node.getText()};` : node.getText();
    return `<details>\n<summary>Exact TypeScript declaration</summary>\n\n\x60\x60\x60ts\n${text}\n\x60\x60\x60\n\n</details>`;
  };
  return [...publicTypes].map(([name, { node, imports }]) => {
    if (!descriptions[name]) throw new Error(`Add a human-readable API description for ${name}`);
    return `### Type: ${name}\n\n${descriptions[name]}\n\n**Import type from:** ${imports.map((name) => `\x60${name}\x60`).join(" or ")}.\n\n${declaration(node)}`;
  }).join("\n\n") +
    "\n\n## Exact callable declarations\n\nThese expandable declarations preserve the actual generic signatures behind the readable method summaries.\n\n" +
    callables.map(({ name, node, module }) => {
      const introduction = introductions.get(name);
      if (!introduction || introduction.startsWith("#")) throw new Error(`Add a glossary introduction for ${name}`);
      return `#### ${name} declaration\n\n${introduction}\n\nImport from \x60${module}\x60.\n\n${declaration(node)}`;
    }).join("\n\n") +
    "\n\n## Supporting structural types\n\nThese shapes appear inside the public contracts above. They are **not named public exports**; do not import them from package internals. SDK and platform types are defined by their respective packages.\n\n" +
    [...supporting].map(([name, node]) => {
      const description = supportingDescriptions[name];
      if (!description) throw new Error(`Add a supporting-type description for ${name}`);
      return `#### ${name} shape\n\n${description}\n\n${declaration(node)}`;
    }).join("\n\n");
}
