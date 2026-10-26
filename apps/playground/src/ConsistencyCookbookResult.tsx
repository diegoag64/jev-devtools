import React, { useState } from "react";
import type { ConsistencyResult } from "../../../cookbooks/consistency-choices/analysis.js";
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
export function ConsistencyCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as ConsistencyResult;
  const [selected, setSelected] = useState({ row: 0, repeat: 0 });
  const row = data.rows[selected.row],
    cell = row.cells[selected.repeat];
  const sample = data.samples[selected.repeat],
    raw = sample.answers[row.key];
  return (
    <section
      className="cookbook-result consistency-result"
      aria-label="Choice consistency result"
    >
      <span className="cookbook-eyebrow">
        Authored synthetic responses · calculated statistics
      </span>
      <h2>Agreement can rise when the application abstains</h2>
      <p>
        15 sequential requests × 8 Choice questions. These fixtures demonstrate
        calculations, not measured model consistency or accuracy.
      </p>
      <dl className="consistency-stats">
        {[
          ["Raw agreement", percent(data.stats.rawAgreement)],
          ["Policy agreement", percent(data.stats.policyAgreement)],
          ["Uncertain", percent(data.stats.uncertainRate)],
          ["Automatic labels", percent(data.stats.automaticRate)],
          ["Conflicting questions", String(data.stats.conflicts)],
          ["Parse failures", percent(data.stats.parseFailureRate)],
          [
            "Mean probability std",
            data.stats.meanProbabilityStd?.toFixed(4) ?? "n/a",
          ],
          [
            "Max probability std",
            data.stats.maxProbabilityStd?.toFixed(4) ?? "n/a",
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>
        Raw agreement is each question’s plurality argmax count ÷ 15, averaged
        over eight questions. Policy agreement uses decisions including
        uncertain; failures count against both. Outcome rates divide by all 120
        answers. Conflicts count questions with multiple concrete decisions.
      </p>
      <h3>Every application decision</h3>
      <p id="consistency-legend">
        Select a cell for the full distribution. Scroll horizontally for all 15
        repeats. Gray = uncertain (top probability &lt; 0.60). Exactly 0.60
        selects the top label. Colors identify label positions within each
        question, not severity. Cell probabilities use three decimals to keep
        boundary probes distinct.
      </p>
      <div
        className="consistency-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable decision heatmap"
      >
        <table
          className="consistency-heatmap"
          aria-describedby="consistency-legend"
        >
          <thead>
            <tr>
              <th scope="col">Question / repeat</th>
              {data.samples.map((s) => (
                <th scope="col" key={s.index}>
                  {s.index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, rowIndex) => (
              <tr key={r.key}>
                <th scope="row">{r.key}</th>
                {r.cells.map((c, repeat) => (
                  <td key={repeat}>
                    <button
                      type="button"
                      className="consistency-cell"
                      data-label={
                        c.decision === "uncertain"
                          ? "uncertain"
                          : c.decision === null
                            ? "failure"
                            : c.labels.indexOf(c.decision)
                      }
                      aria-label={`${r.key}, repeat ${repeat + 1}: ${c.decision ?? "n/a"}, top probability ${c.topProbability ?? "unavailable"}`}
                      aria-pressed={
                        selected.row === rowIndex && selected.repeat === repeat
                      }
                      onClick={() => setSelected({ row: rowIndex, repeat })}
                    >
                      <span>{c.decision ?? "n/a"}</span>
                      <small>{c.topProbability?.toFixed(3) ?? "—"}</small>
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="consistency-detail" aria-live="polite">
        <h3>
          {row.key} · repeat {selected.repeat + 1}
        </h3>
        <p>{row.instructions}</p>
        <p>
          Raw argmax: <strong>{cell.rawLabel ?? "n/a"}</strong> · application
          decision: <strong>{cell.decision ?? "n/a"}</strong> · top probability:{" "}
          <strong>{cell.topProbability?.toFixed(3) ?? "n/a"}</strong>
        </p>
        <p>
          Returned Choice label: {raw.choice} · separate API confidence:{" "}
          {raw.confidence}. Confidence does not control this gate. “Automatic”
          means a concrete label was selected; labels such as Escalate or Human
          still describe human handling.
        </p>
        <dl>
          {cell.labels.map((label, i) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{cell.values[i]?.toFixed(3) ?? "missing"}</dd>
            </div>
          ))}
        </dl>
        <p>
          Question agreement: raw {percent(row.rawAgreement)} · policy{" "}
          {percent(row.policyAgreement)}. Population standard deviation per
          label:{" "}
          {row.labels
            .map(
              (label, i) => `${label} ${row.labelStds[i]?.toFixed(4) ?? "n/a"}`,
            )
            .join(" · ")}
        </p>
        <details>
          <summary>Raw response for this repeat</summary>
          <pre>
            {JSON.stringify(
              {
                uid: sample.uid,
                source: sample.source,
                answers: sample.answers,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </div>
      <details className="consistency-detail">
        <summary>Original post sent in every request</summary>
        <pre>{JSON.stringify(data.post, null, 2)}</pre>
      </details>
      <details>
        <summary>Definitions and adaptation boundaries</summary>
        <p>
          Probability variation uses population standard deviation across
          repeats for each label, then an unweighted mean and maximum across all
          labels and questions. Missing entries are omitted per label for
          standard deviation; any missing entry marks that answer as a parse
          failure. A range-invalid vector is separately a decision failure (
          {percent(data.stats.decisionFailureRate)}).
        </p>
        <p>
          The original post and rubric stay fixed while every request receives a
          fresh uid. This cannot isolate irrelevant-field sensitivity from
          identical-input sampling variation. All raw answers remain in the
          report and Jev DevTools. No provider comparison, cost, usage, timing
          or measured-quality claim is reproduced. No moderation action is
          executed.
        </p>
      </details>
      <p className="sample-note">
        Open Jev DevTools → Flows. Choose a repeat and View Flow to inspect
        every question’s exact gate and selected path.
      </p>
    </section>
  );
}
