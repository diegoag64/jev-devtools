import type { SdeResult } from "../../../cookbooks/sde-cascade/flow.js";
export function SdeCookbookResult({ result }: { result: { value?: unknown } }) {
  const data = result.value as SdeResult;
  const flags = [...data.flags].sort((a, b) => b.probability - a.probability);
  return (
    <section className="cookbook-result" aria-label="SDE cascade result">
      <span className="cookbook-eyebrow">
        Synthetic walkthrough · no measured model performance
      </span>
      <h2>
        {data.route === "strong"
          ? "Escalated to the stronger extractor"
          : "Kept the cheap extraction"}
      </h2>
      <div className="cookbook-metrics">
        <div>
          <span>Highest field flag</span>
          <strong>{Math.round(data.maxFieldProbability * 100)}%</strong>
        </div>
        <div>
          <span>Field flags above 70%</span>
          <strong>{flags.filter((f) => f.fires).length}</strong>
        </div>
        <div>
          <span>Changed fields</span>
          <strong>{data.changes.length}</strong>
        </div>
      </div>
      <p>
        The rule is strictly <b>above 70%</b>. The overall judge is{" "}
        {Math.round(data.overall * 100)}% and does not affect this decision.
        Both routes rejoin before comparing the final record.
      </p>
      <p>
        Open Jev DevTools → Flows to follow the branch. The dimmed path did not
        execute. Select “Verify every extracted field” to inspect all questions
        and answers.
      </p>
      <div className="sde-records">
        {(
          [
            ["Cheap candidate", data.before],
            ["Final record", data.final],
          ] as const
        ).map(([label, record]) => (
          <div key={label} className="sde-record">
            <h3>{label}</h3>
            <dl>
              {Object.entries(record).map(([field, value]) => (
                <div
                  key={field}
                  data-changed={
                    label === "Final record" &&
                    data.changes.some((c) => c.field === field)
                  }
                >
                  <dt>{field.replaceAll("_", " ")}</dt>
                  <dd>
                    {value || (
                      <span className="sde-empty">
                        Empty · no value extracted
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <details className="sde-flags" open>
        <summary>
          All {flags.length} per-field checks · probability of a problem
        </summary>
        {flags.map((flag) => (
          <div className="sde-flag" key={flag.id} data-fires={flag.fires}>
            <span>
              <b>{flag.id.split("::")[0].replaceAll("_", " ")}</b>
              <small>{flag.id.split("::")[1].replaceAll("_", " ")}</small>
            </span>
            <meter
              min={0}
              max={1}
              value={flag.probability}
              aria-label={flag.id}
            />
            <strong>{Math.round(flag.probability * 100)}%</strong>
            <small>
              {flag.fires ? "Triggers escalation" : "Below or at threshold"}
            </small>
          </div>
        ))}
      </details>
      <p className="sample-note">
        The stronger extraction is not reverified in this recipe. These fixtures
        illustrate execution and routing, not correctness guarantees, provider
        latency, cost savings, or the original notebook's evaluation.
      </p>
    </section>
  );
}
