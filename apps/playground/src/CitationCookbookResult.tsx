import React from "react";
import type { CitationResult } from "../../../cookbooks/citation-checking/flow.js";
export function CitationCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const { rows } = result.value as CitationResult;
  return (
    <section className="cookbook-result" aria-label="Citation checking result">
      <span className="cookbook-eyebrow">
        Synthetic Choice answers · real deterministic matching
      </span>
      <h2>{rows.length} citations checked against RFC 7519</h2>
      <div className="cookbook-metrics">
        <div>
          <span>Jev sample requests</span>
          <strong>{rows.filter((row) => row.answer !== null).length}</strong>
        </div>
        <div>
          <span>Automatic verdicts</span>
          <strong>{rows.filter((row) => row.auto).length}</strong>
        </div>
        <div>
          <span>Human review required</span>
          <strong>{rows.filter((row) => !row.auto).length}</strong>
        </div>
      </div>
      <p>
        Open Jev DevTools → Flows, select “Check citations in order”, choose an
        item and View Flow. Inspect the match task, optional Choice and
        confidence route. Human review is a proposed next action.
      </p>
      {rows.map((row, index) => (
        <details className="rag-passage" key={row.citation.id}>
          <summary>
            <span className="cookbook-badge">{row.verdict}</span>{" "}
            <strong>
              Item {index + 1} · {row.citation.id}
            </strong>{" "}
            · {row.auto ? "Automatic" : "Human review required"}
          </summary>
          <p>{row.citation.claim}</p>
          <dl>
            <div>
              <dt>Quote status</dt>
              <dd>{row.status}</dd>
            </div>
            <div>
              <dt>Cited section → inspected section</dt>
              <dd>
                {row.citation.section} → {row.sectionNumber ?? "none"}
              </dd>
            </div>
            <div>
              <dt>API confidence (synthetic)</dt>
              <dd>
                {row.confidence === null
                  ? "null · no Jev call"
                  : row.confidence.toFixed(4)}
              </dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd>
                {row.answer === null
                  ? "Quote absent: fabricated deterministically"
                  : row.auto
                    ? "Confidence ≥ 0.80: accept verdict"
                    : "Confidence < 0.80: request human review"}
              </dd>
            </div>
          </dl>
          <h3>Quoted text</h3>
          <pre className="cookbook-excerpt">
            {row.citation.quote === null
              ? "No quote supplied; use the named source section."
              : row.citation.quote}
          </pre>
          {row.answer && (
            <>
              <h3>Choice probabilities · separate from confidence</h3>
              <dl>
                {Object.entries(row.answer.probabilities).map(
                  ([name, probability]) => (
                    <div key={name}>
                      <dt>
                        {name}
                        {name === row.answer!.choice ? " (selected)" : ""}
                      </dt>
                      <dd>{probability.toFixed(2)}</dd>
                    </div>
                  ),
                )}
              </dl>
            </>
          )}
          {row.normalizedSection !== null && (
            <>
              <h3>Normalized source evidence · section {row.sectionNumber}</h3>
              <pre className="cookbook-excerpt">
                {row.matchOffset !== null && row.normalizedQuote !== null ? (
                  <>
                    {row.normalizedSection.slice(0, row.matchOffset)}
                    <mark>{row.normalizedQuote}</mark>
                    {row.normalizedSection.slice(
                      row.matchOffset + row.normalizedQuote.length,
                    )}
                  </>
                ) : (
                  row.normalizedSection
                )}
              </pre>
              <details className="cookbook-agent-hint">
                <summary>Full cleaned section sent to Jev</summary>
                <pre>{row.section}</pre>
              </details>
            </>
          )}
          {row.status === "missing" && (
            <p>
              No normalized exact substring exists in any numbered section.
              Matching is case sensitive; rewording can be labeled fabricated.
            </p>
          )}
        </details>
      ))}
      <p className="sample-note">
        API confidence is not the selected option probability. These authored
        responses demonstrate routing, not measured quality. The source and
        eight original citations are pinned upstream assets.
      </p>
    </section>
  );
}
