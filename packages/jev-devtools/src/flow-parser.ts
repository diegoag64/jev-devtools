import type {
  FlowDefinition,
  FlowNode,
  FlowRun,
  FlowStep,
} from "./flow-protocol.js";
import {
  array,
  boolean,
  finite,
  id,
  ids,
  integer,
  json,
  literal,
  nonnegative,
  optional,
  parse,
  record,
  shape,
  status,
  strings,
  text,
  type Check,
} from "./transport-validation.js";

const stepStatus = literal(
  "waiting",
  "running",
  "completed",
  "untaken",
  "blocked",
  "error",
  "cancelled",
);
const count: Check<number> = (value): value is number =>
  integer(value) && value <= 64;
const concurrency: Check<number> = (value): value is number =>
  integer(value) && value >= 1 && value <= 16;
const iterations: Check<number> = (value): value is number =>
  count(value) && value >= 1;

// Supported nesting is a loop containing a map containing a plain program.
// The shared definition budget includes every nested template, as the builder does.
function definitionCheck(): Check<FlowDefinition> {
  let remaining = 256;
  const definition = (depth: number): Check<FlowDefinition> =>
    shape<FlowDefinition>({
      version: literal(1),
      id,
      name: text,
      nodes: (value): value is FlowNode[] => {
        if (!array(node(depth), 256)(value)) return false;
        const nodes = new Map(value.map((node) => [node.id, node]));
        if (nodes.size !== value.length) return false;
        // Parallel joins are emitted before their lane dependencies. Validate
        // the graph, not the producer's array order, without allowing cycles.
        const active = new Set<string>(),
          complete = new Set<string>();
        const visit = (id: string): boolean => {
          if (active.has(id)) return false;
          if (complete.has(id)) return true;
          const node = nodes.get(id);
          if (!node) return false;
          active.add(id);
          if (!node.dependencies.every(visit)) return false;
          active.delete(id);
          complete.add(id);
          return true;
        };
        return value.every(
          (node) =>
            visit(node.id) &&
            (!node.merge ||
              [node.merge.condition, node.merge.then, node.merge.else].every(
                (key) => nodes.has(key),
              )),
        );
      },
    });
  const node =
    (depth: number): Check<FlowNode> =>
    (value): value is FlowNode => {
      if (--remaining < 0 || depth > 2) return false;
      return (
        shape<FlowNode>({
          id,
          kind: literal(
            "jev",
            "task",
            "map",
            "loop",
            "if",
            "merge",
            "branch",
            "parallel",
            "output",
          ),
          // Empty parallel lanes can repeat a predecessor without adding nodes.
          dependencies: array(id),
          path: array(text, 256),
          title: optional(text),
          description: optional(text),
          condition: optional(text),
          merge: optional(shape({ condition: id, then: id, else: id })),
          conditionRule: optional(json),
          conditionCaptureWarnings: optional(strings),
          conditionCaptureFidelity: optional(
            literal("exact", "modified", "unknown"),
          ),
          lanes: optional(array(text)),
          itemDefinition: optional(definition(depth + 1)),
        })(value) &&
        (!value.itemDefinition ||
          ((value.kind === "map" || value.kind === "loop") &&
            value.itemDefinition.nodes.every(
              (child) =>
                child.kind !== "loop" &&
                (value.kind !== "map" || child.kind !== "map"),
            )))
      );
    };
  return definition(0);
}

function runCheck(definition: FlowDefinition): Check<FlowRun> {
  let remaining = 1024;
  const runIds = new Set<string>(),
    executionIds = new Set<string>();
  const run =
    (owner: FlowDefinition): Check<FlowRun> =>
    (value): value is FlowRun => {
      const nodes = new Map(owner.nodes.map((node) => [node.id, node]));
      const valid = shape<FlowRun>({
        version: literal(1),
        id,
        definitionId: literal(owner.id),
        name: text,
        startedAt: finite,
        durationMs: optional(nonnegative),
        status,
        outcome: optional(text),
        value: optional(json),
        captureWarnings: optional(strings),
        captureFidelity: optional(literal("exact", "modified", "unknown")),
        error: optional(text),
        steps: (value): value is Record<string, FlowStep> => {
          if (!record(value) || Object.keys(value).length !== nodes.size)
            return false;
          return Object.entries(value).every(([key, item]) => {
            const node = nodes.get(key);
            if (!node || --remaining < 0) return false;
            const childDefinition = node.itemDefinition;
            const step = shape<FlowStep>({
              id: literal(key),
              executionId: id,
              status: stepStatus,
              startedAt: optional(finite),
              durationMs: optional(nonnegative),
              decision: optional(boolean),
              traceId: optional(id),
              error: optional(text),
              data: optional(json),
              captureWarnings: optional(strings),
              captureFidelity: optional(
                literal("exact", "modified", "unknown"),
              ),
              loop: optional(
                shape({
                  maxIterations: iterations,
                  stopReason: optional(literal("condition", "limit")),
                }),
              ),
              collection: optional(
                shape({
                  total: count,
                  concurrency,
                  items: array(
                    shape({
                      index: count,
                      status: stepStatus,
                      run: optional(
                        (child): child is FlowRun =>
                          !!childDefinition && run(childDefinition)(child),
                      ),
                    }),
                    64,
                  ),
                }),
              ),
            });
            if (!step(item) || executionIds.has(item.executionId)) return false;
            executionIds.add(item.executionId);
            if (item.loop && node.kind !== "loop") return false;
            const collection = item.collection;
            if (!collection) return true;
            if (
              !childDefinition ||
              (node.kind !== "loop" && node.kind !== "map")
            )
              return false;
            if (node.kind === "loop" && collection.concurrency !== 1)
              return false;
            if (collection.total !== collection.items.length) return false;
            if (item.loop && collection.total > item.loop.maxIterations)
              return false;
            return collection.items.every(
              (child, index) => child.index === index,
            );
          });
        },
      })(value);
      if (!valid || runIds.has(value.id)) return false;
      runIds.add(value.id);
      return true;
    };
  return run(definition);
}

/** Validate an entire event in staging maps before publishing either cache. */
export function parseFlowUpdate(
  input: unknown,
  currentRuns: ReadonlyMap<string, FlowRun>,
  currentDefinitions: ReadonlyMap<string, FlowDefinition>,
) {
  // Runs are parsed only after resolving their definitions in the staged cache.
  const data = parse(
    shape({
      version: literal(1),
      order: ids,
      definitions: array(
        (value): value is FlowDefinition => definitionCheck()(value),
        200,
      ),
      upserts: array(record, 200),
    }),
    input,
    "flow update",
  );
  const definitions = new Map(currentDefinitions);
  const definitionIds = new Set<string>();
  for (const definition of data.definitions) {
    if (definitionIds.has(definition.id))
      throw new Error("Duplicate flow definition");
    definitionIds.add(definition.id);
    if (!definitions.has(definition.id))
      definitions.set(definition.id, definition);
  }
  const runs = new Map(currentRuns);
  const retained = new Set(data.order),
    upsertIds = new Set<string>();
  for (const raw of data.upserts) {
    const definition =
      typeof raw.definitionId === "string"
        ? definitions.get(raw.definitionId)
        : undefined;
    if (!definition) throw new Error("Unknown flow definition");
    const run = parse(runCheck(definition), raw, "flow run");
    if (upsertIds.has(run.id) || !retained.has(run.id))
      throw new Error("Invalid flow upsert ID");
    upsertIds.add(run.id);
    runs.set(run.id, run);
  }
  const ordered = data.order.map((id) => {
    const run = runs.get(id);
    if (!run) throw new Error("Missing flow run");
    return run;
  });
  const used = new Set(ordered.map((run) => run.definitionId));
  if (data.definitions.some((definition) => !used.has(definition.id)))
    throw new Error("Unused flow definition");
  return {
    runs: new Map(ordered.map((run) => [run.id, run])),
    definitions: new Map([...definitions].filter(([id]) => used.has(id))),
  };
}
