import type { HierarchyResult } from "../../../cookbooks/hierarchical-classification/flow.js";
export function HierarchyCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as HierarchyResult;
  return (
    <section
      className="cookbook-result"
      aria-label="Hierarchical classification result"
    >
      <span className="cookbook-eyebrow">
        Synthetic probabilities · geometric-mean path scores
      </span>
      <h2>
        {data.agrees
          ? "Both searches reached the same leaf"
          : "Beam search recovered a different path"}
      </h2>
      <p>
        Scores rank paths; they are not calibrated classification confidence.
        Single-child edges add no decision. Completed leaves compete with
        expanded paths at every round.
      </p>
      <div className="sde-records">
        {(
          [
            ["Beam · width 3", data.beam],
            ["Greedy · width 1", data.greedy],
          ] as const
        ).map(([title, search]) => (
          <div key={title} className="sde-record">
            <h3>{title}</h3>
            <p>
              <strong>{search.beam[0].path.join(" → ") || "Root"}</strong>
            </p>
            <dl>
              <div>
                <dt>Path score</dt>
                <dd>
                  {search.beam[0].decisions
                    ? search.beam[0].score.toFixed(3)
                    : "1.000 · no scoring decisions"}
                </dd>
              </div>
              <div>
                <dt>Iterations</dt>
                <dd>{search.rounds.length}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p>
        Open Jev DevTools → Flows. On either Loop card, select an iteration and{" "}
        <b>View Flow</b>. Its frontier collection exposes every item’s complete
        request diagram, including deterministic paths with no inference.
      </p>
      {(
        [
          ["Beam search", data.beam],
          ["Greedy search", data.greedy],
        ] as const
      ).map(([title, search]) => (
        <div key={title}>
          <h3>{title} · iteration history</h3>
          {!search.rounds.length && (
            <p>
              The initial path was already a leaf. No iteration or request ran.
            </p>
          )}
          {search.rounds.map((round) => (
            <details
              key={round.index}
              className="rag-passage"
              open={round.index === search.rounds.length - 1}
            >
              <summary>
                Iteration {round.index + 1} · {round.records.length} frontier
                nodes · {round.kept.length} retained
              </summary>
              <h4>Retained paths</h4>
              <ul>
                {round.kept.map((c) => (
                  <li key={c.path.join("/")}>
                    <strong>{c.path.join(" → ")}</strong> · {c.score.toFixed(3)}{" "}
                    · {c.decisions} scoring decisions
                  </li>
                ))}
              </ul>
              {round.pruned.length > 0 && (
                <>
                  <h4>Pruned alternatives</h4>
                  <ul>
                    {round.pruned.map((c) => (
                      <li key={c.path.join("/")}>
                        {c.path.join(" → ")} · {c.score.toFixed(3)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {round.records.map((record) => (
                <details key={record.parent.join("/")}>
                  <summary>
                    {record.parent.join(" → ") || "Root"} · all child
                    probabilities
                  </summary>
                  <dl>
                    {Object.entries(record.probabilities).map(([label, p]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>
                          {Math.round(p * 100)}%
                          {Object.keys(record.probabilities).length === 1
                            ? " · deterministic"
                            : ""}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
            </details>
          ))}
        </div>
      ))}
      <p className="sample-note">
        This reduced teaching taxonomy preserves the official executable
        recipe’s scoring, pruning and separate concurrent requests. It does not
        reproduce its full taxonomies, evaluation, or latency results.
      </p>
    </section>
  );
}
