import type { EntityResult } from "../../../cookbooks/entity-alignment/flow.js";
const outcomes: Record<string, string> = {
  "leave-unlinked": "Leave unlinked",
  "curator-review": "Curator review",
  "proposed-same-as": "Proposed sameAs",
};
export function EntityCookbookResult({
  result,
}: {
  result: { outcome: string; value?: unknown };
}) {
  const data = result.value as EntityResult;
  return (
    <section className="cookbook-result" aria-label="Entity alignment result">
      <span className="cookbook-eyebrow">
        Synthetic judgments · one request · four questions
      </span>
      <h2>{outcomes[result.outcome]}</h2>
      <p>
        Pair {data.pair.id} · Score {data.score} / 2 → level {data.level} (
        {["different", "related", "same"][data.level]}).
      </p>
      <p>
        Score &lt; 0.5: leave unlinked. 0.5 ≤ Score &lt; 1.5: curator review.
        Score ≥ 1.5: proposed sameAs.
      </p>
      <div className="structure-comparison">
        {(["entity_a", "entity_b"] as const).map((side) => (
          <div key={side} className="structure-preview">
            <h3>{side === "entity_a" ? "Catalogue A" : "Catalogue B"}</h3>
            <dl>
              {Object.entries(data.pair[side]).map(([field, value]) => (
                <div key={field}>
                  <dt>{field}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <h3>Companion agreement · P(yes)</h3>
      <dl>
        {Object.entries(data.properties).map(([field, value]) => (
          <div key={field}>
            <dt>{field.replace("same_", "Same ")}</dt>
            <dd>{(value * 100).toFixed(1)}%</dd>
          </div>
        ))}
      </dl>
      <p>
        Nouls explain field agreement; they do not independently decide the
        match. ABV difference: {data.abvGap.toFixed(2)} percentage points,
        computed in code and excluded from routing.
      </p>
      <details className="rag-passage">
        <summary>Score distribution and confidence · synthetic</summary>
        <dl>
          {Object.entries(data.probabilities).map(([level, value]) => (
            <div key={level}>
              <dt>
                Level {level} ·{" "}
                {["different", "related", "same"][Number(level)]}
              </dt>
              <dd>{(value * 100).toFixed(2)}%</dd>
            </div>
          ))}
        </dl>
        <p>
          API Score confidence: {(data.confidence * 100).toFixed(0)}%.
          Confidence, level probabilities and companion Nouls are separate
          values. The route uses only the Score.
        </p>
      </details>
      <p>
        Open Jev DevTools → Flows to inspect the pair-loading task, the
        four-question request, the evidence transformation and the selected
        threshold path.
      </p>
      <p className="sample-note">
        Four attributed examples from TypeSafe’s Magellan Beer candidate pairs;
        all responses are authored synthetic fixtures. Boundary samples reuse
        c428 with deliberately contrasting companions. No database mutation,
        live inference or 450-pair evaluation.
      </p>
    </section>
  );
}
