import { parseFlowUpdate } from "./flow-parser.js";
import { connectVisibleStream } from "./visible-stream.js";
import type { FlowDefinition, FlowRun } from "./flow-protocol.js";
export type FlowHistory = { runs: FlowRun[]; definitions: FlowDefinition[] };
export const emptyFlows: FlowHistory = { runs: [], definitions: [] };
/** Separate opt-in stream; no extra rendering of request rows on flow-only updates. */
export function connectFlowStream(
  url: string,
  onUpdate: (history: FlowHistory) => void,
) {
  return connectVisibleStream(() => openFlowStream(url, onUpdate));
}

function openFlowStream(url: string, onUpdate: (history: FlowHistory) => void) {
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
        if (!(event instanceof MessageEvent) || typeof event.data !== "string")
          throw new Error("Invalid flow event");
        const input: unknown = JSON.parse(event.data);
        const next = parseFlowUpdate(input, runs, definitions);
        runs = next.runs;
        definitions = next.definitions;
        pending = {
          runs: [...runs.values()],
          definitions: [...definitions.values()],
        };
        if (frame === undefined) {
          frame = requestAnimationFrame(publish);
          fallback = setTimeout(publish, 100);
        }
      } catch {
        cancel();
        current.close();
        source = undefined;
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
