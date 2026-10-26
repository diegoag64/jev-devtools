import type { ConfidenceResult } from "../../../cookbooks/confidence-fallback/flow.js";
export function ConfidenceCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as ConfidenceResult;
  return (
    <section
      className="cookbook-result"
      aria-label="Confidence classification result"
    >
      <h2>
        {data.level === "group"
          ? `Industry group ${data.label}`
          : `Division: ${data.label}`}
      </h2>
      <p>1 synthetic Jev request · 1 Choice question · 75 industry groups</p>
      <dl className="cookbook-metrics">
        <div>
          <dt>API confidence · routing field</dt>
          <dd>
            {data.confidence.toFixed(3)} {data.confidence >= 0.9 ? "≥" : "<"}{" "}
            0.900
          </dd>
        </div>
        <div>
          <dt>Largest class probability · not the gate</dt>
          <dd>{(data.largestProbability * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Selected group</dt>
          <dd>{data.group}</dd>
        </div>
        <div>
          <dt>Reported specificity</dt>
          <dd>{data.level}</dd>
        </div>
      </dl>
      <p>
        {data.level === "group"
          ? "The inclusive confidence cutoff keeps the detailed industry group."
          : "The deterministic task looks up this group's parent division; it does not ask a broader question."}
      </p>
      <details className="rag-passage">
        <summary>Selected group description</summary>
        <p>{data.groupDescription}</p>
      </details>
      <details className="rag-passage">
        <summary>All 75 class probabilities</summary>
        <dl>
          {Object.entries(data.probabilities)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, probability]) => (
              <div key={group}>
                <dt>
                  Group {group}
                  {group === data.group ? " · selected" : ""}
                </dt>
                <dd>{(probability * 100).toFixed(3)}%</dd>
              </div>
            ))}
        </dl>
      </details>
      <p>
        Open Jev DevTools → Flows to inspect the 75-option request, confidence
        condition and selected function path.
      </p>
      <p className="sample-note">
        Authored company descriptions and synthetic answers. Confidence and
        probabilities are independently specified test values, not measured
        model output or accuracy. No SEC dataset evaluation.
      </p>
    </section>
  );
}
