import type { Trace } from "./protocol.js";
import { TraceStore } from "./trace-store.js";

export function connectTraceStream(
  url: string,
  onTraces: (traces: Trace[]) => void,
  onConnection: (status: string) => void,
) {
  let alive = true,
    events: EventSource | undefined,
    retry: ReturnType<typeof setTimeout> | undefined,
    frame: number | undefined,
    fallback: ReturnType<typeof setTimeout> | undefined,
    pending: Trace[] | undefined;
  const cancelPublish = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    clearTimeout(fallback);
    frame = undefined;
    fallback = undefined;
    pending = undefined;
  };
  const publish = () => {
    const next = pending;
    cancelPublish();
    if (alive && next) onTraces(next);
  };
  const schedule = (next: Trace[]) => {
    pending = next;
    if (frame !== undefined) return;
    // Merge every protocol event, but render only the newest state per frame.
    // Background tabs may suspend rAF; keep delivery bounded there as well.
    frame = requestAnimationFrame(publish);
    fallback = setTimeout(publish, 100);
  };
  const connect = () => {
    if (!alive) return;
    // Native reconnects receive a full snapshot too. After an invalid delta,
    // discard the cursor and reconnect rather than applying partial history.
    const store = new TraceStore();
    const source = new EventSource(url + "/events?protocol=2");
    events = source;
    const receive = (kind: "snapshot" | "delta", event: Event) => {
      if (!alive || events !== source) return;
      try {
        const next = store.apply(
          kind,
          JSON.parse((event as MessageEvent).data),
        );
        schedule(next);
        onConnection("connected");
      } catch {
        cancelPublish();
        source.close();
        events = undefined;
        onConnection("resynchronizing");
        retry = setTimeout(connect, 1000);
      }
    };
    source.addEventListener("snapshot", (event) => receive("snapshot", event));
    source.addEventListener("delta", (event) => receive("delta", event));
    source.onerror = () => {
      if (alive && events === source) onConnection("reconnecting");
    };
  };
  connect();
  return () => {
    alive = false;
    clearTimeout(retry);
    cancelPublish();
    events?.close();
  };
}
