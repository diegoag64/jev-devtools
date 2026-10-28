import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  JevFlowViewer,
  useJevInspection,
  type FlowDefinition,
  type FlowRun,
} from "jev-devtools/viewer";
const definition: FlowDefinition = {
  version: 1,
  id: "viewer-fixture",
  name: "Viewer fixture",
  nodes: [
    {
      id: "prepare",
      kind: "task",
      path: [],
      dependencies: [],
      title: "Prepare contact",
    },
  ],
};
const run: FlowRun = {
  version: 1,
  id: "fixture-run",
  definitionId: definition.id,
  name: definition.name,
  startedAt: 1,
  status: "success",
  steps: {
    prepare: {
      id: "prepare",
      executionId: "execution",
      status: "completed",
      data: {
        input: { email: "sample@example.com" },
        output: { email: "sample@example.com" },
      },
    },
  },
};
function Harness() {
  const [enabled, setEnabled] = useState(false);
  const [endpoint, setEndpoint] = useState("/api/jev-devtools");
  const [captured, setCaptured] = useState(false);
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button onClick={() => setEnabled((value) => !value)}>
        Toggle connection
      </button>
      <button
        onClick={() => setEndpoint("https://example.invalid/api/jev-devtools")}
      >
        Invalid endpoint
      </button>
      <button onClick={() => setCaptured((value) => !value)}>
        Toggle captured run
      </button>
      <button onClick={() => setVisible((value) => !value)}>
        Toggle visible nodes
      </button>
      <button onClick={() => setMounted(false)}>Unmount subscription</button>
      {mounted && <Subscription endpoint={endpoint} enabled={enabled} />}
      <div style={{ height: 600 }}>
        <JevFlowViewer
          definition={definition}
          run={captured ? run : undefined}
          visibleNodeIds={visible ? undefined : []}
        />
      </div>
      <output aria-label="Original input">
        {JSON.stringify(run.steps.prepare.data)}
      </output>
    </>
  );
}
function Subscription({
  endpoint,
  enabled,
}: {
  endpoint: string;
  enabled: boolean;
}) {
  const snapshot = useJevInspection({ endpoint, enabled });
  return <output aria-label="Connection">{snapshot.connection}</output>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
