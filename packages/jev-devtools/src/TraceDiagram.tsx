import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDiagramViewport } from "./useDiagramViewport.js";
import type { AnswerView, Trace } from "./protocol.js";
import { findImage, flowAnswer } from "./flow-model.js";
import { DiagramContent } from "./DiagramContent.js";
import { ChoiceProbabilities } from "./ChoiceProbabilities.js";
const pct = (v: number) => `${Math.round(v * 100)}%`;
function Result({
  answer,
  image,
  probabilities,
}: {
  answer?: AnswerView;
  image?: string;
  probabilities?: [string, number][];
}) {
  if (!answer) return <p className="lab-copy">No answer received.</p>;
  return (
    <>
      {answer.probabilities &&
        (probabilities ?? Object.entries(answer.probabilities)).map(
          ([key, value]) => (
            <div className="lab-probability" key={key}>
              <div>
                <span
                  title={
                    typeof answer.legend?.[key] === "string"
                      ? (answer.legend[key] as string)
                      : key
                  }
                >
                  {answer.type === "score" && answer.legend?.[key]
                    ? `${key} · ${answer.legend[key]}`
                    : key}
                </span>
                <code title={`Exact probability: ${value}`}>
                  {Number((value * 100).toPrecision(6))}%
                </code>
              </div>
              <div className="lab-track">
                <i
                  className={
                    answer.type === "choice" && answer.choice !== key
                      ? "lab-alternative"
                      : ""
                  }
                  style={{ width: pct(Math.max(0, Math.min(1, value))) }}
                />
              </div>
            </div>
          ),
        )}
      {answer.choice !== undefined && (
        <p className="lab-result" title={`Selected: ${answer.choice}`}>
          Selected: {answer.choice}
        </p>
      )}
      {answer.score !== undefined && (
        <>
          <p className="lab-result">Score {answer.score.toFixed(2)}</p>
          <div className="lab-scale">
            <span
              style={{
                left: pct(
                  Math.max(
                    0,
                    Math.min(
                      1,
                      answer.score /
                        Math.max(
                          1,
                          Object.keys(answer.probabilities ?? {}).length - 1,
                        ),
                    ),
                  ),
                ),
              }}
            />
            {Object.keys(answer.probabilities ?? {}).map((k) => (
              <small key={k}>{k}</small>
            ))}
          </div>
        </>
      )}
      {answer.noul !== undefined && (
        <>
          <strong className="lab-big">{pct(answer.noul)}</strong>
          <p className="lab-small">probability of true</p>
          <div className="lab-track">
            <i style={{ width: pct(answer.noul) }} />
          </div>
          <div className="lab-endpoints">
            <span>False</span>
            <span>True</span>
          </div>
        </>
      )}
      {answer.box && (
        <>
          <div className="lab-image">
            {image ? (
              <img src={image} alt="Captured image with returned Box overlay" />
            ) : (
              <p>Image preview unavailable</p>
            )}
            {image && (
              <div
                className="lab-box"
                style={{
                  left: pct(answer.box.left),
                  top: pct(answer.box.top),
                  width: pct(answer.box.right - answer.box.left),
                  height: pct(answer.box.bottom - answer.box.top),
                }}
              />
            )}
          </div>
          <p className="lab-small lab-coordinates">
            left {answer.box.left.toFixed(2)} · top {answer.box.top.toFixed(2)}
            <br />
            right {answer.box.right.toFixed(2)} · bottom{" "}
            {answer.box.bottom.toFixed(2)}
          </p>
        </>
      )}
      {answer.confidence !== undefined && (
        <p className="lab-small">Confidence {pct(answer.confidence)}</p>
      )}
    </>
  );
}
export function TraceDiagram({
  trace,
  embedded = false,
  onHeightChange,
}: {
  trace: Trace;
  /** Render in a parent diagram's coordinates, without a nested camera. */
  embedded?: boolean;
  onHeightChange?: (height: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!embedded || !root.current || !onHeightChange) return;
    const element = root.current;
    const observer = new ResizeObserver(() => {
      // Closed drawers and skipped offscreen content cannot replace retained bounds.
      if (element.offsetHeight > 0) onHeightChange(element.offsetHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [embedded, onHeightChange]);
  const [selected, setSelected] = useState(""),
    [flow, setFlow] = useState(true),
    [extraCategories, setExtraCategories] = useState<Record<string, number>>(
      {},
    ),
    [entering, setEntering] = useState<{
      question: string;
      from: number;
      to: number;
    } | null>(null),
    [probabilityView, setProbabilityView] = useState<string | null>(null);
  const entries = Object.entries(trace.request.questions ?? {}).filter(
      ([, q]) => q && typeof q === "object" && typeof q.type === "string",
    ),
    [key, question] = entries.find(([key]) => key === selected) ??
      entries[0] ?? ["", undefined];
  const answer = trace.result?.answers[key],
    image =
      findImage(trace.request.state) ||
      (trace.request.assets ? findImage(trace.request.assets) : undefined),
    allProbabilities = useMemo(
      () =>
        Object.entries(answer?.probabilities ?? {}).sort((a, b) => b[1] - a[1]),
      [answer?.probabilities],
    );
  const compact = answer?.type === "choice" && allProbabilities.length > 6;
  const shownProbabilities = compact
    ? allProbabilities.slice(0, 3)
    : allProbabilities;
  if (
    compact &&
    answer.choice !== undefined &&
    !shownProbabilities.some(([label]) => label === answer.choice)
  ) {
    const returned = allProbabilities.find(
      ([label]) => label === answer.choice,
    );
    if (returned) shownProbabilities.push(returned);
  }
  if (compact && (extraCategories[key] ?? 0) > 0) {
    const initialLabels = new Set(shownProbabilities.map(([label]) => label));
    shownProbabilities.push(
      ...allProbabilities
        .filter(([label]) => !initialLabels.has(label))
        .slice(0, extraCategories[key] ?? 0),
    );
  }
  const outputs = flowAnswer(
    compact
      ? { ...answer, probabilities: Object.fromEntries(shownProbabilities) }
      : answer,
  );
  const remaining = compact
    ? allProbabilities.length - shownProbabilities.length
    : 0;
  const spacing = compact ? 112 : 136;
  const showProbabilities =
    probabilityView === key && answer?.type === "choice";
  const resultHeight = Math.max(
    280,
    (compact ? 230 : 166) +
      (compact
        ? shownProbabilities.length
        : Object.keys(answer?.probabilities ?? {}).length) *
        44 +
      (answer?.score !== undefined ? 50 : 0),
    answer?.box ? 390 : 0,
  );
  const height = Math.max(
      520,
      resultHeight + 90,
      (outputs.length + (remaining ? 1 : 0)) * spacing + 60,
    ),
    ry = compact ? 40 : Math.max(40, (height - resultHeight) / 2),
    mid = ry + resultHeight / 2;
  const { viewport, canvas, zoom, zoomBy, fit, preserveCamera } =
    useDiagramViewport(1120, height, key);
  if (!question)
    return <p className="muted">No questions available in this capture.</p>;
  const sourcePath = (y: number) => `M260 ${y} C325 ${y},325 ${mid},390 ${mid}`;
  const enteringDelay = (index: number) =>
    entering?.question === key && index >= entering.from && index < entering.to
      ? `${(index - entering.from) * 55}ms`
      : undefined;
  const paths = [
    { id: "state", d: sourcePath(122), active: true },
    { id: "question", d: sourcePath(378), active: true },
    ...outputs.map((output, i) => ({
      id: `output-${key}-${output.label}`,
      delay: enteringDelay(i),
      d: `M710 ${mid} C790 ${mid},790 ${92 + i * spacing},870 ${92 + i * spacing}`,
      active: output.active,
    })),
  ];
  return (
    <div
      ref={root}
      className={`lab-flow ${compact ? "lab-flow-compact" : ""} ${embedded ? "lab-flow-embedded" : ""}`}
    >
      <div className="lab-flow-toolbar">
        <label>
          Question
          <select
            aria-label="Diagram question"
            value={key}
            onChange={(event) => {
              setEntering(null);
              setSelected(event.target.value);
            }}
          >
            {entries.map(([name, q]) => (
              <option key={name} value={name}>
                {name} · {q.type}
              </option>
            ))}
          </select>
        </label>
        <div>
          {answer?.type === "choice" && (
            <button
              aria-pressed={showProbabilities}
              onClick={() => {
                setEntering(null);
                setProbabilityView(showProbabilities ? null : key);
              }}
            >
              {showProbabilities
                ? "Back to overview"
                : `All probabilities (${allProbabilities.length})`}
            </button>
          )}
          {!showProbabilities && (
            <>
              {compact && (
                <button
                  disabled={(extraCategories[key] ?? 0) === 0}
                  onClick={() => {
                    preserveCamera();
                    setEntering(null);
                    setExtraCategories((counts) => ({ ...counts, [key]: 0 }));
                  }}
                >
                  Show fewer
                </button>
              )}
              {!embedded && (
                <>
                  <button
                    aria-label="Zoom diagram out"
                    disabled={zoom <= 10}
                    onClick={() => zoomBy(1 / 1.2)}
                  >
                    −
                  </button>
                  <output aria-label="Diagram zoom">{zoom}%</output>
                  <button
                    aria-label="Zoom diagram in"
                    disabled={zoom >= 400}
                    onClick={() => zoomBy(1.2)}
                  >
                    +
                  </button>
                  <button onClick={fit}>Fit</button>
                </>
              )}
              <button aria-pressed={flow} onClick={() => setFlow(!flow)}>
                {flow ? "Pause flow" : "Play flow"}
              </button>
            </>
          )}
        </div>
      </div>
      {showProbabilities && answer && (
        <ChoiceProbabilities key={key} answer={answer} />
      )}
      <div
        hidden={showProbabilities}
        className={embedded ? "lab-flow-surface" : "lab-flow-viewport"}
        ref={embedded ? undefined : viewport}
        style={embedded ? { height } : undefined}
        tabIndex={embedded ? undefined : 0}
        role="group"
        aria-label={
          embedded
            ? "Jev request diagram"
            : "Jev diagram. Drag to pan, scroll or pinch to zoom. Arrow keys pan, plus and minus zoom, zero fits."
        }
      >
        <div
          ref={embedded ? undefined : canvas}
          className="lab-flow-canvas"
          style={{ width: 1120, height }}
        >
          <svg
            className="lab-connections"
            width="1120"
            height={height}
            aria-hidden="true"
          >
            {paths.map((path) => (
              <g key={path.id}>
                <path
                  d={path.d}
                  pathLength={1}
                  className={`${path.active ? "active" : ""} ${"delay" in path && path.delay !== undefined ? "lab-branch-enter" : ""}`}
                  style={{
                    animationDelay: "delay" in path ? path.delay : undefined,
                  }}
                />
                {flow &&
                  !showProbabilities &&
                  path.active &&
                  !["error", "cancelled"].includes(trace.status) && (
                    <circle r="3" className="lab-flow-dot">
                      <animateMotion
                        dur="3.2s"
                        repeatCount="indefinite"
                        path={path.d}
                      />
                    </circle>
                  )}
              </g>
            ))}
            <text x="305" y={mid - 65}>
              state
            </text>
            <text x="300" y={mid + 65}>
              question
            </text>
          </svg>
          <article
            className="lab-card lab-content-card"
            style={{ left: 20, top: 32, width: 240, height: 180 }}
          >
            <span className="lab-eyebrow">
              {image ? "IMAGE STATE" : "STATE"}
            </span>
            <h3>Shared context</h3>
            {image ? (
              <img
                className="lab-source-image"
                src={image}
                alt="Captured image state"
              />
            ) : (
              <DiagramContent
                key={trace.id}
                value={trace.request.state}
                label="State properties"
              />
            )}
          </article>
          <article
            className="lab-card lab-content-card"
            style={{ left: 20, top: 288, width: 240, height: 180 }}
          >
            <span className="lab-eyebrow">INSTRUCTIONS</span>
            <h3>Question · {question.type}</h3>
            <DiagramContent
              key={`${trace.id}:${key}`}
              value={question.instructions}
              label="Question instructions"
            />
          </article>
          <article
            className="lab-card lab-answer-card"
            style={{
              left: 390,
              top: ry,
              width: 320,
              minHeight: resultHeight,
            }}
          >
            <span className="lab-eyebrow">
              JEV · {question.type.toUpperCase()}
            </span>
            <h3 title={key}>{key}</h3>
            {compact && (
              <p className="lab-small">
                Showing {shownProbabilities.length} of {allProbabilities.length}{" "}
                probabilities
              </p>
            )}
            <Result
              answer={answer}
              image={image}
              probabilities={compact ? shownProbabilities : undefined}
            />
          </article>
          {outputs.map((output, i) => (
            <article
              key={`${key}-${output.label}`}
              className={`lab-card lab-output ${"probability" in output ? "lab-noul-output" : ""} ${output.active ? "" : "lab-idle"} ${enteringDelay(i) !== undefined ? "lab-card-enter" : ""}`}
              onAnimationEnd={() => {
                if (entering?.question === key && i === entering.to - 1)
                  setEntering(null);
              }}
              style={{
                left: 870,
                top: 40 + i * spacing,
                width: 230,
                minHeight: compact ? 96 : 104,
                animationDelay: enteringDelay(i),
                ...("probability" in output &&
                Number.isFinite(output.probability)
                  ? {
                      "--lab-noul-probability": Math.max(
                        0,
                        Math.min(1, output.probability),
                      ),
                    }
                  : {}),
              }}
            >
              <span className="lab-eyebrow">{output.eyebrow}</span>
              <h3 title={output.label}>{output.label}</h3>
              <p>{output.detail}</p>
            </article>
          ))}
          {remaining > 0 && (
            <article
              className="lab-card lab-choice-remainder"
              style={{
                left: 870,
                top: 40 + outputs.length * spacing,
                width: 230,
                minHeight: 96,
              }}
            >
              <span className="lab-eyebrow">MORE CATEGORIES</span>
              <button
                onClick={() => {
                  preserveCamera();
                  setEntering({
                    question: key,
                    from: outputs.length,
                    to: outputs.length + Math.min(3, remaining),
                  });
                  setExtraCategories((counts) => ({
                    ...counts,
                    [key]: (counts[key] ?? 0) + 3,
                  }));
                }}
              >
                Show More
              </button>
              <p className="lab-small">
                {remaining} remaining · Add {Math.min(3, remaining)}
              </p>
            </article>
          )}
        </div>
      </div>
      {!showProbabilities && !embedded && (
        <p className="muted lab-flow-caption">
          <span className="lab-gesture-hint">
            Drag to pan · Scroll or pinch to zoom · 0 to fit
          </span>
          {entries.length} parallel question{entries.length === 1 ? "" : "s"} in
          one request. Connections show data flow, not model timing. Application
          routes and thresholds are not captured. Full inputs and criteria are
          in Questions and Context.
        </p>
      )}
    </div>
  );
}
