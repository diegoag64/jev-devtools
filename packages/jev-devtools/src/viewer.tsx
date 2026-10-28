"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FlowOverview } from "./FlowOverview.js";
import { inspectorStyles } from "./inspector-styles.js";
import { createDisplayRedactor } from "./display-redaction.js";
import { connectFlowStream, emptyFlows } from "./flow-stream.js";
import { connectTraceStream } from "./trace-stream.js";
import type { FlowHistory } from "./flow-stream.js";
import type { FlowDefinition, FlowRun } from "./flow-protocol.js";
import type { Trace } from "./protocol.js";

export type { FlowDefinition, FlowRun } from "./flow-protocol.js";
export type InspectionSnapshot = {
  traces: Trace[];
  flows: FlowHistory;
  connection: string;
};

/** Subscribe to the same validated capture streams used by the drawer. */
export function useJevInspection({
  endpoint = "/api/jev-devtools",
  enabled = false,
}: { endpoint?: string; enabled?: boolean } = {}): InspectionSnapshot {
  const [snapshot, setSnapshot] = useState<InspectionSnapshot>({
    traces: [],
    flows: emptyFlows,
    connection: "disabled",
  });
  const [redactor] = useState(createDisplayRedactor);
  useEffect(() => {
    if (!enabled) {
      setSnapshot({ traces: [], flows: emptyFlows, connection: "disabled" });
      return;
    }
    let alive = true,
      stopTraces = () => {},
      stopFlows = () => {};
    const abort = new AbortController();
    const update = (patch: Partial<InspectionSnapshot>) => {
      if (alive) setSnapshot((previous) => ({ ...previous, ...patch }));
    };
    setSnapshot({ traces: [], flows: emptyFlows, connection: "connecting" });
    void (async () => {
      try {
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
        const base = url.href.replace(/\/$/, "");
        const response = await fetch(base, {
          signal: abort.signal,
          credentials: "same-origin",
        });
        if (!response.ok)
          throw new Error(`Inspector unavailable (${response.status})`);
        const config = await response.json();
        if (config.version !== 1 || !config.enabled)
          throw new Error("Unsupported inspector endpoint");
        if (!alive) return;
        if (config.flows)
          stopFlows = connectFlowStream(base, (flows) => update({ flows }));
        stopTraces = connectTraceStream(
          base,
          (traces) => update({ traces }),
          (connection) => update({ connection }),
        );
      } catch (error) {
        update({
          connection:
            error instanceof Error ? error.message : "Inspector unavailable",
        });
      }
    })();
    return () => {
      alive = false;
      abort.abort();
      stopTraces();
      stopFlows();
    };
  }, [endpoint, enabled]);
  return useMemo(
    () => ({
      connection: snapshot.connection,
      traces: snapshot.traces.map(redactor.trace),
      flows: {
        runs: snapshot.flows.runs.map(redactor.run),
        definitions: snapshot.flows.definitions.map(redactor.definition),
      },
    }),
    [snapshot, redactor],
  );
}

export type JevFlowViewerProps = {
  definition: FlowDefinition;
  /** Omit for an authored definition without execution state. */
  run?: FlowRun;
  traces?: Trace[];
  selectedNodeId?: string;
  onNodeSelect?: (id: string) => void;
  /** Presentation only; does not change the flow or its execution. */
  visibleNodeIds?: readonly string[];
  highlightedNodeIds?: readonly string[];
  nodeAccents?: Readonly<Record<string, string>>;
};

/** The drawer's diagram and request inspector, embedded in an ordinary layout. */
export function JevFlowViewer({
  definition,
  run,
  traces = [],
  ...presentation
}: JevFlowViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot>();
  const [redactor] = useState(createDisplayRedactor);
  useEffect(() => {
    if (!host.current) return;
    const shadow =
      host.current.shadowRoot ?? host.current.attachShadow({ mode: "open" });
    setRoot(shadow);
  }, []);
  const safeDefinition = useMemo(
    () => redactor.definition(definition),
    [definition, redactor],
  );
  const safeRun = useMemo(
    () =>
      run
        ? redactor.run(run)
        : {
            version: 1 as const,
            id: `definition-${definition.id}`,
            definitionId: definition.id,
            name: definition.name,
            startedAt: 0,
            status: "pending" as const,
            steps: {},
          },
    [run, definition.id, definition.name, redactor],
  );
  const safeTraces = useMemo(
    () => traces.map(redactor.trace),
    [traces, redactor],
  );
  return (
    <div
      className="jev-flow-viewer"
      ref={host}
      style={{ height: "100%", minHeight: 0 }}
    >
      {root &&
        createPortal(
          <>
            <style>{inspectorStyles}</style>
            <div className="jev-devtools jev-embedded">
              <div className="jev-inspector jev-embedded-inspector">
                <FlowOverview
                  definition={safeDefinition}
                  run={safeRun}
                  traces={safeTraces}
                  definitionOnly={!run}
                  {...presentation}
                />
              </div>
            </div>
          </>,
          root,
        )}
    </div>
  );
}
