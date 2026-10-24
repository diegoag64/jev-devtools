import { useState } from "react";
import type {
  RagResult,
  Routed,
} from "../../../cookbooks/rag-passages/flow.js";
export function RagCookbookResult({ result }: { result: { value?: unknown } }) {
  const data = result.value as RagResult;
  const [filter, setFilter] = useState("all");
  const names: Record<Routed["route"], string> = {
    include: "Evidence",
    conflicting_evidence: "Conflicts",
    exclude: "Excluded",
  };
  return (
    <section className="cookbook-result" aria-label="RAG classification result">
      <span className="cookbook-eyebrow">
        Synthetic scores · deterministic sample answer
      </span>
      <h2>From {data.rows.length} candidates to usable evidence</h2>
      <div className="cookbook-metrics">
        {Object.entries(names).map(([key, name]) => (
          <div key={key}>
            <span>{name}</span>
            <strong>
              {data.rows.filter((row) => row.route === key).length}
            </strong>
          </div>
        ))}
      </div>
      <p>
        Open Jev DevTools → Flows, select “Classify retrieved passages”, then
        choose an item in the card and “View Flow” to reveal its four answers
        and routing function. Item numbers below match the collection.
      </p>
      <div className="rag-filters" aria-label="Filter passages">
        {Object.entries({ all: "All passages", ...names }).map(
          ([key, name]) => (
            <button
              key={key}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {name}
            </button>
          ),
        )}
      </div>
      <div className="rag-passages">
        {data.rows.map((row, index) =>
          filter === "all" || filter === row.route ? (
            <details
              key={row.passage.id}
              className="rag-passage"
              data-route={row.route}
            >
              <summary>
                <span className="cookbook-badge">{names[row.route]}</span>{" "}
                <strong>
                  Item {index + 1} · {row.passage.title}
                </strong>
              </summary>
              <p>{row.reason}</p>
              <dl>
                {Object.entries(row.scores).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>{Math.round(value * 100)}%</dd>
                  </div>
                ))}
              </dl>
              <small>
                {row.passage.id} · {row.passage.source_type}
              </small>
              <pre className="cookbook-excerpt">{row.passage.text}</pre>
            </details>
          ) : null,
        )}
      </div>
      {!data.rows.length && (
        <p>
          No candidates were retrieved, so the map completed without making a
          Jev request.
        </p>
      )}
      <details className="cookbook-agent-hint" open>
        <summary>Sample answer · cited excerpts, not LLM generation</summary>
        <pre>{data.answer}</pre>
      </details>
      <details className="cookbook-agent-hint">
        <summary>
          Generator prompt · accepted and conflicting evidence only
        </summary>
        <pre>{data.prompt}</pre>
      </details>
    </section>
  );
}
