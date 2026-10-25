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
import {
  CopyFixtureButton,
  CopyFixtureReport,
  useFixtureCopy,
} from "./CopyFixture.js";
import { FlowDetailsPanel } from "./FlowDetailsPanel.js";
import { DiagramContent } from "./DiagramContent.js";
import { WhatIfPanel } from "./WhatIfPanel.js";
import { whatIfItemRuns } from "./what-if.js";
import { useStableArray } from "./use-stable-array.js";
type Lane = { name: string; status: string };
type Bounds = { x: number; y: number; width: number; height: number };
type Size = Pick<Bounds, "width" | "height">;
type CollectionView = { index: number; open: boolean };
const noRuns: readonly FlowRun[] = [];
// Measure in canvas coordinates: screen rectangles also include the camera zoom.
function useNodeHeight<T extends HTMLElement>(
  id: string,
  onResize: (id: string, height: number) => void,
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let previous = 0;
    const measure = () => {
      const height = element.offsetHeight;
      // A closed drawer can hide the flow without unmounting it.
      if (height > 0 && height !== previous) {
        previous = height;
        onResize(id, height);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, onResize]);
  return ref;
}

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
  const ref = useNodeHeight<HTMLElement>(node.id, onResize);
  return (
    <article
      ref={ref}
      className={`flow-step flow-request ${selected ? "selected" : ""}`}
      data-status={status}
      aria-label={`Request ${node.id}`}
      style={{ left: x, top: y, width: 1120 }}
    >
      <button
        className="flow-request-heading"
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
      <TraceDiagram trace={trace} embedded />
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
  onResize,
  onSelect,
  lanes,
  inputs,
  data,
  durationMs,
  collection,
  loop,
  collectionView,
  onCollectionChange,
  expansionId,
}: {
  node: FlowNode;
  status: string;
  decision?: boolean;
  selected: boolean;
  bounds: Bounds;
  onResize: (id: string, height: number) => void;
  onSelect: (id: string) => void;
  lanes: Lane[];
  inputs?: ConditionInput[];
  data?: FlowStep["data"];
  durationMs?: number;
  collection?: FlowStep["collection"];
  loop?: FlowStep["loop"];
  collectionView?: CollectionView;
  onCollectionChange: (id: string, view: CollectionView) => void;
  expansionId: string;
}) {
  const ref = useNodeHeight<HTMLElement>(node.id, onResize);
  const join = node.kind === "parallel";
  const repeated = node.kind === "map" || node.kind === "loop";
  const unit = node.kind === "loop" ? "Iteration" : "Item";
  const completedItems =
    collection?.items.filter((item) => item.status === "completed").length ?? 0;
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

  const itemIndex = Math.min(
    collectionView?.index ?? 0,
    Math.max(0, (collection?.total ?? 0) - 1),
  );
  const expanded = collectionView?.open ?? false;
  const valueCard = node.kind === "task" || node.kind === "merge";
  const hasOutput =
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.hasOwn(data, "output");
  const footer = (
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
            : node.kind === "merge" && decision !== undefined
              ? `Selected ${decision ? "then" : "else"} value · continue`
              : node.kind === "loop"
                ? stateLabel
                : decision !== undefined
                  ? decision
                    ? "Condition met · then"
                    : "Condition not met · else"
                  : stateLabel}
      </small>
    </span>
  );
  return (
    <article
      ref={ref}
      className={`flow-step ${node.kind === "task" ? "flow-task" : ""} ${selected ? "selected" : ""}`}
      data-status={status}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
      }}
      aria-label={`${node.kind === "map" ? "Collection" : "Step"} ${node.title ?? node.id}`}
    >
      <button
        className="flow-card-body"
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
              {join || node.kind === "merge" ? (
                <path d="M4 5h4l5 7h7M4 19h4l5-7m4-3 3 3-3 3" />
              ) : node.kind === "loop" ? (
                <path d="M20 7a8 8 0 1 0 0 10M20 3v5h-5" />
              ) : node.kind === "map" ? (
                <>
                  <rect x="8" y="3" width="12" height="5" rx="1" />
                  <rect x="8" y="10" width="12" height="5" rx="1" />
                  <rect x="8" y="17" width="12" height="5" rx="1" />
                  <path d="M2 5.5h3m-3 7h3m-3 7h3" />
                </>
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
              : node.kind === "branch" || node.kind === "if"
                ? "Condition"
                : node.kind === "task"
                  ? "Function"
                  : node.kind === "map"
                    ? "Collection"
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
        {repeated && (
          <span className="flow-map-progress">
            <strong>
              {node.kind === "loop"
                ? `${completedItems} iteration${completedItems === 1 ? "" : "s"} completed`
                : collection
                  ? `${completedItems} of ${collection.total} complete`
                  : "Waiting for collection"}
            </strong>
            {loop ? (
              <span>
                {loop.stopReason === "limit"
                  ? "Iteration limit reached · incomplete"
                  : loop.stopReason === "condition"
                    ? "Condition is false · finished"
                    : `Up to ${loop.maxIterations} iteration${loop.maxIterations === 1 ? "" : "s"}`}
              </span>
            ) : (
              collection && (
                <span>
                  {
                    collection.items.filter((item) => item.status === "running")
                      .length
                  }{" "}
                  running ·{" "}
                  {
                    collection.items.filter((item) => item.status === "waiting")
                      .length
                  }{" "}
                  queued · up to {collection.concurrency} concurrent
                </span>
              )
            )}
            {node.kind === "loop" && node.conditionRule && (
              <code>
                Continue while {formatFlowCondition(node.conditionRule)}
              </code>
            )}
            <small>
              Explore {node.kind === "loop" ? "an iteration's" : "an item's"}{" "}
              connected flow below
            </small>
          </span>
        )}
        {(node.kind === "branch" || node.kind === "if") &&
          (node.conditionRule !== undefined || node.condition) && (
            <span className="flow-condition-rule">
              {inputs && inputs.length > 0 && (
                <span className="flow-condition-incoming">
                  <span className="flow-condition-label">
                    {inputs.length === 1 ? "Incoming value" : "Incoming values"}
                  </span>
                  {inputs.slice(0, 3).map((input) => (
                    <span
                      className="flow-condition-input"
                      key={input.reference}
                    >
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
                <small>
                  {lanes.length - 4} more · select to see all checks
                </small>
              )}
            </span>
          </>
        )}
        {!valueCard && footer}
        {node.kind === "jev" && (
          <small>
            {status === "untaken"
              ? "This request was not run."
              : "Request details are not captured yet or no longer retained."}
          </small>
        )}
      </button>
      {valueCard && (
        <>
          <div className="flow-task-preview">
            <span className="flow-condition-label">Returned value</span>
            {hasOutput ? (
              <DiagramContent
                value={(data as { output: Json }).output}
                label={`Returned value for ${node.title ?? node.id}`}
              />
            ) : (
              <span className="diagram-value-empty">
                {status === "running"
                  ? "Running application code…"
                  : "No output captured"}
              </span>
            )}
            <small>
              {durationMs === undefined
                ? "Select the heading to inspect inputs and output"
                : `${Math.round(durationMs)} ms · select heading to inspect`}
            </small>
          </div>
          {footer}
        </>
      )}
      {repeated && (
        <div className="flow-collection-controls" data-diagram-scroll>
          <label>
            {node.kind === "loop" ? "Iteration" : "Collection item"}
            <select
              aria-label={`${node.kind === "loop" ? "Iteration" : "Collection item"} for ${node.title ?? node.id}`}
              value={itemIndex}
              disabled={!collection?.total}
              onChange={(event) =>
                onCollectionChange(node.id, {
                  index: Number(event.target.value),
                  open: expanded,
                })
              }
            >
              {!collection?.total && (
                <option value={0}>
                  {node.kind === "loop" ? "No iterations" : "No items"}
                </option>
              )}
              {collection?.items.map((item) => (
                <option key={item.index} value={item.index}>
                  {unit} {item.index + 1} · {item.status}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!collection?.total || !node.itemDefinition}
            aria-expanded={expanded}
            aria-controls={expanded ? expansionId : undefined}
            onClick={() =>
              onCollectionChange(node.id, { index: itemIndex, open: !expanded })
            }
          >
            {expanded ? "Hide Flow" : "View Flow"}
          </button>
        </div>
      )}
    </article>
  );
});
export const FlowOverview = memo(function FlowOverview({
  definition,
  run,
  runs,
  traces,
  inline = false,
  unit,
}: {
  definition: FlowDefinition;
  run: FlowRun;
  /** Retained runs of this definition, for what-if counts. */
  runs: readonly FlowRun[];
  traces: Trace[];
  inline?: boolean;
  /** Item flows only: what one of `runs` is. */
  unit?: "item" | "iteration";
}) {
  const [selected, setSelected] = useState(
    () => definition.nodes.find((n) => n.kind === "jev")?.id ?? "",
  );
  const [details, setDetails] = useState(false);
  const [collectionViews, setCollectionViews] = useState<
    Record<string, CollectionView>
  >({});
  const [itemSizes, setItemSizes] = useState<Record<string, Size>>({});
  const [heights, setHeights] = useState<Record<string, number>>({});
  const tracesById = useMemo(
    () => new Map(traces.map((trace) => [trace.id, trace])),
    [traces],
  );
  // Item runs of each map and loop across the retained runs, for item what-if.
  const itemRuns = useMemo(
    () =>
      new Map(
        definition.nodes
          .filter((n) => n.itemDefinition)
          .map((n) => [n.id, whatIfItemRuns(runs, n.id)]),
      ),
    [definition, runs],
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
            node.kind === "merge" ||
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
    const expansions = new Map<string, Bounds>();
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
          h =
            heights[node.id] ??
            (captured
              ? 640
              : node.kind === "parallel"
                ? 190 +
                  (node.description ? 64 : 0) +
                  Math.min(4, (node.lanes ?? node.dependencies).length) * 32
                : (node.description ? 244 : 172) +
                  (node.kind === "branch" || node.kind === "if"
                    ? 110 +
                      Math.min(3, inputsByStep.get(node.id)?.length ?? 0) * 24
                    : node.kind === "task" || node.kind === "merge"
                      ? 130
                      : 0));
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
    // Collection previews occupy a separate row below the original graph.
    // Their dimensions must never participate in its column or lane spacing.
    const expansionY =
      Math.max(...[...points.values()].map((p) => p.y + p.height), 40) + 96;
    for (const node of definition.nodes) {
      if (
        !collectionViews[node.id]?.open ||
        !node.itemDefinition ||
        !run.steps[node.id]?.collection?.total
      )
        continue;
      const card = points.get(node.id);
      if (!card) continue;
      const size = itemSizes[node.id] ?? { width: 2400, height: 800 };
      const left = card.x + card.width / 2 - size.width / 2;
      let top = expansionY;
      // Center each preview on its collection. Stack overlapping previews
      // vertically, leaving the original graph and all its coordinates alone.
      for (const area of expansions.values()) {
        if (
          left - 80 < area.x + area.width + 80 &&
          left + size.width + 80 > area.x - 80
        )
          top = Math.max(top, area.y + area.height + 96);
      }
      expansions.set(node.id, { x: left, y: top, ...size });
    }
    // External arrows and centered previews can extend left of canvas zero.
    const left = Math.min(0, ...[...expansions.values()].map((p) => p.x - 80));
    const right = Math.max(
      700,
      x - 120,
      ...[...expansions.values()].map((p) => p.x + p.width + 80),
    );
    return {
      points,
      expansions,
      left,
      width: right - left,
      height: Math.max(
        400,
        ...[...points.values(), ...expansions.values()].map(
          (p) => p.y + p.height + 40,
        ),
      ),
    };
  }, [
    definition,
    run.steps,
    tracesById,
    heights,
    links,
    inputsByStep,
    collectionViews,
    itemSizes,
  ]);
  const fixtureCopy = useFixtureCopy(definition, run, tracesById);
  const { viewport, canvas, zoom, zoomBy, fit, preserveCamera, focusArea } =
    useDiagramViewport(layout.width, layout.height, run.id, {
      x: layout.left,
      y: 0,
    });
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
  const changeCollection = useCallback(
    (id: string, view: CollectionView) => {
      preserveCamera();
      setSelected(id);
      started.current = true;
      setCollectionViews((previous) => ({ ...previous, [id]: view }));
    },
    [preserveCamera],
  );
  const resizeItem = useCallback(
    (id: string, size: Size) => {
      preserveCamera();
      setItemSizes((previous) =>
        previous[id]?.width === size.width &&
        previous[id]?.height === size.height
          ? previous
          : { ...previous, [id]: size },
      );
    },
    [preserveCamera],
  );
  useEffect(() => {
    if (inline || started.current) return;
    const first = layout.points.get(selected);
    if (first) {
      started.current = true;
      focusArea(first);
    }
  }, [layout, selected, focusArea, inline]);
  const selectStep = (id: string) => {
    setSelected(id);
    const bounds = layout.points.get(id);
    if (bounds && !inline) focusArea(bounds);
  };
  const node = definition.nodes.find((n) => n.id === selected);
  const step = node ? run.steps[node.id] : undefined;
  const trace = step?.traceId
    ? traces.find((t) => t.id === step.traceId)
    : undefined;
  return (
    <div
      className={`flow-overview-stack ${inline ? "flow-inline-overview" : ""}`}
      style={inline ? { width: layout.width } : undefined}
    >
      <section
        className="request-detail whole-flow"
        aria-label={inline ? "Collection item flow" : "Whole flow"}
      >
        {!inline && (
          <header className="detail-header">
            <div>
              <span className="eyebrow">Flow run · {run.status}</span>
              <h2>{run.name}</h2>
            </div>
            <div className="flow-run-summary">
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
              <CopyFixtureButton control={fixtureCopy} />
            </div>
          </header>
        )}
        {!inline && <CopyFixtureReport control={fixtureCopy} />}
        <div className="lab-flow-toolbar">
          {!inline && (
            <div>
              <button
                aria-label="Zoom flow out"
                onClick={() => zoomBy(1 / 1.2)}
              >
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
          )}
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
            className={
              inline
                ? "flow-inline-surface"
                : "flow-overview-viewport diagram-viewport"
            }
            ref={inline ? undefined : viewport}
            style={inline ? { height: layout.height } : undefined}
            tabIndex={inline ? undefined : 0}
            aria-label={inline ? "Item flow canvas" : "Flow canvas"}
            role="region"
          >
            <div
              ref={inline ? undefined : canvas}
              className="flow-overview-canvas"
              style={{
                width: layout.width,
                height: layout.height,
                // Inline views have no camera to account for negative bounds.
                // Keep nested previews and their external arrows in the frame.
                transform: inline ? `translateX(${-layout.left}px)` : undefined,
              }}
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
                    const decision = n.merge
                      ? run.steps[n.merge.condition]?.decision
                      : undefined;
                    const active =
                      ["running", "completed"].includes(
                        run.steps[n.id]?.status,
                      ) &&
                      ["running", "completed"].includes(
                        run.steps[id]?.status,
                      ) &&
                      (!n.merge ||
                        (decision !== undefined &&
                          id === n.merge[decision ? "then" : "else"]));
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
                {[...layout.expansions].map(([id, area]) => {
                  const card = layout.points.get(id)!;
                  const x = card.x + card.width / 2;
                  const endX = area.x + area.width / 2;
                  const startY = card.y + card.height;
                  const bendY = startY + (area.y - startY) / 2;
                  return (
                    <g key={id} className="flow-collection-link">
                      <path
                        d={`M${x},${startY} C${x},${bendY} ${endX},${bendY} ${endX},${area.y}`}
                        fill="none"
                        stroke="#E551BA"
                        strokeWidth="2"
                        strokeDasharray="6 5"
                        markerEnd={`url(#arrow-${run.id})`}
                      />
                      <text x={endX + 14} y={area.y - 20}>
                        {definition.nodes.find((n) => n.id === id)?.kind ===
                        "loop"
                          ? "Selected iteration"
                          : "Selected item"}{" "}
                        {(collectionViews[id]?.index ?? 0) + 1}
                      </text>
                    </g>
                  );
                })}
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
                    onResize={onResize}
                    onSelect={setSelected}
                    inputs={inputsByStep.get(n.id)}
                    data={run.steps[n.id]?.data}
                    durationMs={run.steps[n.id]?.durationMs}
                    lanes={parallelLanes.get(n.id) ?? []}
                    collection={run.steps[n.id]?.collection}
                    loop={run.steps[n.id]?.loop}
                    collectionView={collectionViews[n.id]}
                    onCollectionChange={changeCollection}
                    expansionId={`collection-${run.id}-${n.id}`}
                  />
                );
              })}
              {[...layout.expansions].map(([id, bounds]) => {
                const collectionNode = definition.nodes.find(
                  (n) => n.id === id,
                )!;
                const collection = run.steps[id].collection!;
                const index = Math.min(
                  collectionViews[id].index,
                  collection.total - 1,
                );
                return (
                  <InlineItemFlow
                    key={id}
                    id={`collection-${run.id}-${id}`}
                    node={collectionNode}
                    collection={collection}
                    index={index}
                    bounds={bounds}
                    runs={itemRuns.get(id) ?? noRuns}
                    traces={traces}
                    onResize={resizeItem}
                    onCollectionChange={changeCollection}
                  />
                );
              })}
            </div>
          </div>
          <FlowDetailsPanel
            inline={inline}
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
                  {node.kind === "loop" && (
                    <div className="flow-task-details">
                      <p>
                        {step.loop?.stopReason === "limit"
                          ? "Iteration limit reached. The final state is incomplete and downstream steps did not run."
                          : step.loop?.stopReason === "condition"
                            ? "The continuation condition became false. The loop returned its final state."
                            : "Iterations execute sequentially, carrying state forward."}
                      </p>
                      <DiagramContent
                        value={step.data ?? null}
                        label="Loop initial and latest state"
                      />
                    </div>
                  )}
                  {(node.kind === "task" || node.kind === "merge") && (
                    <div className="flow-task-details">
                      <p className="muted">
                        {node.kind === "merge"
                          ? "Value returned by the selected path. This merge does not make another request."
                          : "Application function · runs on your server."}{" "}
                        Captured values may be redacted or truncated.
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
                                  : node.kind === "merge"
                                    ? "Selected value"
                                    : "Function output"}
                              </summary>
                              <DiagramContent
                                value={(step.data as Record<string, Json>)[key]}
                                label={
                                  node.kind === "merge"
                                    ? "Selected value"
                                    : `Function ${key}`
                                }
                              />
                            </details>
                          ))
                      ) : (
                        <p>
                          {typeof step.data === "string"
                            ? step.data
                            : node.kind === "merge"
                              ? "No selected value captured yet."
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
                      step starts only after all finish successfully. This
                      marker waits for their results; it does not make another
                      Jev request.
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
                          ? node.kind === "loop"
                            ? "Continue"
                            : "Passed · then route"
                          : node.kind === "loop"
                            ? "Stop"
                            : "Not met · else route"}
                    </p>
                  )}
                  {(node.kind === "branch" || node.kind === "if") &&
                    node.conditionRule !== undefined && (
                      <WhatIfPanel
                        key={node.id}
                        definition={definition}
                        node={node}
                        run={run}
                        runs={runs}
                        traces={tracesById}
                        unit={unit}
                      />
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
                  Each request diagram shows its context, question and answer.
                  Use its question picker for other answers. Lines between
                  requests show execution dependencies.
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
    </div>
  );
});

const InlineItemFlow = memo(function InlineItemFlow({
  id,
  node,
  collection,
  index,
  bounds,
  runs,
  traces,
  onResize,
  onCollectionChange,
}: {
  id: string;
  node: FlowNode;
  collection: NonNullable<FlowStep["collection"]>;
  index: number;
  bounds: Bounds;
  /** Item runs of this node across the retained parent runs. */
  runs: readonly FlowRun[];
  traces: Trace[];
  onResize: (id: string, size: Size) => void;
  onCollectionChange: (id: string, view: CollectionView) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  // Parent updates rebuild item run lists; keep them while the runs match.
  const itemRuns = useStableArray(runs);
  const item = collection.items[index];
  const unit = node.kind === "loop" ? "iteration" : "collection item";
  const [direction, setDirection] = useState(1);
  const cycleItem = (direction: number) => {
    if (collection.total <= 1) return;
    setDirection(direction);
    onCollectionChange(node.id, {
      index: (index + direction + collection.total) % collection.total,
      open: true,
    });
  };
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let width = 0,
      height = 0;
    const measure = () => {
      const nextWidth = element.offsetWidth,
        nextHeight = element.offsetHeight;
      if (
        nextWidth > 0 &&
        nextHeight > 0 &&
        (width !== nextWidth || height !== nextHeight)
      ) {
        width = nextWidth;
        height = nextHeight;
        onResize(node.id, { width, height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [node.id, onResize]);
  return (
    <article
      ref={ref}
      id={id}
      className="flow-collection-expansion"
      aria-label={`Selected ${unit} flow for ${node.title ?? node.id}`}
      style={{ left: bounds.x, top: bounds.y }}
    >
      <button
        className="flow-item-arrow flow-item-previous"
        aria-label={`Previous ${unit}`}
        aria-controls={`${id}-item`}
        title={`Previous ${unit}`}
        disabled={collection.total <= 1}
        onClick={() => cycleItem(-1)}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m14 6-6 6 6 6" />
        </svg>
      </button>
      <div className="flow-item-frame">
        <header className="flow-collection-heading">
          <div>
            <span className="eyebrow">Selected {unit}</span>
            <h3 aria-live="polite" aria-atomic="true">
              {node.title ?? node.id} ·{" "}
              {node.kind === "loop" ? "Iteration" : "Item"} {index + 1} of{" "}
              {collection.total}
            </h3>
            <small>{item?.status ?? "waiting"}</small>
          </div>
          <button
            onClick={() => onCollectionChange(node.id, { index, open: false })}
          >
            Hide Flow
          </button>
        </header>
        <div
          key={index}
          id={`${id}-item`}
          className={`flow-item-content ${direction < 0 ? "flow-item-backward" : "flow-item-forward"}`}
        >
          {item?.run && node.itemDefinition ? (
            <FlowOverview
              key={item.run.id}
              definition={node.itemDefinition}
              run={item.run}
              runs={itemRuns}
              traces={traces}
              inline
              unit={node.kind === "loop" ? "iteration" : "item"}
            />
          ) : (
            <p className="flow-item-placeholder">
              {item?.status === "waiting"
                ? "This item is queued. Its flow will appear here when it starts."
                : "This item has no captured execution. It may have been cancelled or blocked before starting."}
            </p>
          )}
        </div>
      </div>
      <button
        className="flow-item-arrow flow-item-next"
        aria-label={`Next ${unit}`}
        aria-controls={`${id}-item`}
        title={`Next ${unit}`}
        disabled={collection.total <= 1}
        onClick={() => cycleItem(1)}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m10 6 6 6-6 6" />
        </svg>
      </button>
    </article>
  );
});
