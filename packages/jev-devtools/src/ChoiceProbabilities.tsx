import { useMemo, useState, type ReactNode } from "react";
import type { AnswerView } from "./protocol.js";

export function ChoiceProbabilities({
  answer,
  captureNotice,
}: {
  answer: AnswerView;
  captureNotice?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () =>
      Object.entries(answer.probabilities ?? {}).sort((a, b) => b[1] - a[1]),
    [answer.probabilities],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows.filter(([label]) => label.toLocaleLowerCase().includes(query));
  }, [rows, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.min(page, pages - 1);
  return (
    <div
      className="lab-choice-browser"
      role="region"
      aria-label="All Choice probabilities"
      data-diagram-scroll=""
    >
      <div className="lab-choice-controls">
        <label>
          Search categories
          <input
            autoFocus
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <span role="status">
          {filtered.length} of {rows.length} categories · highest probability
          first
        </span>
      </div>
      <div
        className="lab-choice-table-scroll"
        tabIndex={0}
        aria-label="Probability table"
      >
        <table>
          <caption>
            {captureNotice}
            Captured probabilities. Values are not renormalized. Returned
            choice: {answer.choice ?? "unavailable"}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Probability</th>
              <th scope="col">Exact value (0–1)</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice(current * 20, (current + 1) * 20)
              .map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">
                    {label}
                    {label === answer.choice && (
                      <span className="lab-choice-returned">
                        Returned choice
                      </span>
                    )}
                  </th>
                  <td>{Number((value * 100).toPrecision(6))}%</td>
                  <td>
                    <code>{String(value)}</code>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!filtered.length && <p>No matching categories.</p>}
      </div>
      <div className="lab-choice-pagination">
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>
          Previous categories
        </button>
        <span aria-live="polite">
          Page {current + 1} of {pages}
        </span>
        <button
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          Next categories
        </button>
      </div>
    </div>
  );
}
