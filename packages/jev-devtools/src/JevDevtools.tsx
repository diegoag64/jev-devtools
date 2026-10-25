import { emptyFlows, type FlowHistory } from "./flow-stream.js";
import {
  lazy,
  memo,
  startTransition,
  Suspense,
  useMemo,
  useState,
} from "react";
import { TraceDiagram } from "./TraceDiagram.js";
import type { Trace } from "./protocol.js";
import { useStableArray } from "./use-stable-array.js";
import { JsonBlock, findImage } from "./TraceContent.js";
const FlowOverview = lazy(() =>
  import("./FlowOverview.js").then((module) => ({
    default: module.FlowOverview,
  })),
);
let questionsLoaded = false;
const Questions = lazy(() =>
  import("./Questions.js").then((module) => {
    questionsLoaded = true;
    return { default: module.Questions };
  }),
);
const ms = (value?: number) =>
  value === undefined ? "—" : `${Math.round(value)} ms`;
// Delta updates retain unchanged Trace references. Default shallow comparison
// skips their render work while changed traces and selection still update.
const RequestRow = memo(function RequestRow({
  trace,
  selected,
  onSelect,
}: {
  trace: Trace;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className={`request-row ${selected ? "selected" : ""}`}
      onClick={() => onSelect(trace.id)}
    >
      <span className={`status-dot ${trace.status}`} />
      <span>
        <strong>{trace.label}</strong>
        <small>
          {new Date(trace.startedAt).toLocaleTimeString()} · {trace.source} ·{" "}
          {ms(trace.durationMs)}
        </small>
      </span>
      <span className="row-status">{trace.status}</span>
    </button>
  );
});

export const RequestDetail = memo(function RequestDetail({
  trace,
}: {
  trace?: Trace;
}) {
  // Keep tab selection across request switches and clear, as before. Local tab
  // changes no longer rerender the history list.
  const [tab, setTab] = useState("Flow");
  return (
    <section className="request-detail">
      {trace ? (
        <>
          <header className="detail-header">
            <div>
              <span className="eyebrow">
                {trace.source} response · {trace.status}
              </span>
              <h2>{trace.label}</h2>
            </div>
            <div className="metrics">
              <span>
                {ms(trace.durationMs)}
                <small>Total duration</small>
              </span>
              <span>
                {trace.attempts.length}
                <small>Attempts</small>
              </span>
              <span>
                {trace.result?.usage
                  ? `${trace.result.usage.input_tokens} / ${trace.result.usage.output_tokens}`
                  : "—"}
                <small>Tokens in / out</small>
              </span>
            </div>
          </header>
          <div className="detail-meta">
            <code>{trace.result?.model || trace.request.model}</code>
            <code>
              {trace.requestId ||
                (trace.status === "pending"
                  ? "Request ID pending"
                  : "No request ID")}
            </code>
          </div>
          <nav className="detail-tabs" aria-label="Request views">
            {["Flow", "Questions", "Context", "Transport", "Raw"].map(
              (name) => (
                <button
                  key={name}
                  aria-pressed={tab === name}
                  onClick={() => {
                    // Keep the current view while its chunk loads, but don't
                    // defer subsequent opens once the component is available.
                    if (name === "Questions" && !questionsLoaded)
                      startTransition(() => setTab(name));
                    else setTab(name);
                  }}
                >
                  {name}
                </button>
              ),
            )}
          </nav>
          <div
            className={`detail-body ${tab === "Flow" ? "detail-body-flow" : tab === "Questions" ? "detail-body-questions" : ""}`}
          >
            <Suspense
              fallback={
                <p className="muted" role="status">
                  Loading questions…
                </p>
              }
            >
              {trace.error && (
                <div role="alert" className="error-banner">
                  <strong>{trace.error.name}</strong> {trace.error.message}
                </div>
              )}
              {trace.captureWarnings.map((w) => (
                <p className="warning" key={w}>
                  {w}
                </p>
              ))}
              {tab === "Flow" && <TraceDiagram key={trace.id} trace={trace} />}
              {tab === "Questions" && (
                <Questions key={trace.id} trace={trace} />
              )}
              {tab === "Context" && (
                <>
                  <p className="muted">
                    Captured before dispatch without changing SDK data. Known
                    credential fields remain redacted; additional display
                    masking follows the component prop. Captures are size
                    limited.
                  </p>
                  {findImage(trace.request.state) && (
                    <img
                      className="context-image"
                      src={findImage(trace.request.state)}
                      alt="Captured context"
                    />
                  )}
                  <JsonBlock value={trace.request.state} />
                  {trace.request.assets && (
                    <JsonBlock value={trace.request.assets} />
                  )}
                </>
              )}
              {tab === "Transport" && (
                <>
                  <h3>HTTP attempts</h3>
                  <p className="muted">
                    Attempt duration ends at response headers. Total duration
                    includes SDK processing and retry waits.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Attempt</th>
                        <th>Status</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.attempts.map((a) => (
                        <tr key={a.number}>
                          <td>{a.number}</td>
                          <td>{a.error || a.status || "Pending"}</td>
                          <td>{ms(a.durationMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!trace.attempts.length && <p>No HTTP attempt recorded.</p>}
                </>
              )}
              {tab === "Raw" && <JsonBlock value={trace} />}
            </Suspense>
          </div>
        </>
      ) : (
        <div className="empty-detail">
          <span className="empty-symbol">↳</span>
          <h2>Follow a Jev request</h2>
          <p>
            Context, parallel questions, typed answers.
            <br />
            Run a sample above to see the complete flow.
          </p>
        </div>
      )}
    </section>
  );
});

export function JevPanel({
  traces,
  flows = emptyFlows,
  connection,
  onClear,
}: {
  traces: Trace[];
  flows?: FlowHistory;
  connection: string;
  onClear: () => Promise<unknown>;
}) {
  const [view, setView] = useState("requests");
  const [selectedRun, setSelectedRun] = useState<string>();
  const run = flows.runs.find((r) => r.id === selectedRun) ?? flows.runs[0];
  const definition = flows.definitions.find((d) => d.id === run?.definitionId);
  // Keep identity while this definition's runs are unchanged, so updates to
  // other flows don't rerender the pinned overview.
  const runsOfDefinition = useStableArray(
    useMemo(
      () => flows.runs.filter((r) => r.definitionId === run?.definitionId),
      [flows.runs, run?.definitionId],
    ),
  );
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return traces.filter(
      (t) =>
        (status === "all" || status === t.status) &&
        `${t.label} ${t.request.model} ${t.id}`.toLowerCase().includes(query),
    );
  }, [traces, search, status]);
  const trace = filtered.find((t) => t.id === selected) || filtered[0];
  return (
    <div className="jev-inspector">
      <aside className="request-list">
        <header>
          <h2>
            {view === "requests" ? "Jev requests" : "Jev flows"}{" "}
            <span>
              {view === "requests" ? traces.length : flows.runs.length}
            </span>
          </h2>
          <button
            onClick={() => void onClear().catch((e) => setError(e.message))}
            disabled={!traces.length && !flows.runs.length}
          >
            Clear
          </button>
        </header>
        {(flows.runs.length > 0 || view === "flows") && (
          <nav className="detail-tabs" aria-label="History type">
            <button
              aria-pressed={view === "requests"}
              onClick={() => setView("requests")}
            >
              Requests
            </button>
            <button
              aria-pressed={view === "flows"}
              onClick={() => {
                setView("flows");
                if (run) setSelectedRun(run.id);
              }}
            >
              Flows
            </button>
          </nav>
        )}
        {view === "requests" && (
          <div className="list-filters">
            <input
              aria-label="Search requests"
              placeholder="Search requests…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter request status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {["all", "pending", "success", "error", "cancelled"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <div className="request-items">
          {view === "flows"
            ? flows.runs.map((r) => (
                <button
                  key={r.id}
                  className={`request-row ${run?.id === r.id ? "selected" : ""}`}
                  onClick={() => setSelectedRun(r.id)}
                >
                  <span className={`status-dot ${r.status}`} />
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {new Date(r.startedAt).toLocaleTimeString()} ·{" "}
                      {r.outcome ?? r.status}
                    </small>
                  </span>
                  <span className="row-status">{r.status}</span>
                </button>
              ))
            : filtered.map((t) => (
                <RequestRow
                  key={t.id}
                  trace={t}
                  selected={trace?.id === t.id}
                  onSelect={setSelected}
                />
              ))}
          {view === "requests" && !filtered.length && (
            <p className="empty">
              {traces.length
                ? "No matching requests."
                : "Run a scenario to capture your first request."}
            </p>
          )}
        </div>
        {(connection !== "connected" || error) && (
          <footer>
            {connection !== "connected" && (
              <span role="status">{connection}</span>
            )}
            {error && <p role="alert">{error}</p>}
          </footer>
        )}
      </aside>
      {view === "flows" && run && definition ? (
        <Suspense fallback={<p role="status">Loading flow…</p>}>
          <FlowOverview
            key={run.id}
            run={run}
            runs={runsOfDefinition}
            definition={definition}
            traces={traces}
          />
        </Suspense>
      ) : (
        <RequestDetail trace={trace} />
      )}
    </div>
  );
}
