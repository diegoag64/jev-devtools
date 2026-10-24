import type { FlowDefinition, FlowRun, FlowUpdate } from "./flow-protocol.js";
export type FlowHistory = { runs: FlowRun[]; definitions: FlowDefinition[] };
export const emptyFlows: FlowHistory = { runs: [], definitions: [] };
/** Separate opt-in stream; no extra rendering of request rows on flow-only updates. */
export function connectFlowStream(
  url: string,
  onUpdate: (history: FlowHistory) => void,
) {
  let alive = true,
    source: EventSource | undefined,
    frame: number | undefined,
    fallback: ReturnType<typeof setTimeout> | undefined,
    retry: ReturnType<typeof setTimeout> | undefined;
  let runs = new Map<string, FlowRun>(),
    definitions = new Map<string, FlowDefinition>(),
    pending: FlowHistory | undefined;
  const cancel = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    clearTimeout(fallback);
    frame = undefined;
    pending = undefined;
  };
  const publish = () => {
    const next = pending;
    cancel();
    if (alive && next) onUpdate(next);
  };
  const connect = () => {
    if (!alive) return;
    runs = new Map();
    definitions = new Map();
    const current = new EventSource(url + "/flows/events");
    source = current;
    current.addEventListener("open", () => {
      if (!alive || source !== current) return;
      // Native reconnect reuses this EventSource. The server starts a fresh
      // snapshot; neither cached definitions nor pending publications survive.
      cancel();
      runs = new Map();
      definitions = new Map();
    });
    current.addEventListener("flows", (event) => {
      if (!alive || source !== current) return;
      try {
        const data = JSON.parse((event as MessageEvent).data) as FlowUpdate;
        if (
          data.version !== 1 ||
          !Array.isArray(data.order) ||
          data.order.length > 200 ||
          new Set(data.order).size !== data.order.length ||
          !Array.isArray(data.upserts) ||
          !Array.isArray(data.definitions)
        )
          throw new Error("Invalid flow stream");
        for (const definition of data.definitions) {
          if (
            definition.version !== 1 ||
            !Array.isArray(definition.nodes) ||
            definition.nodes.length > 256
          )
            throw new Error("Invalid flow definition");
          if (!definitions.has(definition.id))
            definitions.set(definition.id, definition);
        }
        for (const run of data.upserts) {
          if (run.version !== 1 || !definitions.has(run.definitionId))
            throw new Error("Invalid flow run");
          runs.set(run.id, run);
        }
        const ordered = data.order.map((id) => {
          const run = runs.get(id);
          if (!run) throw new Error("Missing run");
          return run;
        });
        runs = new Map(ordered.map((r) => [r.id, r]));
        const used = new Set(ordered.map((r) => r.definitionId));
        definitions = new Map([...definitions].filter(([id]) => used.has(id)));
        pending = { runs: ordered, definitions: [...definitions.values()] };
        if (frame === undefined) {
          frame = requestAnimationFrame(publish);
          fallback = setTimeout(publish, 100);
        }
      } catch {
        cancel();
        current.close();
        retry = setTimeout(connect, 1000);
      }
    });
  };
  connect();
  return () => {
    alive = false;
    cancel();
    clearTimeout(retry);
    source?.close();
  };
}
