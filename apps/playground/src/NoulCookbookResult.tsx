import type { NoulResult } from "../../../cookbooks/consistency-nouls/flow.js";
export function NoulCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as NoulResult;
  return (
    <section
      className="cookbook-result noul-result"
      aria-label="Noul consistency result"
    >
      <span className="cookbook-eyebrow">
        Authored synthetic responses · no measured consistency
      </span>
      <h2>Every probability. Every decision.</h2>
      <p>
        {data.repeats.length} sequential requests × {data.questions.length} Noul
        questions. No below 0.30; yes above 0.70; uncertain from 0.30 through
        0.70 inclusive. Uncertain questions enter a review list; no claim action
        is taken.
      </p>
      <p>
        Noul is P(true), not Choice confidence or a Score. Fixture variation is
        not evidence of model consistency, quality or provider performance.
        Cross-provider experiments, usage, cost and inference timing are
        excluded.
      </p>
      <details className="rag-passage">
        <summary>Descriptive statistics of these fixtures</summary>
        <p>
          Mean per-question population standard deviation:{" "}
          {data.meanPopulationStdDev.toFixed(6)}. Each question divides squared
          deviations by 15. These are computed fixture statistics, not measured
          model results.
        </p>
        <div
          className="noul-table-scroll"
          role="region"
          aria-label="Fixture statistics"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Mean</th>
                <th scope="col">Min</th>
                <th scope="col">Max</th>
                <th scope="col">Population SD</th>
                <th scope="col">No / uncertain / yes</th>
              </tr>
            </thead>
            <tbody>
              {data.questions.map((q) => (
                <tr key={q.key}>
                  <th scope="row">{q.key}</th>
                  <td>{q.mean.toFixed(4)}</td>
                  <td>{q.min}</td>
                  <td>{q.max}</td>
                  <td>{q.populationStdDev.toFixed(6)}</td>
                  <td>
                    {q.counts.no} / {q.counts.uncertain} / {q.counts.yes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <h3>All answers by question and repeat</h3>
      <p>
        Scroll horizontally to inspect all 15 repeats. Each cell retains the
        exact fixture probability and its decision; color is only a secondary
        cue.
      </p>
      <div
        className="noul-table-scroll"
        role="region"
        aria-label="All 210 Noul answers"
        tabIndex={0}
      >
        <table className="noul-matrix">
          <thead>
            <tr>
              <th scope="col">Question / repeat</th>
              {data.repeats.map((r) => (
                <th scope="col" key={r.index}>
                  {r.index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.questions.map((q) => (
              <tr key={q.key}>
                <th scope="row">
                  <strong>{q.key}</strong>
                  <span>{q.text}</span>
                </th>
                {data.repeats.map((r) => {
                  const answer = r.answers.find((a) => a.key === q.key)!;
                  return (
                    <td key={r.index} data-decision={answer.decision}>
                      <strong>{answer.probability}</strong>
                      <span>{answer.decision}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Repeat metadata and review lists</h3>
      <p>
        The source changes a random UID on every request and cannot separate UID
        sensitivity from identical-input variation. These fixtures use
        deterministic, distinct UIDs; repeating them is not independent
        sampling.
      </p>
      {data.repeats.map((r) => (
        <details className="rag-passage" key={r.uid}>
          <summary>
            Repeat {r.index + 1} · {r.review.length} uncertain questions
          </summary>
          <dl>
            <div>
              <dt>UID</dt>
              <dd>{r.uid}</dd>
            </div>
            <div>
              <dt>Requested model</dt>
              <dd>{r.requestedModel}</dd>
            </div>
            <div>
              <dt>Returned model</dt>
              <dd>{r.returnedModel ?? "Unavailable"}</dd>
            </div>
          </dl>
          <p>
            Review list: {r.review.join(", ") || "None"}. Other answers remain
            question-level yes/no decisions, not payout instructions.
          </p>
        </details>
      ))}
      <p className="sample-note">
        Open Jev DevTools → Flows, select a repeat in the collection and choose
        View Flow to inspect its request and selected review path. Recorded
        elapsed time is local fixture execution, not provider latency.
      </p>
    </section>
  );
}
