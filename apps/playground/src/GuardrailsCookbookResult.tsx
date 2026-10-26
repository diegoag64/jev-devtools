import { useState } from "react";
import type { GuardrailsResult } from "../../../cookbooks/guardrails/flow.js";

export function GuardrailsCookbookResult({
  result,
}: {
  result: { outcome: string; value?: unknown };
}) {
  const data = result.value as GuardrailsResult;
  const [policy, setPolicy] = useState<"strict" | "permissive">("strict");
  if (!data?.assessment || !data.strict || !data.permissive) return null;
  const decision = data[policy];
  return (
    <section className="cookbook-result" aria-label="Guardrails result">
      <div className="cookbook-result-heading">
        <div>
          <span className="cookbook-eyebrow">
            Synthetic assessment · {data.side} battery
          </span>
          <h2>
            {policy}: {decision.action}
          </h2>
        </div>
        <span className="cookbook-badge">1 request · 2 policies</span>
      </div>
      <p>
        One assessment, two application decisions. Changing this view reuses the
        result; it sends no request. The flow diagram shows the default strict
        route.
      </p>
      <div className="result-tabs" role="group" aria-label="Inspect policy">
        {(["strict", "permissive"] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={policy === name}
            onClick={() => setPolicy(name)}
          >
            {name} → {data[name].action}
          </button>
        ))}
      </div>
      <div className="cookbook-metrics">
        <div>
          <span>Hazard action threshold</span>
          <strong>≥ {policy === "strict" ? "0.70" : "0.85"}</strong>
          <small>Review starts at ≥ 0.35</small>
        </div>
        <div>
          <span>Severity Score · 0–3</span>
          <strong>{data.assessment.severity.toFixed(2)}</strong>
          <small>≥ 2 upgrades triggered review only</small>
        </div>
        <div>
          <span>Action precedence</span>
          <strong>support → block</strong>
          <small>then review → pass</small>
        </div>
      </div>
      <div className="cookbook-candidates" aria-label="Hazard decisions">
        {decision.hazards.map((hazard) => (
          <article className="cookbook-candidate" key={hazard.hazard}>
            <strong>{hazard.hazard}</strong>
            <dl>
              <div>
                <dt>Noul probability</dt>
                <dd>{hazard.probability.toFixed(3)}</dd>
              </div>
              <div>
                <dt>Threshold action</dt>
                <dd>{hazard.triggered}</dd>
              </div>
              <div>
                <dt>After severity rule</dt>
                <dd>{hazard.action}</dd>
              </div>
            </dl>
            {hazard.upgraded && (
              <p>Triggered review upgraded to block at severity ≥ 2.</p>
            )}
          </article>
        ))}
      </div>
      <p className="sample-note">
        Independent Noul probabilities need not sum to one. Severity is a Score,
        not confidence or a probability. High severity with no triggered hazard
        still passes. Routes are returned data: no LLM generation, support
        contact, or review ticket occurs.
      </p>
    </section>
  );
}
