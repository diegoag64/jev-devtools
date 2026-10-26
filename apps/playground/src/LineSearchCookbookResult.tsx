import type { LineSearchResult } from "../../../cookbooks/line-search/flow.js";
export function LineSearchCookbookResult({
  result,
}: {
  result: { outcome: string; value?: unknown };
}) {
  const data = result.value as LineSearchResult;
  const verdict =
    result.outcome === "answered"
      ? "Answered in this document"
      : result.outcome === "absent"
        ? "Not in this document"
        : "Partially addressed";
  return (
    <section className="cookbook-result" aria-label="Line search result">
      <span className="cookbook-eyebrow">
        Synthetic responses · complete pinned document
      </span>
      <h2>{verdict}</h2>
      <p>
        Noul existence: <strong>{data.exists.toFixed(4)}</strong>. Answered ≥
        0.70; absent &lt; 0.35; otherwise partial.
      </p>
      <p>
        Choice probabilities rank lines relative to each other and sum to 1. The
        top line is a place to look, not proof of an answer. API Choice
        confidence ({data.confidence.toFixed(2)}) is separate and does not
        affect this route. No Score question is used.
      </p>
      <h3>Top matches</h3>
      {data.ranked.slice(0, 4).map((line) => (
        <details
          className="rag-passage"
          key={line.id}
          open={line === data.ranked[0]}
        >
          <summary>
            {line.id} · Choice probability {line.probability.toFixed(4)}
          </summary>
          <p>{line.text}</p>
        </details>
      ))}
      <details className="rag-passage">
        <summary>
          All {data.ranked.length} line options · ranked with full text
        </summary>
        <ol>
          {data.ranked.map((line) => (
            <li key={line.id}>
              <strong>
                {line.id} · {line.probability.toFixed(4)}
              </strong>
              <p>{line.text}</p>
            </li>
          ))}
        </ol>
      </details>
      <p>
        Open Jev DevTools → Flows to inspect tagging, the single request,
        ranking, lookup and the selected existence route. Large captured
        previews may be truncated; every line remains available above.
      </p>
      <p>
        This is a historical cookbook document, not current policy guidance.
        Probabilities and confidence are authored samples, not measurements.
      </p>
    </section>
  );
}
