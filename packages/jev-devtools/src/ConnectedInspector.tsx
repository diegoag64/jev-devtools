import { memo, useCallback, useEffect, useRef, useState } from "react";
import { JevPanel } from "./JevDevtools.js";
import { JevDrawer } from "./JevDrawer.js";
import type { Trace } from "./protocol.js";
import { connectTraceStream } from "./trace-stream.js";
import type { JevDevtoolsProps } from "./index.js";
import {
  connectFlowStream,
  emptyFlows,
  type FlowHistory,
} from "./flow-stream.js";
const RetainedPanel = memo(JevPanel);
type Snapshot = {
  traces: Trace[];
  connection: string;
  flows: FlowHistory;
  redactAdditionalSensitiveData?: boolean;
};
function endpointUrl(endpoint: string) {
  const url = new URL(endpoint, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use a same-origin inspector endpoint without a query or fragment.",
    );
  return url.href.replace(/\/$/, "");
}
export default function ConnectedInspector({
  endpoint = "/api/jev-devtools",
  defaultOpen = true,
}: Omit<JevDevtoolsProps, "enabled">) {
  const [open, setOpen] = useState(defaultOpen);
  const [visited, setVisited] = useState(defaultOpen);
  const visible = useRef(defaultOpen);
  const latest = useRef<Snapshot>({
    traces: [],
    connection: "connecting",
    flows: emptyFlows,
  });
  const [snapshot, setSnapshot] = useState(latest.current);
  const toggle = (value: boolean) => {
    visible.current = value;
    setOpen(value);
    if (value) {
      setVisited(true);
      setSnapshot(latest.current);
    }
  };
  useEffect(() => {
    let alive = true,
      disconnect = () => {},
      disconnectFlows = () => {};
    const abort = new AbortController();
    // Keep capture current while closed without scheduling React work. Reopening
    // publishes only the latest snapshot; the retained panel keeps its UI state.
    const update = (patch: Partial<Snapshot>) => {
      const next = { ...latest.current, ...patch };
      if (
        next.traces === latest.current.traces &&
        next.connection === latest.current.connection &&
        next.flows === latest.current.flows &&
        next.redactAdditionalSensitiveData ===
          latest.current.redactAdditionalSensitiveData
      )
        return;
      latest.current = next;
      if (visible.current) setSnapshot(latest.current);
    };
    update({
      traces: [],
      connection: "connecting",
      flows: emptyFlows,
      redactAdditionalSensitiveData: undefined,
    });
    void (async () => {
      try {
        const url = endpointUrl(endpoint);
        const response = await fetch(url, {
          signal: abort.signal,
          credentials: "same-origin",
        });
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "Inspector disabled or endpoint missing"
              : `Inspector unavailable (${response.status})`,
          );
        const config = await response.json();
        if (config.version !== 1 || !config.enabled)
          throw new Error("Unsupported inspector endpoint");
        if (!alive) return;
        if (typeof config.redactAdditionalSensitiveData === "boolean")
          update({
            redactAdditionalSensitiveData: config.redactAdditionalSensitiveData,
          });
        if (config.flows)
          disconnectFlows = connectFlowStream(url, (flows) =>
            update({ flows }),
          );
        disconnect = connectTraceStream(
          url,
          (traces) => update({ traces }),
          (connection) => update({ connection }),
          (redactAdditionalSensitiveData) =>
            update({ redactAdditionalSensitiveData }),
        );
      } catch (error) {
        if (alive)
          update({
            connection:
              error instanceof Error ? error.message : "Inspector unavailable",
          });
      }
    })();
    return () => {
      alive = false;
      abort.abort();
      disconnect();
      disconnectFlows();
    };
  }, [endpoint]);
  const changeRedaction = useCallback(
    async (value: boolean) => {
      const response = await fetch(endpointUrl(endpoint) + "/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redactAdditionalSensitiveData: value }),
      });
      if (!response.ok)
        throw new Error(`Cannot update redaction (${response.status})`);
      // SSE is authoritative across viewers; a late HTTP response must not
      // overwrite a more recent setting received on the ordered stream.
    },
    [endpoint],
  );
  const clear = useCallback(async () => {
    const response = await fetch(endpointUrl(endpoint) + "/clear", {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error(`Cannot clear history (${response.status})`);
  }, [endpoint]);
  return (
    <JevDrawer open={open} onOpenChange={toggle}>
      {visited && (
        <RetainedPanel
          {...snapshot}
          onClear={clear}
          onRedactionChange={changeRedaction}
        />
      )}
    </JevDrawer>
  );
}
