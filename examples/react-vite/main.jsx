import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { JevDevtools } from "jev-devtools";
import "./host.css";
function App() {
  const [enabled, setEnabled] = useState(true),
    [status, setStatus] = useState("Ready");
  async function run() {
    setStatus("Running…");
    const response = await fetch("/__demo/run", { method: "POST" });
    setStatus(response.ok ? "Captured sample response" : "Request failed");
  }
  return (
    <>
      <main className="consumer-app">
        <h1>Independent React app</h1>
        <p>
          This app imports the packed Jev package. Its own styles stay intact.
        </p>
        <button onClick={run}>Classify a sample ticket</button>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />{" "}
          Enable inspector
        </label>
        <p role="status">{status}</p>
      </main>
      <JevDevtools
        endpoint="/inspect"
        enabled={import.meta.env.DEV && enabled}
        defaultOpen={false}
      />
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
