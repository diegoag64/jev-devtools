import "./extraction.css";
import type { ExtractionResult } from "../../../cookbooks/pre-parsed-extraction/flow.js";
export function ExtractionCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as ExtractionResult;
  return (
    <section
      className="cookbook-result extraction-result"
      aria-label="Pre-parsed extraction result"
    >
      <span className="cookbook-eyebrow">
        Synthetic selections · deterministic normalization
      </span>
      <h2>
        {data.candidates.length
          ? "From verbatim spans to normalized values"
          : "No candidates · no requests"}
      </h2>
      <p>
        Regex candidates stay in document order. Each selection is a separate
        Jev call. Choice confidence is shown independently of option
        probabilities; only the money Noul controls credit versus charge.
      </p>
      <h3>Source document</h3>
      <pre className="structure-source">{data.document}</pre>
      <h3>Candidates</h3>
      {data.candidates.length ? (
        <ol>
          {data.candidates.map((span) => (
            <li key={span}>
              <code>{span}</code>
            </li>
          ))}
        </ol>
      ) : (
        <p>The regex found no values to select or parse.</p>
      )}
      <h3>Normalized results</h3>
      <div className="structure-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Selected span</th>
              <th>Normalized value</th>
              <th>Credit / charge</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.role}>
                <td>{row.role}</td>
                <td>{row.source ?? "none"}</td>
                <td>
                  {row.normalized === null
                    ? row.status
                    : `${row.normalized}${row.currency ? ` ${row.currency}` : ""}`}
                </td>
                <td>
                  {row.probability === null
                    ? "Not asked"
                    : `${row.kind} · P(credit) = ${row.probability} (strict > 0.5)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Choice answers</h3>
      {data.selections.map((selection) => (
        <details className="rag-passage" key={selection.role}>
          <summary>
            {selection.role}: {selection.choice} · confidence{" "}
            {selection.confidence}
          </summary>
          <p>Synthetic API confidence; it does not gate normalization.</p>
          <dl>
            {Object.entries(selection.probabilities).map(
              ([label, probability]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>Option probability: {probability.toFixed(3)}</dd>
                </div>
              ),
            )}
          </dl>
        </details>
      ))}
      <p>
        Open Jev DevTools → Flows. Expand a selection or credit-check item with
        View Flow to inspect its exact request, selected span and routing.
      </p>
      <p className="sample-note">
        Recipe documents and authored edge cases with synthetic answers, not
        recorded model measurements. Phone formatting uses libphonenumber-js.
        Money uses exact decimal strings with comma grouping and dot decimals;
        other locale conventions are unsupported. Missing candidates or none
        bypass parsing.
      </p>
    </section>
  );
}
