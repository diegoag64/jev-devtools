import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { JevDevtools } from "jev-devtools";
function App() {
  const [status, setStatus] = useState("Ready");
  const [scenario, setScenario] = useState("flow-approve");
  const run = async () => {
    setStatus("Running");
    const r = await fetch("/run?scenario=" + scenario, { method: "POST" });
    const body = await r.json();
    setStatus(body.outcome ?? body.error ?? "Done");
  };
  return (
    <>
      <h1>Flow sandbox · samples only</h1>
      <select
        aria-label="Scenario"
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
      >
        {[
          "flow-approve",
          "flow-manual",
          "flow-other",
          "flow-parallel",
          "flow-large-choice",
          "flow-content",
          "flow-error",
          "flow-cancel",
          "scale-10",
          "scale-50",
          "scale-150",
        ].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <button onClick={run}>Run sample flow</button>
      <button onClick={() => fetch("/cancel", { method: "POST" })}>
        Cancel sample flow
      </button>
      <p role="status" id="status">
        {status}
      </p>
      <JevDevtools enabled defaultOpen={false} />
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
