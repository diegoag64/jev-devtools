import { useState } from "react";
import type { TwitchResult } from "../../../cookbooks/twitch-chat-filter/flow.js";
import "./twitch-cookbook.css";
export function TwitchCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as TwitchResult;
  const [quiet, setQuiet] = useState(false);
  const counts = data.rows.reduce<Record<string, number>>((counts, row) => {
    const { action } = quiet ? row.quiet : row.normal;
    counts[action] = (counts[action] ?? 0) + 1;
    return counts;
  }, {});
  return (
    <section
      className="cookbook-result twitch-result"
      aria-label="Twitch chat filter result"
    >
      <span className="cookbook-eyebrow">
        Synthetic answers · {data.rows.length} messages · input order preserved
      </span>
      <h2>{quiet ? "Quiet chat" : "Normal chat"}</h2>
      <p>
        {data.stream.title} · {data.stream.game}
      </p>
      <p>
        Toxic ≥ 0.70 → hide; category hide → hide; spoiler ≥ 0.70 → blur;
        otherwise apply the category action.
      </p>
      <label className="twitch-policy">
        <input
          type="checkbox"
          checked={quiet}
          onChange={(event) => setQuiet(event.target.checked)}
        />{" "}
        Quiet policy · hide hype and dim conversation
      </label>
      <p>
        {data.changed} messages change between policies · 0 new requests.
        Questions highlight; hype and conversation normally show; backseat
        advice and spam hide.
      </p>
      <ul className="twitch-counts" aria-label="Action counts">
        {["show", "highlight", "dim", "blur", "hide"].map((action) => (
          <li key={action}>
            <strong>{action}</strong> {counts[action] ?? 0}
          </li>
        ))}
      </ul>
      <ol className="twitch-feed" aria-label="Filtered chat">
        {data.rows.map((row, index) => {
          const decision = quiet ? row.quiet : row.normal;
          return (
            <li
              key={index}
              className={`twitch-message twitch-${decision.action}`}
            >
              <span className="twitch-action">
                {index + 1}. {decision.action} · {decision.reason}
              </span>
              {decision.action === "hide" ? (
                <p>Message hidden · {decision.reason}</p>
              ) : decision.action === "blur" ? (
                <p>
                  <strong>{row.message.user}</strong>: ░░░░░░ spoiler
                </p>
              ) : (
                <p>
                  <strong>{row.message.user}</strong>: {row.message.text}
                </p>
              )}
              <details>
                <summary>
                  Inspect message {index + 1} and synthetic answers
                </summary>
                <p>
                  <strong>{row.message.user}</strong>: {row.message.text}
                </p>
                <p>
                  Toxic Noul: {row.classification.toxic.toFixed(4)} · Spoiler
                  Noul: {row.classification.spoiler.toFixed(4)}
                </p>
                <p>
                  Category: {row.classification.category} · API Choice
                  confidence: {row.classification.confidence.toFixed(2)} (unused
                  by policy)
                </p>
                <p>
                  Category probabilities (separate from confidence):{" "}
                  {Object.entries(row.classification.probabilities)
                    .map(([label, value]) => `${label} ${value.toFixed(2)}`)
                    .join(" · ")}
                </p>
                <p>
                  Normal: {row.normal.action} ({row.normal.reason}) · Quiet:{" "}
                  {row.quiet.action} ({row.quiet.reason})
                </p>
              </details>
            </li>
          );
        })}
      </ol>
      <p className="sample-note">
        Hidden and spoiler text is omitted from the chat preview; the explicit
        inspection disclosure reveals it for debugging. Open Jev DevTools →
        Flows, select a message and View Flow to inspect its request and policy
        path. No cache replay, token usage or model latency is claimed.
      </p>
    </section>
  );
}
