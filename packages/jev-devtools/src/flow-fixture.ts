import type { FlowDefinition, FlowRun } from "./flow-protocol.js";
import type { Trace } from "./protocol.js";

/** Jev response bodies keyed by flow step ID, replayed by replayClient from jev-devtools/flow. Map and loop items use `${parentId}/${index}/${innerId}`. */
export type FlowFixture = {
  version: 1;
  flow: string;
  steps: Record<string, unknown>;
};
export type BuiltFlowFixture = {
  fixture: FlowFixture;
  /** Completed jev steps whose capture was evicted, unlinked, or has no result. */
  missing: string[];
  /** Capture warnings from the traces used; redaction or truncation may show in the answers. */
  warnings: string[];
};

/** Builds a replay fixture from the captured answers of a run's completed jev steps, including map and loop items. */
export function flowFixture(
  definition: FlowDefinition,
  run: FlowRun,
  traces: ReadonlyMap<string, Trace>,
): BuiltFlowFixture {
  const steps: Record<string, unknown> = {},
    missing: string[] = [],
    warnings = new Set<string>();
  // Item runs reuse bare inner ids; key them by the composed link id.
  const collect = (
    program: FlowDefinition,
    programRun: FlowRun,
    prefix: string,
  ) => {
    for (const node of program.nodes) {
      const step = programRun.steps[node.id];
      if (node.itemDefinition)
        for (const item of step?.collection?.items ?? [])
          if (item.run)
            collect(
              node.itemDefinition,
              item.run,
              `${prefix}${node.id}/${item.index}/`,
            );
      if (node.kind !== "jev" || step?.status !== "completed") continue;
      const trace = step.traceId ? traces.get(step.traceId) : undefined;
      if (!trace?.result) {
        missing.push(prefix + node.id);
        continue;
      }
      steps[prefix + node.id] = structuredClone(trace.result);
      for (const warning of trace.captureWarnings) warnings.add(warning);
    }
  };
  collect(definition, run, "");
  return {
    fixture: { version: 1, flow: definition.name, steps },
    missing,
    warnings: [...warnings],
  };
}

/** Whether a run, or any of its map and loop items, has a completed jev step. */
export function hasCompletedJev(
  definition: FlowDefinition,
  run: FlowRun,
): boolean {
  return definition.nodes.some((node) => {
    const step = run.steps[node.id];
    if (node.kind === "jev") return step?.status === "completed";
    return (
      !!node.itemDefinition &&
      (step?.collection?.items ?? []).some(
        (item) => !!item.run && hasCompletedJev(node.itemDefinition!, item.run),
      )
    );
  });
}
