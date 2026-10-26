import type { ParallelQuestionsResult } from "../../../cookbooks/parallel-questions/flow.js";
export function ParallelQuestionsCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as ParallelQuestionsResult;
  return (
    <section
      className="cookbook-result structure-result"
      aria-label="Parallel questions result"
    >
      <span className="cookbook-eyebrow">
        Synthetic answers · computed comparisons
      </span>
      <h2>One batch or 13 sequential requests?</h2>
      <p>
        {data.repeats} repeats per strategy · {data.batchedRequests} batched
        requests versus {data.singleRequests} single-question requests. Every
        request uses the same authored document.
      </p>
      <p>
        These statistics describe fixed fixtures. They do not establish model
        quality or batching independence. Usage, cost, model latency and savings
        are unavailable. Inspector durations describe local sample execution
        only.
      </p>
      <p>
        Choice metrics use the maximum label probability, independently of
        confidence. Scores use score ÷ top level. Standard deviation uses n − 1.
      </p>
      <div className="structure-table-scroll">
        <table>
          <caption>All 13 questions · five repeats per strategy</caption>
          <thead>
            <tr>
              <th>Question</th>
              <th>Metric</th>
              <th>Batch mean</th>
              <th>Single mean</th>
              <th>Batch std dev</th>
              <th>Single std dev</th>
              <th>Mean difference (single − batch)</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.key}</th>
                <td>{row.metric}</td>
                <td>{row.batchStats.mean.toFixed(4)}</td>
                <td>{row.singleStats.mean.toFixed(4)}</td>
                <td>{row.batchStats.stdev?.toFixed(4) ?? "Unavailable"}</td>
                <td>{row.singleStats.stdev?.toFixed(4) ?? "Unavailable"}</td>
                <td>{row.meanDifference.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Every answer, by question and repeat</h3>
      {data.rows.map((row) => (
        <details className="rag-passage" key={row.key}>
          <summary>
            {row.key} · {row.instructions}
          </summary>
          <p>Tracked metric: {row.metric}</p>
          {row.batched.map((observation, index) => (
            <div key={index}>
              <h4>Repeat {index + 1}</h4>
              <p>
                Batch metric: {observation.value.toFixed(4)} · Single metric:{" "}
                {row.singles[index].value.toFixed(4)}
              </p>
              <pre className="structure-source">
                {JSON.stringify(
                  {
                    batched: observation.answer,
                    single: row.singles[index].answer,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          ))}
        </details>
      ))}
      <p>
        Open Jev DevTools → Flows. Choose an iteration in either loop and View
        Flow. In the single-question loop, choose a collection item to inspect
        its request. All raw answers are also available above.
      </p>
    </section>
  );
}
