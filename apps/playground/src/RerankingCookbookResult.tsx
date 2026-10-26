import { useState } from "react";
import type { RerankingResult } from "../../../cookbooks/reranking/flow.js";
export function RerankingCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as RerankingResult;
  const [order, setOrder] = useState<"before" | "after">("after");
  return (
    <section className="cookbook-result" aria-label="Re-ranking result">
      <span className="cookbook-eyebrow">
        Authored retrieval fixture · synthetic Noul probabilities
      </span>
      <h2>The same candidates, sorted by probability</h2>
      <p>
        Each probability answers the source question independently. These values
        do not sum to one and are neither Choice confidence nor a Score scale.
        No quality improvement is measured.
      </p>
      <p>
        Open Jev DevTools → Flows → “Score the shortlist”, select a collection
        item, then View Flow to inspect its request. Collection item numbers
        match the original retrieval ranks below. Inspect “Sort by Noul, highest
        first” for the actual sorting task.
      </p>
      <div className="rag-filters" aria-label="Candidate order">
        <button
          aria-pressed={order === "before"}
          onClick={() => setOrder("before")}
        >
          Before · retrieval fixture
        </button>
        <button
          aria-pressed={order === "after"}
          onClick={() => setOrder("after")}
        >
          After · stable Noul sort
        </button>
      </div>
      <div className="rag-passages">
        {data[order].map((row, index) => (
          <details key={row.id} className="rag-passage">
            <summary>
              <strong>
                {index + 1}. {row.title}
              </strong>{" "}
              · Noul {row.probability.toFixed(2)} · original #
              {row.retrievalRank}
            </summary>
            <p>
              {row.id} · collection item {row.retrievalRank} · re-ranked #
              {data.after.findIndex((candidate) => candidate.id === row.id) + 1}
            </p>
            <pre className="cookbook-excerpt">{row.text}</pre>
          </details>
        ))}
      </div>
    </section>
  );
}
