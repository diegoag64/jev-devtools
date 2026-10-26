import React from "react";
import type { DateResult } from "../../../cookbooks/date-extraction/flow.js";
const confidenceText = (value: number | null) =>
  value === null ? "Unavailable" : String(value);
export function DateCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as DateResult;
  return (
    <section className="cookbook-result" aria-label="Date extraction result">
      <span className="cookbook-eyebrow">
        Synthetic Choice answers · no measured accuracy
      </span>
      <h2>Dates assembled against {data.referenceDate}</h2>
      <div className="cookbook-metrics">
        <div>
          <span>Accepted</span>
          <strong>{data.accepted}</strong>
        </div>
        <div>
          <span>Needs review</span>
          <strong>{data.review}</strong>
        </div>
        <div>
          <span>Reference date · Thursday</span>
          <strong>{data.referenceDate}</strong>
        </div>
      </div>
      <p>
        Review unresolved dates, missing used confidence, or a minimum strictly
        below <b>0.60</b>. Exactly 0.60 is accepted. Choice confidence is
        separate from label probabilities.
      </p>
      <p>
        Open Jev DevTools → Flows, select a role in “Extract each requested
        date”, then View Flow to inspect its request, assembly and chosen path.
      </p>
      {data.rows.map((row) => (
        <article className="date-result-row" key={row.id}>
          <h3>{row.role}</h3>
          <p>{row.document}</p>
          <dl className="date-result-values">
            <div>
              <dt>ISO date</dt>
              <dd>{row.date ?? "null · unresolved"}</dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd>{row.route === "review" ? "Needs review" : "Accepted"}</dd>
            </div>
            <div>
              <dt>Minimum available used confidence</dt>
              <dd>{confidenceText(row.confidence)}</dd>
            </div>
          </dl>
          {(row.note || row.missingConfidence) && (
            <p>
              {row.note}
              {row.note && row.missingConfidence ? "; " : ""}
              {row.missingConfidence
                ? "Used component confidence unavailable"
                : ""}
            </p>
          )}
          <details>
            <summary>Date components · used and unused</summary>
            <div
              className="date-components"
              role="region"
              aria-label={`Components for ${row.id}`}
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Selected label</th>
                    <th>Confidence</th>
                    <th>Used</th>
                  </tr>
                </thead>
                <tbody>
                  {row.components.map((c) => (
                    <tr key={c.part}>
                      <th scope="row">{c.part}</th>
                      <td>{c.choice}</td>
                      <td>{confidenceText(c.confidence)}</td>
                      <td>{c.used ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </article>
      ))}
    </section>
  );
}
