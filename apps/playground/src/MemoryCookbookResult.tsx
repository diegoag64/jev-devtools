import type {
  MemoryResult,
  RouteAnswer,
} from "../../../cookbooks/simple-memory/flow.js";
const teamName = (value: string) => value.replaceAll("_", " ");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
function Probabilities({
  answer,
  label,
}: {
  answer: RouteAnswer;
  label: string;
}) {
  return (
    <details className="memory-probabilities">
      <summary>{label} · all team probabilities</summary>
      <p>
        Returned team: {teamName(answer.choice)} · API confidence{" "}
        {percent(answer.confidence)}
      </p>
      <dl>
        {Object.entries(answer.probabilities).map(([name, p]) => (
          <div key={name}>
            <dt>{teamName(name)}</dt>
            <dd>{percent(p)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
export function MemoryCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as MemoryResult;
  const comparisons = data.history.filter((t) => t.plain);
  const customers = [
    ...new Map(
      data.history.map((t) => [t.state.customer.id, t.state.customer]),
    ).values(),
  ];
  const saved = Object.values(data.memories).flat().length;
  return (
    <section
      className="cookbook-result memory-result"
      aria-label="Simple memory result"
    >
      <span className="cookbook-eyebrow">
        Synthetic responses · explicit application memory
      </span>
      <h2>What changed with memory?</h2>
      <p>
        {data.history.length} tickets · {data.requests} Jev requests · {saved}{" "}
        saved {saved === 1 ? "memory" : "memories"}
      </p>
      <p>
        These are authored examples of the policy, not an accuracy benchmark.
        Each run begins empty; saved facts are supplied as request context, not
        learned by the model.
      </p>
      <div className="memory-comparisons">
        {comparisons.map((t) => (
          <article className="memory-comparison" key={t.state.ticket.id}>
            <span className="cookbook-eyebrow">
              {t.state.customer.company} · {t.state.ticket.id}
            </span>
            <h3>{t.state.ticket.subject}</h3>
            <dl>
              <div>
                <dt>Without memory</dt>
                <dd>{teamName(t.plain!.choice)}</dd>
              </div>
              <div>
                <dt>With memory</dt>
                <dd>
                  <strong>{teamName(t.routed.choice)}</strong>
                </dd>
              </div>
            </dl>
            <p className="sample-note">
              {t.plain!.choice === t.routed.choice
                ? "Same returned team"
                : "Different returned team"}{" "}
              · {t.before.length}{" "}
              {t.before.length === 1 ? "memory" : "memories"} supplied
            </p>
          </article>
        ))}
      </div>
      <h3>Customer memory after this run</h3>
      {customers.map((customer) => (
        <details key={customer.id} className="rag-passage" open>
          <summary>
            {customer.company} · {customer.id} ·{" "}
            {(data.memories[customer.id] ?? []).length} saved
          </summary>
          {(data.memories[customer.id] ?? []).map((memory) => (
            <article className="memory-saved" key={memory.request.ticket.id}>
              <h4>
                {memory.request.ticket.id} · {memory.request.ticket.subject}
              </h4>
              {memory.request.ticket.messages.map((m, i) => (
                <p key={i}>{m.text}</p>
              ))}
              <dl>
                {Object.entries(memory.jev_answered).map(
                  ([question, answer]) => (
                    <div key={question}>
                      <dt>{question}</dt>
                      <dd>{answer}</dd>
                    </div>
                  ),
                )}
              </dl>
            </article>
          ))}
          {!data.memories[customer.id]?.length && (
            <p>No lasting facts saved.</p>
          )}
        </details>
      ))}
      <h3>Ticket timeline</h3>
      <p>
        Expand a ticket for its original text, memory before/after and all
        returned probabilities. In Jev DevTools → Flows, open the matching loop
        iteration to follow both requests and the save decision.
      </p>
      {data.history.map((t, index) => (
        <details className="rag-passage" key={t.state.ticket.id}>
          <summary>
            {index + 1}. {t.state.customer.company} · {t.state.ticket.subject} ·{" "}
            {t.saved ? "Saved" : "Not saved"}
          </summary>
          <p>
            {t.state.ticket.id} · {t.state.ticket.received_on}
          </p>
          {t.state.ticket.messages.map((m, i) => (
            <p key={i}>{m.text}</p>
          ))}
          <p>
            Returned team: <strong>{teamName(t.routed.choice)}</strong>
          </p>
          <p>
            P(remember) {percent(t.remember)} · save when ≥50% ·{" "}
            {t.saved
              ? "Appended original ticket + readable routing answer"
              : "Routing answer returned; memory unchanged"}
          </p>
          <dl>
            <div>
              <dt>Memory supplied</dt>
              <dd>{t.before.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt>Memory after</dt>
              <dd>{t.after.join(", ") || "None"}</dd>
            </div>
          </dl>
          {t.plain && <Probabilities answer={t.plain} label="Without memory" />}
          <Probabilities answer={t.routed} label="With available memory" />
        </details>
      ))}
    </section>
  );
}
