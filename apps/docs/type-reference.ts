import { fileURLToPath } from "node:url";
import ts from "typescript";

const descriptions: Record<string, string> = {
  JevDevtoolsProps: "Props for the React drawer: enablement, endpoint, initial open state, and display masking.",
  Trace: "One captured request, its attempts, answers, timing, status, and capture warnings.",
  Snapshot: "Version 1 full trace history message.",
  StreamSnapshot: "Version 2 initial trace history with a revision cursor.",
  TraceDelta: "Version 2 incremental update. order is authoritative: remove retained IDs absent from it.",
  Json: "The JSON-safe shape used for captured data, which may be redacted or truncated.",
  AnswerView: "Captured SDK answer fields; available fields depend on the question type.",
  QuestionView: "Captured question type, instructions, and criteria.",
  JevDevtoolsServerOptions: "Server adapter configuration, including CaptureOptions, access checks, and session selection.",
  CaptureOptions: "Trace retention and captured-value redaction shared by the adapter and recorder.",
  ClientMetadata: "Optional capture label and sample/live source label; neither changes the SDK transport.",
  FlowBuilder: "The synchronous recipe-building interface. Its methods return references, not runtime results.",
  FlowOutcome: "A named terminal outcome and optional value. The value is unknown; narrow it in your app.",
  FlowRunOptions: "Required SDK-compatible client, optional observer, and cancellation signal.",
  FlowTask: "Resolved task input, application callback, and optional timeout.",
  FlowRequestFactory: "Input to resolve before synchronously constructing an SDK request.",
  TaskContext: "Cancellation signal and identifiers passed as a task callback's second argument.",
  Resolved: "Recursively replaces expression references in an input shape with their value types.",
  FlowObserver: "Per-run capture hooks. Return undefined to skip recording; execution belongs to the runner.",
  FlowDisplay: "Optional title and description for the inspector, not model instructions or business behavior.",
  FlowDefinition: "Static recipe graph, including its identity, name, and node metadata.",
  FlowRun: "Captured execution state, with per-step progress and optional outcome, value, or error.",
  FlowStep: "Captured step state, timing, decisions, trace linkage, and collection/loop progress.",
  FlowFixture: "Unreleased. Saved Jev response bodies indexed by step ID; no original input or implementation.",
  BuiltFlowFixture: "Unreleased. Exported fixture plus missing capture IDs and warnings to inspect before saving.",
  AnswerChange: "Unreleased. One scalar answer-field comparison; delta exists only for finite numeric differences.",
  ComparableFlow: "Unreleased. A definition and executable run method accepted by compareWithFixture.",
  FixtureComparison: "Unreleased. Outcome/value/decision/step changes, answer drift, and unredacted live fixture.",
};

// Read the installed public declarations, never browser-load the compiler or
// import package internals into a consumer example. Package checks build these
// declarations before docs verification.
export function publicTypeReference() {
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
    callables.map(({ name, node, module }) => `#### ${name} declaration\n\nImport from \x60${module}\x60.\n\n${declaration(node)}`).join("\n\n") +
    "\n\n## Supporting structural types\n\nThese shapes appear inside the public contracts above. They are **not named public exports**; do not import them from package internals. SDK and platform types are defined by their respective packages.\n\n" +
    [...supporting].map(([name, node]) => `#### ${name} shape\n\n${declaration(node)}`).join("\n\n");
}
