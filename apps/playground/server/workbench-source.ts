import ts from "typescript-source";
import type { FlowDefinition } from "jev-devtools/flow";
import type { SourceRange, TutorialStep } from "../src/workbench/types.js";

const methods = new Set([
  "task",
  "jev",
  "map",
  "loop",
  "if",
  "branch",
  "parallel",
  "output",
]);
/** Derive line ranges from syntax rather than maintaining fragile line numbers. */
export function mapCookbookSource(source: string, definition: FlowDefinition) {
  const file = ts.createSourceFile(
    "flow.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const calls: {
    id: string;
    method: string;
    range: SourceRange;
    start: number;
    end: number;
  }[] = [];
  const helpers = new Map<
    string,
    { index: number; method: string; range: SourceRange }
  >();
  for (const statement of file.statements) {
    if (
      !ts.isFunctionDeclaration(statement) ||
      !statement.name ||
      !statement.body
    )
      continue;
    const returned = statement.body.statements.find(
      ts.isReturnStatement,
    )?.expression;
    if (
      !returned ||
      !ts.isCallExpression(returned) ||
      !ts.isPropertyAccessExpression(returned.expression)
    )
      continue;
    const id = returned.arguments[0];
    const index = statement.parameters.findIndex(
      (parameter) => id && parameter.name.getText(file) === id.getText(file),
    );
    if (index >= 0 && methods.has(returned.expression.name.text))
      helpers.set(statement.name.text, {
        index,
        method: returned.expression.name.text,
        range: {
          start:
            file.getLineAndCharacterOfPosition(statement.getStart(file)).line +
            1,
          end: file.getLineAndCharacterOfPosition(statement.end).line + 1,
        },
      });
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const helper = helpers.get(node.expression.text);
      const id = helper && node.arguments[helper.index];
      if (helper && id && ts.isStringLiteralLike(id))
        calls.push({
          id: id.text,
          method: helper.method,
          start: node.getStart(file),
          end: node.end,
          range: {
            start:
              file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
            end: file.getLineAndCharacterOfPosition(node.end).line + 1,
          },
        });
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      methods.has(node.expression.name.text)
    ) {
      const id = node.arguments[0];
      if (id && (ts.isStringLiteralLike(id) || ts.isTemplateExpression(id))) {
        calls.push({
          id: ts.isStringLiteralLike(id) ? id.text : id.getText(file),
          method: node.expression.name.text,
          start: node.getStart(file),
          end: node.end,
          range: {
            start:
              file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
            end: file.getLineAndCharacterOfPosition(node.end).line + 1,
          },
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  const matches = (id: string, candidate: string) => {
    if (id === candidate) return true;
    if (!candidate.startsWith("`")) return false;
    const escaped = candidate
      .slice(1, -1)
      .split(/\$\{[^}]+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".+");
    return new RegExp(`^${escaped}$`).test(id);
  };
  const sourceRanges: Record<string, SourceRange> = {};
  const grouped = new Map<
    string,
    { call: (typeof calls)[number]; nodes: typeof definition.nodes }
  >();
  for (const node of definition.nodes) {
    const id = node.merge?.condition ?? node.id;
    const candidates = calls.filter((call) => matches(id, call.id));
    if (candidates.length > 1)
      throw new Error(`Ambiguous source mapping for ${definition.name}: ${id}`);
    const direct = candidates[0];
    if (!direct)
      throw new Error(`No source mapping for ${definition.name}: ${id}`);
    sourceRanges[node.id] = direct.range;
    // One authored operation may produce several graph nodes (if arms + merge).
    const outer = calls
      .filter((call) => call.start <= direct.start && call.end >= direct.end)
      .sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    const key = `${outer.start}:${outer.end}`;
    const group = grouped.get(key) ?? { call: outer, nodes: [] };
    group.nodes.push(node);
    grouped.set(key, group);
  }
  const steps: Omit<TutorialStep, "explanation" | "comment">[] = [];
  // Definitions are already ordered by construction. Grouping preserves that
  // order even when a helper's source is above the main definition callback.
  for (const { call, nodes } of grouped.values()) {
    const primary = nodes.find((node) => node.id === call.id) ?? nodes[0];
    steps.push({
      id: primary.id,
      title: primary.title ?? primary.id,
      api: `flow.${call.method}()`,
      nodeIds: nodes.map((node) => node.id),
      ranges: [call.range],
    });
  }
  return { sourceRanges, steps };
}
