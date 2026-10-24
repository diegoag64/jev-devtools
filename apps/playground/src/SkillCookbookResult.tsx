import { useState } from "react";

type Result = {
  suggestions: string[];
  gate: number;
  shortlist: Array<{
    name: string;
    probability: number;
    description: string;
    excerpt: string;
  }>;
  fits: Record<string, number>;
  winner: string | null;
  bestFit: number | null;
  suggestionBlock: string;
};
export function SkillCookbookResult({
  result,
  mode,
}: {
  result: { outcome: string; value?: unknown };
  mode: string;
}) {
  const data = result.value as Result;
  const [details, setDetails] = useState<string>();
  if (!data || !Array.isArray(data.suggestions)) return null;
  const suggested = data.suggestions[0];
  return (
    <section className="cookbook-result" aria-label="Skill suggestion result">
      <div className="cookbook-result-heading">
        <div>
          <span className="cookbook-eyebrow">
            {mode === "sample" ? "Synthetic result" : "Live result"}
          </span>
          <h2>
            {suggested
              ? `Suggest ${suggested}`
              : result.outcome === "no-skill-needed"
                ? "No skill needed"
                : "No candidate fits"}
          </h2>
        </div>
        <span className="cookbook-badge">
          {data.shortlist.length ? "2 requests" : "1 request"}
        </span>
      </div>
      <p>
        {suggested
          ? "The fit gate passed. Suggest the returned Choice winner; the agent may still ignore it."
          : result.outcome === "no-skill-needed"
            ? "The request gate is below 0.30, so the flow skips the second Jev request."
            : "Choice returned a candidate, but every independent fit is below 30%. The flow abstains."}
      </p>
      <div className="cookbook-metrics">
        <div>
          <span>Request gate · ≥ 0.30</span>
          <strong>{data.gate.toFixed(3)}</strong>
          <small>Mean of the three oriented Nouls</small>
        </div>
        <div>
          <span>Highest fit · ≥ 30%</span>
          <strong>
            {data.bestFit === null
              ? "Skipped"
              : `${Math.round(data.bestFit * 100)}%`}
          </strong>
          <small>Independent suitability gate</small>
        </div>
        <div>
          <span>Returned Choice</span>
          <strong>{data.winner ?? "Skipped"}</strong>
          <small>Chooses the suggestion, not the fit scores</small>
        </div>
      </div>
      {data.shortlist.length > 0 && (
        <div className="cookbook-candidates" aria-label="Shortlisted skills">
          {data.shortlist.map((skill) => (
            <article
              key={skill.name}
              className="cookbook-candidate"
              data-selected={suggested === skill.name}
            >
              <div className="cookbook-result-heading">
                <strong>{skill.name}</strong>
                {suggested === skill.name && (
                  <span className="cookbook-badge">Suggested</span>
                )}
              </div>
              <p>{skill.description}</p>
              <dl>
                <div>
                  <dt>Initial ranking</dt>
                  <dd>{Math.round(skill.probability * 100)}%</dd>
                </div>
                <div>
                  <dt>Independent fit</dt>
                  <dd>{Math.round(data.fits[skill.name] * 100)}%</dd>
                </div>
              </dl>
              <button
                type="button"
                className="cookbook-excerpt-toggle"
                onClick={() =>
                  setDetails(details === skill.name ? undefined : skill.name)
                }
                aria-expanded={details === skill.name}
              >
                Read evaluated excerpt
              </button>
              {details === skill.name && (
                <pre className="cookbook-excerpt">{skill.excerpt}</pre>
              )}
            </article>
          ))}
        </div>
      )}
      <details className="cookbook-agent-hint" open>
        <summary>Agent hint · no skill is executed</summary>
        <pre>{data.suggestionBlock.trim()}</pre>
      </details>
      <p className="sample-note">
        Open Jev DevTools → Flows to inspect every request, function, branch,
        and untaken path. Independent fit scores do not sum to one.
      </p>
    </section>
  );
}
