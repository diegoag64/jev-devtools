import type {
  StructureResult,
  RenderGroup,
} from "../../../cookbooks/structure-recovery/flow.js";
function PreviewGroup({
  group,
  data,
}: {
  group: RenderGroup;
  data: StructureResult;
}) {
  const items = group.blocks.map((i) => data.blocks[i]),
    block = items[0];
  if (group.kind === "list_item") {
    const List = group.ordered ? "ol" : "ul";
    return (
      <List>
        {items.map((b, i) => (
          <li key={i}>{b.text}</li>
        ))}
      </List>
    );
  }
  if (group.kind === "code")
    return (
      <pre>
        <code>{items.map((b) => b.text).join("\n")}</code>
      </pre>
    );
  if (group.kind === "heading") {
    const Heading =
      block.hlevel === "title"
        ? "h2"
        : block.hlevel === "section"
          ? "h3"
          : "h4";
    return <Heading>{block.text}</Heading>;
  }
  if (group.kind === "quote") return <blockquote>{block.text}</blockquote>;
  if (group.kind === "callout")
    return (
      <aside className="structure-callout">
        <strong>{block.callout}</strong>
        <p>{block.text}</p>
      </aside>
    );
  return <p>{block.text}</p>;
}
export function StructureCookbookResult({
  result,
}: {
  result: { value?: unknown };
}) {
  const data = result.value as StructureResult;
  const requests =
    Number(data.stitchQuestions > 0) + Number(data.classifyQuestions > 0);
  return (
    <section
      className="cookbook-result structure-result"
      aria-label="Structure recovery result"
    >
      <span className="cookbook-eyebrow">
        Synthetic judgments · deterministic formatting
      </span>
      <h2>
        {data.blocks.length
          ? "From broken lines to a structured document"
          : "Empty document · no requests needed"}
      </h2>
      <p>
        {data.lines.length} lines → {data.blocks.length} blocks ·{" "}
        {data.lines.length - data.blocks.length} line breaks joined · {requests}{" "}
        Jev request{requests === 1 ? "" : "s"} ({data.stitchQuestions} stitch +{" "}
        {data.classifyQuestions} classification questions).
      </p>
      <div className="structure-comparison">
        <div>
          <h3>Original plain text</h3>
          <pre className="structure-source">
            {data.original.trim() ? data.original : "(empty)"}
          </pre>
        </div>
        <div>
          <h3>Recovered preview</h3>
          <div className="structure-preview">
            {data.groups.map((group, i) => (
              <PreviewGroup key={i} group={group} data={data} />
            ))}
            {!data.groups.length && <p>Nothing to format.</p>}
          </div>
        </div>
      </div>
      <details className="rag-passage">
        <summary>Markdown source</summary>
        <pre className="structure-source">{data.markdown || "(empty)"}</pre>
      </details>
      <p>
        Open Jev DevTools → Flows to follow requests, bypasses and the
        merge/render functions. All questions and companion answers remain
        available in the inspector.
      </p>
      <details className="rag-passage">
        <summary>Line joins · probabilities and thresholds</summary>
        <div className="structure-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Text</th>
                <th>P(join)</th>
                <th>Threshold</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.joins.map((join) => (
                <tr key={join.line}>
                  <td>L{String(join.line).padStart(3, "0")}</td>
                  <td>{data.lines[join.line].text}</td>
                  <td>
                    {join.probability === null
                      ? "Not asked"
                      : `${(join.probability * 100).toFixed(1)}%`}
                  </td>
                  <td>
                    {join.probability === null
                      ? "—"
                      : `≥${join.threshold * 100}%`}
                  </td>
                  <td>{join.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <h3>Recovered blocks</h3>
      {data.blocks.map((block, i) => (
        <details key={i} className="rag-passage">
          <summary>
            B{String(i).padStart(3, "0")} · {block.type.replace("_", " ")} ·{" "}
            {Math.round(block.confidence * 100)}% API confidence
          </summary>
          <p>{block.text}</p>
          <p>
            Source lines:{" "}
            {block.lines
              .map((n) => `L${String(n).padStart(3, "0")}`)
              .join(", ")}
          </p>
          <p>
            {block.type === "heading"
              ? `Heading level: ${block.hlevel}`
              : block.type === "list_item"
                ? `Step probability: ${block.step * 100}%`
                : block.type === "callout"
                  ? `Callout kind: ${block.callout}`
                  : "Companion answers do not affect this block's formatting."}
          </p>
          <dl>
            {Object.entries(block.probabilities).map(([label, p]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{(p * 100).toFixed(1)}%</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
      {data.groups
        .filter((g) => g.kind === "list_item")
        .map((group, i) => (
          <p key={i}>
            List {i + 1}: mean step probability{" "}
            {(group.meanStep! * 100).toFixed(1)}% →{" "}
            {group.ordered ? "numbered" : "bulleted"} (threshold ≥50%).
            Individual items are not numbered independently.
          </p>
        ))}
      <p className="sample-note">
        Authored documents and synthetic responses, not the official memo's
        measured results. The code normalizes whitespace and adds Markdown
        markers; Jev does not rewrite the text.
      </p>
    </section>
  );
}
