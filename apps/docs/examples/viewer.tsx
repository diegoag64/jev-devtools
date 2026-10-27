import { JevFlowViewer, useJevInspection } from "jev-devtools/viewer";

export function FlowWorkspace() {
  const { flows, traces, connection } = useJevInspection({
    enabled: import.meta.env.DEV,
  });
  const run = flows.runs[flows.runs.length - 1];
  const definition = flows.definitions.find(
    (item) => item.id === run?.definitionId,
  );
  return (
    <section>
      <p>{connection}</p>
      {definition && (
        <div style={{ height: 600 }}>
          <JevFlowViewer definition={definition} run={run} traces={traces} />
        </div>
      )}
    </section>
  );
}
