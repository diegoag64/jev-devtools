import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FlowDefinition,
  FlowNode,
  FlowRun,
  FlowStep,
} from "./flow-protocol.js";
import type { Trace, Json } from "./protocol.js";
import { useDiagramViewport } from "./useDiagramViewport.js";
import { RequestDetail } from "./JevDevtools.js";
import { JsonBlock } from "./TraceContent.js";
import {
  conditionInputs,
  conditionRequirement,
  type ConditionInput,
} from "./condition-inputs.js";
import { formatFlowCondition } from "./flow-condition.js";
import { TraceDiagram } from "./TraceDiagram.js";
import { FlowDetailsPanel } from "./FlowDetailsPanel.js";
import { DiagramContent } from "./DiagramContent.js";
type Lane = { name: string; status: string };
type Bounds = { x: number; y: number; width: number; height: number };
const RequestNode = memo(function RequestNode({
  node,
  trace,
  status,
  selected,
  x,
  y,
  onSelect,
  onResize,
}: {
  node: FlowNode;
  trace: Trace;
  status: string;
  selected: boolean;
  x: number;
  y: number;
  onSelect: (id: string) => void;
  onResize: (id: string, height: number) => void;
}) {
  const headingHeight = node.description ? 104 : 64;
  const measure = useCallback(
    (height: number) => onResize(node.id, height + headingHeight),
    [node.id, onResize, headingHeight],
  );
  return (
    <article
      className={`flow-step flow-request ${selected ? "selected" : ""}`}
      data-status={status}
      aria-label={`Request ${node.id}`}
      style={{ left: x, top: y, width: 1120 }}
    >
      <button
        className="flow-request-heading"
        style={{ height: headingHeight }}
        aria-label={`Step ${node.id}, jev, ${status}`}
        aria-pressed={selected}
        onClick={() => onSelect(node.id)}
      >
        <span>
          <span className="eyebrow">Jev request</span>
          <strong>{node.title ?? node.id}</strong>
          {node.description && (
            <span className="flow-request-description">{node.description}</span>
          )}
        </span>
        <span>
          {status}
          {trace.durationMs !== undefined
            ? ` · ${Math.round(trace.durationMs)} ms`
            : ""}
        </span>
      </button>
      <TraceDiagram trace={trace} embedded onHeightChange={measure} />
    </article>
  );
});
function joinTitle(count: number) {
  return count === 2 ? "Wait for both checks" : `Wait for all ${count} paths`;
}
const Card = memo(function Card({
  node,
  status,
  decision,
  selected,
  bounds,
  onSelect,
  lanes,
  inputs,
  data,
  durationMs,
}: {
  node: FlowNode;
  status: string;
  decision?: boolean;
  selected: boolean;
  bounds: Bounds;
  onSelect: (id: string) => void;
  lanes: Lane[];
  inputs?: ConditionInput[];
  data?: FlowStep["data"];
  durationMs?: number;
}) {
  const join = node.kind === "parallel";
  const finished = lanes.filter((lane) => lane.status === "completed").length;
  const route = [...node.path]
    .reverse()
    .find((part) => part.endsWith(":then") || part.endsWith(":else"));
  const stateLabel =
    status === "untaken"
      ? "Not taken"
      : node.kind === "output" && status === "completed"
        ? "Returned outcome"
        : status;

  return (
    <button
      className={`flow-step ${node.kind === "task" ? "flow-task" : ""} ${selected ? "selected" : ""}`}
      data-status={status}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
      aria-label={`Step ${node.id}, ${node.kind}, ${status}`}
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
    >
      <span className="flow-card-heading">
        <span className="flow-kind-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            {join ? (
              <path d="M4 5h4l5 7h7M4 19h4l5-7m4-3 3 3-3 3" />
            ) : node.kind === "task" ? (
              <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />
            ) : node.kind === "output" ? (
              <>
                <rect x="4" y="4" width="16" height="16" rx="4" />
                <path d="m8 12 3 3 5-6" />
              </>
            ) : (
              <path d="m12 3 9 9-9 9-9-9zM8 12h8" />
            )}
          </svg>
        </span>
        <span className="eyebrow">
          {join
            ? "Parallel checks"
            : node.kind === "branch"
              ? "Condition"
              : node.kind === "task"
                ? "Function"
                : node.kind}
        </span>
        {node.kind === "output" && (
          <span className="flow-status">{stateLabel}</span>
        )}
      </span>
      <strong>
        {node.title ?? (join ? joinTitle(lanes.length) : node.id)}
      </strong>
      {node.description && (
        <span className="flow-step-description">{node.description}</span>
      )}
      {node.kind === "task" && (
        <span className="flow-task-preview">
          <span className="flow-condition-label">Returned value</span>
          <code>
            {data &&
            typeof data === "object" &&
            !Array.isArray(data) &&
            Object.hasOwn(data, "output")
              ? JSON.stringify(data.output, null, 2).slice(0, 280)
              : status === "running"
                ? "Running application code…"
                : "No output captured"}
          </code>
          <small>
            {durationMs === undefined
              ? "Select to inspect inputs and output"
              : `${Math.round(durationMs)} ms · select to inspect`}
          </small>
        </span>
      )}
      {node.kind === "branch" &&
        (node.conditionRule !== undefined || node.condition) && (
          <span className="flow-condition-rule">
            {inputs && inputs.length > 0 && (
              <span className="flow-condition-incoming">
                <span className="flow-condition-label">
                  {inputs.length === 1 ? "Incoming value" : "Incoming values"}
                </span>
                {inputs.slice(0, 3).map((input) => (
                  <span className="flow-condition-input" key={input.reference}>
                    <span>{input.name}</span>
                    <b>{input.value}</b>
                  </span>
                ))}
                {inputs.length > 3 && (
                  <small>
                    {inputs.length - 3} more inputs · select to inspect
                  </small>
                )}
              </span>
            )}
            <span className="flow-condition-label">Requirement</span>
            <code>
              {node.conditionRule !== undefined
                ? conditionRequirement(node.conditionRule, inputs ?? [])
                : node.condition}
            </code>
          </span>
        )}
      {join && (
        <>
          <span className="flow-join-summary">
            {joinTitle(lanes.length)}{" "}
            <span>
              {finished}/{lanes.length}
            </span>
          </span>
          <span className="flow-lanes">
            {lanes.slice(0, 4).map((lane) => (
              <span
                className="flow-lane"
                key={lane.name}
                data-status={lane.status}
              >
                <span>
                  <span aria-hidden="true">
                    {lane.status === "completed"
                      ? "✓"
                      : lane.status === "error"
                        ? "!"
                        : "○"}
                  </span>{" "}
                  {lane.name}
                </span>
                <small>{lane.status}</small>
              </span>
            ))}
            {lanes.length > 4 && (
              <small>{lanes.length - 4} more · select to see all checks</small>
            )}
          </span>
        </>
      )}
      <span className="flow-card-footer">
        <code>{node.id}</code>
        <small>
          {join
            ? status === "completed"
              ? "All finished · continue"
              : stateLabel
            : node.kind === "output"
              ? route?.endsWith(":then")
                ? "Then route"
                : route?.endsWith(":else")
                  ? "Else route"
                  : "Final outcome"
              : decision !== undefined
                ? decision
                  ? "Condition met · then"
                  : "Condition not met · else"
                : stateLabel}
        </small>
      </span>
      {node.kind === "jev" && (
        <small>
          {status === "untaken"
            ? "This request was not run."
            : "Request details are not captured yet or no longer retained."}
        </small>
      )}
    </button>
  );
});
export const FlowOverview = memo(function FlowOverview({
  definition,
  run,
  traces,
}: {
  definition: FlowDefinition;
  run: FlowRun;
  traces: Trace[];
}) {
  const [selected, setSelected] = useState(
    () => definition.nodes.find((n) => n.kind === "jev")?.id ?? "",
  );
  const [details, setDetails] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const tracesById = useMemo(
    () => new Map(traces.map((trace) => [trace.id, trace])),
    [traces],
  );
  const inputsByStep = useMemo(
    () =>
      new Map(
        definition.nodes
          .filter((node) => node.conditionRule !== undefined)
          .map((node) => [
            node.id,
            conditionInputs(
              node.conditionRule!,
              run,
              tracesById,
              new Map(definition.nodes.map((n) => [n.id, n.title ?? n.id])),
            ),
          ]),
      ),
    [definition, run, tracesById],
  );
  // Omit redundant transitive edges so a reference does not draw through an
  // intervening condition. Execution ordering still includes every dependency.
  const links = useMemo(() => {
    const byId = new Map(definition.nodes.map((node) => [node.id, node]));
    const ancestors = (id: string) => {
      const seen = new Set<string>(),
        pending = [...(byId.get(id)?.dependencies ?? [])];
      while (pending.length) {
        const next = pending.pop()!;
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(...(byId.get(next)?.dependencies ?? []));
      }
      return seen;
    };
    const parents = new Map(
      definition.nodes.map((node) => [node.id, ancestors(node.id)]),
    );
    return new Map(
      definition.nodes.map((node) => [
        node.id,
        node.dependencies.filter(
          (id) =>
            !node.dependencies.some(
              (other) => other !== id && parents.get(other)?.has(id),
            ),
        ),
      ]),
    );
  }, [definition]);
  const parallelLanes = useMemo(
    () =>
      new Map(
        definition.nodes
          .filter((n) => n.kind === "parallel")
          .map((node) => [
            node.id,
            (node.lanes ?? node.dependencies).map((name) => {
              const children = node.lanes
                ? definition.nodes.filter((child) =>
                    child.path.includes(`${node.id}:${name}`),
                  )
                : definition.nodes.filter((child) => child.id === name);
              const states = children.map(
                (child) => run.steps[child.id]?.status ?? "waiting",
              );
              const status =
                run.steps[node.id]?.status === "untaken"
                  ? "untaken"
                  : states.includes("error")
                    ? "error"
                    : states.includes("cancelled")
                      ? "cancelled"
                      : states.includes("blocked")
                        ? "blocked"
                        : run.steps[node.id]?.status === "completed" ||
                            (states.length > 0 &&
                              states.every(
                                (state) =>
                                  state === "completed" || state === "untaken",
                              ))
                          ? "completed"
                          : states.some(
                                (state) =>
                                  state === "running" || state === "completed",
                              )
                            ? "running"
                            : "waiting";
              return { name, status };
            }),
          ]),
      ),
    [definition, run.steps],
  );
  const layout = useMemo(() => {
    const columns = new Map<string, number>();
    let remaining = [...definition.nodes];
    while (remaining.length) {
      const ready = remaining.filter((node) =>
        node.dependencies.every((id) => columns.has(id)),
      );
      if (!ready.length) break;
      for (const node of ready)
        columns.set(
          node.id,
          node.dependencies.length
            ? Math.max(...node.dependencies.map((id) => columns.get(id)!)) + 1
            : 0,
        );
      const ids = new Set(ready.map((node) => node.id));
      remaining = remaining.filter((node) => !ids.has(node.id));
    }
    const points = new Map<string, Bounds>();
    let x = 40;
    for (let column = 0; column <= Math.max(0, ...columns.values()); column++) {
      const nodes = definition.nodes.filter(
        (node) => columns.get(node.id) === column,
      );
      let bottom = 40,
        width = 280;
      for (const node of nodes) {
        const captured =
          node.kind === "jev" &&
          tracesById.has(run.steps[node.id]?.traceId ?? "");
        const w = captured ? 1120 : 360,
          h = captured
            ? heights[node.id] ?? 640
            : node.kind === "parallel"
              ? 190 +
                (node.description ? 64 : 0) +
                Math.min(4, (node.lanes ?? node.dependencies).length) * 32
              : (node.description ? 244 : 172) +
                (node.kind === "branch"
                  ? 110 +
                    Math.min(3, inputsByStep.get(node.id)?.length ?? 0) * 24
                  : node.kind === "task"
                    ? 130
                    : 0);
        const parents = (links.get(node.id) ?? [])
          .map((id) => points.get(id)!)
          .filter(Boolean);
        const center = parents.length
          ? parents.reduce((sum, p) => sum + p.y + p.height / 2, 0) /
            parents.length
          : h / 2 + 40;
        const y = Math.max(bottom, center - h / 2);
        points.set(node.id, { x, y, width: w, height: h });
        bottom = y + h + 100;
        width = Math.max(width, w);
      }
      x += width + 160;
    }
    return {
      points,
      width: Math.max(700, x - 120),
      height: Math.max(
        400,
        ...[...points.values()].map((p) => p.y + p.height + 40),
      ),
    };
  }, [definition, run.steps, tracesById, heights, links, inputsByStep]);
  const { viewport, canvas, zoom, zoomBy, fit, preserveCamera, focusArea } =
    useDiagramViewport(layout.width, layout.height, run.id);
  const onResize = useCallback(
    (id: string, height: number) => {
      preserveCamera();
      setHeights((previous) =>
        previous[id] === height ? previous : { ...previous, [id]: height },
      );
    },
    [preserveCamera],
  );
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    const first = layout.points.get(selected);
    if (first) {
      started.current = true;
      focusArea(first);
    }
  }, [layout, selected, focusArea]);
  const selectStep = (id: string) => {
    setSelected(id);
    const bounds = layout.points.get(id);
    if (bounds) focusArea(bounds);
  };
  const node = definition.nodes.find((n) => n.id === selected);
  const step = node ? run.steps[node.id] : undefined;
  const trace = step?.traceId
    ? traces.find((t) => t.id === step.traceId)
    : undefined;
  return (
    <section className="request-detail whole-flow" aria-label="Whole flow">
      <header className="detail-header">
        <div>
          <span className="eyebrow">Flow run · {run.status}</span>
          <h2>{run.name}</h2>
        </div>
        <div>
          {run.outcome ? (
            <strong>Outcome: {run.outcome}</strong>
          ) : (
            run.error ?? "Execution paths"
          )}
          <small className="muted">
            {run.durationMs !== undefined
              ? ` · ${Math.round(run.durationMs)} ms`
              : ""}
          </small>
        </div>
      </header>
      <div className="lab-flow-toolbar">
        <div>
          <button aria-label="Zoom flow out" onClick={() => zoomBy(1 / 1.2)}>
            −
          </button>
          <output aria-label="Flow zoom">{zoom}%</output>
          <button aria-label="Zoom flow in" onClick={() => zoomBy(1.2)}>
            +
          </button>
          <button onClick={fit}>Fit flow</button>
          <button disabled={!selected} onClick={() => selectStep(selected)}>
            Focus step
          </button>
        </div>
        <label>
          Step
          <select
            aria-label="Flow step"
            value={selected}
            onChange={(e) => selectStep(e.target.value)}
          >
            <option value="">Select a step</option>
            {definition.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title ? `${n.title} (${n.id})` : n.id} ·{" "}
                {run.steps[n.id]?.status ?? "waiting"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flow-workspace">
        <div
          className="flow-overview-viewport diagram-viewport"
          ref={viewport}
          tabIndex={0}
          aria-label="Flow canvas"
          role="region"
        >
          <div
            ref={canvas}
            className="flow-overview-canvas"
            style={{ width: layout.width, height: layout.height }}
          >
            <svg
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
              className="flow-connections"
            >
              <defs>
                <marker
                  id={`arrow-${run.id}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto"
                >
                  <path d="M0 0L10 5L0 10z" fill="currentColor" />
                </marker>
              </defs>
              {definition.nodes.flatMap((n) =>
                (links.get(n.id) ?? []).map((id) => {
                  const a = layout.points.get(id),
                    b = layout.points.get(n.id);
                  if (!a || !b) return null;
                  const active = ["running", "completed"].includes(
                    run.steps[n.id]?.status,
                  );
                  return (
                    <path
                      key={`${id}-${n.id}`}
                      d={`M${a.x + a.width},${a.y + a.height / 2} C${a.x + a.width + 80},${a.y + a.height / 2} ${b.x - 80},${b.y + b.height / 2} ${b.x},${b.y + b.height / 2}`}
                      stroke={active ? "#E551BA" : "currentColor"}
                      opacity={active ? 1 : 0.35}
                      fill="none"
                      strokeWidth="2"
                      markerEnd={`url(#arrow-${run.id})`}
                    />
                  );
                }),
              )}
            </svg>
            {definition.nodes.map((n) => {
              const p = layout.points.get(n.id);
              if (!p) return null;
              const captured = tracesById.get(run.steps[n.id]?.traceId ?? "");
              return n.kind === "jev" && captured ? (
                <RequestNode
                  key={n.id}
                  node={n}
                  trace={captured}
                  status={run.steps[n.id]?.status ?? "waiting"}
                  selected={selected === n.id}
                  x={p.x}
                  y={p.y}
                  onSelect={setSelected}
                  onResize={onResize}
                />
              ) : (
                <Card
                  key={n.id}
                  node={n}
                  status={run.steps[n.id]?.status ?? "waiting"}
                  decision={run.steps[n.id]?.decision}
                  selected={selected === n.id}
                  bounds={p}
                  onSelect={setSelected}
                  inputs={inputsByStep.get(n.id)}
                  data={run.steps[n.id]?.data}
                  durationMs={run.steps[n.id]?.durationMs}
                  lanes={parallelLanes.get(n.id) ?? []}
                />
              );
            })}
          </div>
        </div>
        <FlowDetailsPanel
          selection={node?.title ?? node?.id}
          onLayoutChange={preserveCamera}
        >
          <div className="flow-selection">
            {node && step ? (
              <>
                <strong>
                  {node.title ?? node.id} · {step.status}
                </strong>
                <span className="muted">
                  {step.durationMs !== undefined
                    ? ` · ${Math.round(step.durationMs)} ms`
                    : ""}
                </span>
                {node.description && <p>{node.description}</p>}
                {node.kind === "task" && (
                  <div className="flow-task-details">
                    <p className="muted">
                      Application function · runs on your server. Captured
                      values may be redacted or truncated.
                    </p>
                    {step.data &&
                    typeof step.data === "object" &&
                    !Array.isArray(step.data) ? (
                      ["input", "output"]
                        .filter((key) =>
                          Object.hasOwn(step.data as object, key),
                        )
                        .map((key) => (
                          <details key={key} open>
                            <summary>
                              {key === "input"
                                ? "Function inputs"
                                : "Function output"}
                            </summary>
                            <DiagramContent
                              value={(step.data as Record<string, Json>)[key]}
                              label={`Function ${key}`}
                            />
                          </details>
                        ))
                    ) : (
                      <p>
                        {typeof step.data === "string"
                          ? step.data
                          : "No function data captured yet."}
                      </p>
                    )}
                    {step.captureWarnings?.map((warning) => (
                      <p className="muted" key={warning}>
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
                {node.kind === "parallel" && (
                  <p>
                    These paths run at the same time:{" "}
                    {(node.lanes ?? node.dependencies).join(", ")}. The next
                    step starts only after all finish successfully. This marker
                    waits for their results; it does not make another Jev
                    request.
                  </p>
                )}
                {node.kind === "parallel" && (
                  <ul className="flow-lane-details">
                    {parallelLanes.get(node.id)?.map((lane) => (
                      <li key={lane.name}>
                        {lane.name} · {lane.status}
                      </li>
                    ))}
                  </ul>
                )}
                {(inputsByStep.get(node.id)?.length ?? 0) > 0 && (
                  <dl className="flow-input-details">
                    {inputsByStep.get(node.id)?.map((input) => (
                      <div key={input.reference}>
                        <dt>
                          {input.name} <code>{input.reference}</code>
                        </dt>
                        <dd>{input.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {(node.conditionRule !== undefined || node.condition) && (
                  <p>
                    <code>
                      {node.conditionRule !== undefined
                        ? formatFlowCondition(node.conditionRule)
                        : node.condition}
                    </code>{" "}
                    ·{" "}
                    {step.decision === undefined
                      ? "Not evaluated"
                      : step.decision
                        ? "Passed · then route"
                        : "Not met · else route"}
                  </p>
                )}
                <p className="muted">
                  {node.path.length ? node.path.join(" / ") : "Main path"}
                </p>
                {step.error && <p role="alert">{step.error}</p>}
                {node.kind === "jev" &&
                  (trace ? (
                    <button onClick={() => setDetails(!details)}>
                      {details ? "Hide request details" : "Inspect request"}
                    </button>
                  ) : (
                    <p>
                      {step.traceId
                        ? "Request capture was cleared or evicted."
                        : "No captured request linked yet. Use a client created by this inspector."}
                    </p>
                  ))}
              </>
            ) : (
              <p className="muted">
                Each request diagram shows its context, question and answer. Use
                its question picker for other answers. Lines between requests
                show execution dependencies.
              </p>
            )}
            {run.value !== undefined && (
              <details>
                <summary>Captured outcome value</summary>
                <JsonBlock value={run.value} />
              </details>
            )}
          </div>
          {details && trace && (
            <div className="flow-request-detail">
              <RequestDetail trace={trace} />
            </div>
          )}
        </FlowDetailsPanel>
      </div>
    </section>
  );
});
