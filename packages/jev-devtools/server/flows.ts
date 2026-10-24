import type {
  FlowDefinition,
  FlowRun,
  FlowUpdate,
} from "../src/flow-protocol.js";
import { capture, type CaptureOptions } from "./recorder.js";
import type { Json } from "../src/protocol.js";
/** Independent bounded run store. Definitions are retained only while referenced. */
export class FlowRecorder {
  private runs = new Map<string, FlowRun>();
  private definitions = new Map<string, FlowDefinition>();
  private sessions = new Map<string, string>();
  private revisions = new Map<string, number>();
  private revision = 0;
  private listeners = new Set<(sessions: Set<string>) => void>();
  private itemCaptures = new WeakMap<FlowRun, FlowRun>();
  private taskCaptures = new WeakMap<
    object,
    { data: Json; warnings: string[] }
  >();
  constructor(private options: CaptureOptions) {}
  subscribe(fn: (sessions: Set<string>) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private notify(sessions: Set<string>) {
    for (const fn of this.listeners) {
      try {
        fn(sessions);
      } catch {}
    }
  }
  start(definition: FlowDefinition, run: FlowRun, session: string) {
    if (!this.definitions.has(definition.id)) {
      const stored = structuredClone(definition);
      const redactRules = (
        definition: FlowDefinition,
        prefix: string[] = [],
      ) => {
        for (const node of definition.nodes) {
          if (node.itemDefinition)
            redactRules(node.itemDefinition, [...prefix, node.id, "items"]);
          if (node.conditionRule === undefined) continue;
          try {
            node.conditionRule = capture(
              node.conditionRule,
              new Set(),
              this.options.redact
                ? (path, value) =>
                    this.options.redact!(
                      ["conditions", ...prefix, node.id, ...path],
                      value,
                    )
                : undefined,
            );
          } catch {
            node.conditionRule = "[rule capture unavailable]";
          }
        }
      };
      redactRules(stored);
      this.definitions.set(definition.id, stored);
    }
    this.runs.set(run.id, run);
    this.sessions.set(run.id, session);
    this.revisions.set(run.id, ++this.revision);
    const sessions = new Set([session]);
    const limit = Math.max(1, Math.min(200, this.options.limit ?? 50));
    while (this.runs.size > limit) {
      const id = this.runs.keys().next().value!;
      sessions.add(this.sessions.get(id)!);
      this.remove(id);
    }
    this.prune();
    this.notify(sessions);
  }
  private captureRun(run: FlowRun, prefix: string[] = []): FlowRun {
    // Child updates are immutable snapshots; unchanged items need no recapture.
    const previous = prefix.length ? this.itemCaptures.get(run) : undefined;
    if (previous) return previous;
    const stored = {
      ...run,
      steps: Object.fromEntries(
        Object.entries(run.steps).map(([id, raw]) => {
          const step = { ...raw };
          if (raw.collection)
            step.collection = {
              ...raw.collection,
              items: raw.collection.items.map((item) => ({
                ...item,
                ...(item.run
                  ? {
                      run: this.captureRun(item.run, [
                        ...prefix,
                        "steps",
                        id,
                        "items",
                        String(item.index),
                      ]),
                    }
                  : {}),
              })),
            };
          if (step.data === undefined) return [id, { ...step }];
          const key = step.data;
          let captured =
            key && typeof key === "object"
              ? this.taskCaptures.get(key)
              : undefined;
          if (!captured) {
            const warnings = new Set<string>();
            let data: Json;
            try {
              data =
                capture(
                  step.data,
                  warnings,
                  this.options.redact
                    ? (path, value) =>
                        this.options.redact!(
                          [...prefix, "steps", id, "data", ...path],
                          value,
                        )
                    : undefined,
                ) ?? null;
            } catch {
              data = "[capture unavailable]";
              warnings.add("Task capture unavailable.");
            }
            captured = { data, warnings: [...warnings] };
            if (key && typeof key === "object")
              this.taskCaptures.set(key, captured);
          }
          return [
            id,
            {
              ...step,
              data: captured.data,
              captureWarnings: captured.warnings,
            },
          ];
        }),
      ),
    };
    if ("value" in stored) {
      try {
        stored.value = capture(
          stored.value,
          new Set(),
          this.options.redact
            ? (path, value) => this.options.redact!([...prefix, ...path], value)
            : undefined,
        );
      } catch {
        stored.value = "[capture unavailable]";
      }
    }
    if (prefix.length) this.itemCaptures.set(run, stored);
    return stored;
  }
  update(run: FlowRun) {
    if (!this.runs.has(run.id)) return; // Clear/eviction cannot resurrect pending runs.
    this.runs.set(run.id, this.captureRun(run));
    this.revisions.set(run.id, ++this.revision);
    this.notify(new Set([this.sessions.get(run.id)!]));
  }
  private remove(id: string) {
    this.runs.delete(id);
    this.sessions.delete(id);
    this.revisions.delete(id);
  }
  private prune() {
    const used = new Set([...this.runs.values()].map((r) => r.definitionId));
    for (const id of this.definitions.keys())
      if (!used.has(id)) {
        this.definitions.delete(id);
      }
  }
  clear(session: string) {
    for (const id of this.runs.keys())
      if (this.sessions.get(id) === session) this.remove(id);
    this.prune();
    this.revision++;
    this.notify(new Set([session]));
  }
  changes(
    session: string,
    cursor?: number,
    knownDefinitions: ReadonlySet<string> = new Set(),
  ): {
    revision: number;
    retainedDefinitionIds: Set<string>;
    data: FlowUpdate;
  } {
    const current = [...this.runs.values()]
      .filter((r) => this.sessions.get(r.id) === session)
      .reverse();
    const used = new Set(current.map((r) => r.definitionId));
    return {
      revision: this.revision,
      retainedDefinitionIds: used,
      data: structuredClone({
        version: 1,
        definitions: [...used]
          // Creation time says nothing about what this particular reader has.
          .filter((id) => cursor === undefined || !knownDefinitions.has(id))
          .map((id) => this.definitions.get(id)!),
        upserts: current.filter(
          (r) => cursor === undefined || this.revisions.get(r.id)! > cursor,
        ),
        order: current.map((r) => r.id),
      }),
    };
  }
}
