import type { FunctionResult } from "../../../cookbooks/function-calling/dispatcher.js";
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
export function FunctionCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as FunctionResult;
  return (
    <section className="cookbook-result" aria-label="Function calling result">
      <span className="cookbook-eyebrow">
        Synthetic responses · proposed call only
      </span>
      <h2>{data.name}</h2>
      <pre className="structure-source">{data.proposal}</pre>
      <p>
        No tool was executed. This proposal does not load market data, draw a
        trading chart or place an order.
      </p>
      <div className="cookbook-metrics">
        <div>
          <span>Call confidence</span>
          <strong>{percent(data.confidence)}</strong>
        </div>
        <div>
          <span>Selected tool probability</span>
          <strong>{percent(data.tool.probability)}</strong>
        </div>
        <div>
          <span>Tool API confidence</span>
          <strong>{percent(data.tool.apiConfidence!)}</strong>
        </div>
      </div>
      <p>
        Call confidence is the minimum relevant decision mass, not the SDK
        Choice confidence. Each argument probability below is the product of its
        own decisions. Weakest argument by product:{" "}
        <strong>{data.weakest ?? "none"}</strong>. No confidence threshold
        blocks a proposal.
      </p>
      <details className="rag-passage" open>
        <summary>
          Omitted defaults · would apply if the call were executed
        </summary>
        <pre className="structure-source">
          {JSON.stringify(data.defaults, null, 2)}
        </pre>
        <p>
          Defaults are separate from explicit kwargs. Numeric parameters such as
          top_movers.limit are never asked.
        </p>
      </details>
      <h3>Selected tool arguments</h3>
      {!data.arguments.length && (
        <p>
          This tool takes no arguments. Its route probability alone determines
          call confidence.
        </p>
      )}
      {data.arguments.map((arg) => (
        <details className="rag-passage" key={arg.name}>
          <summary>
            {arg.name} ·{" "}
            {arg.omitted
              ? "omitted, default stands"
              : JSON.stringify(arg.value)}{" "}
            · argument probability {percent(arg.probability)}
          </summary>
          <p>
            {arg.omitted
              ? "The value answer was not read. Only the absence decision contributes."
              : "Presence (when asked) and value decisions contribute separately to the call minimum."}
          </p>
          {arg.apiConfidence !== null && (
            <p>
              Value Choice API confidence: {percent(arg.apiConfidence)} (not
              used in dispatcher arithmetic).
            </p>
          )}
          <h4>Decision mass on the outcome taken</h4>
          <dl>
            {Object.entries(arg.decisions).map(([key, p]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{percent(p)}</dd>
              </div>
            ))}
          </dl>
          {!arg.omitted && (
            <>
              <h4>Value distribution / member Nouls</h4>
              <dl>
                {Object.entries(arg.distribution).map(([key, p]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{percent(p)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </details>
      ))}
      <details className="rag-passage">
        <summary>Tool distribution</summary>
        <dl>
          {Object.entries(data.tool.distribution).map(([key, p]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{percent(p)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <p>
        Open Jev DevTools → Flows and select the request to inspect all 54
        answers, including unselected tools. Open the argument collection to
        inspect each omit/fill path. Set members and flags include at ≥0.5;
        optional arguments omit below 0.5.
      </p>
      <p className="sample-note">
        These authored fixtures demonstrate dispatcher semantics, not measured
        model quality or official cached results. The TypeScript adaptation
        returns proposed calls only; flow.output() does not invoke them.
      </p>
    </section>
  );
}
