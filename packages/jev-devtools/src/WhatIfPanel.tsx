import { useDeferredValue, useId, useMemo, useState } from "react";
import type { FlowDefinition, FlowNode, FlowRun } from "./flow-protocol.js";
import type { Trace } from "./protocol.js";
import { formatConditionLiteral } from "./flow-condition.js";
import {
  countWhatIf,
  evaluateRecordedCondition,
  prepareWhatIf,
  whatIfLimits,
  whatIfThresholds,
  whatIfValues,
  type WhatIfLimit,
  type WhatIfOverrides,
  type WhatIfThreshold,
} from "./what-if.js";
import { stripLayout, stripScale } from "./what-if-strip.js";

const limitText: Record<WhatIfLimit, string> = {
  input: "Flow and item input values aren't captured.",
  join: "Values from a parallel join or a collection aren't captured.",
  rule: "The captured rule was truncated or redacted.",
};
const capturesMissing =
  "A capture this rule reads is missing, evicted or redacted.";
// Probability thresholds are edited in the same percent units the cards show.
const percent = (t: WhatIfThreshold) =>
  t.probability && t.value >= 0 && t.value <= 1;
const shown = (t: WhatIfThreshold) =>
  percent(t)
    ? formatConditionLiteral(t.value, true).slice(0, -1)
    : String(t.value);
function parse(t: WhatIfThreshold, text: string): number | undefined {
  const value = text.trim() === "" ? NaN : Number(text);
  if (!Number.isFinite(value)) return undefined;
  if (!percent(t)) return value;
  const [coefficient, exponent = "0"] = String(value).split("e");
  return Number(`${coefficient}e${Number(exponent) - 2}`);
}
const route = (decision: boolean) => (decision ? "then" : "else");
const symbol: Record<WhatIfThreshold["op"], string> = {
  lt: "<",
  gt: ">",
  gte: "≥",
};

/**
 * Recorded values against the threshold; filled dots pass, hollow dots fail.
 * Without a valid current threshold, dots stay but nothing is judged.
 */
function CalibrationStrip({
  threshold: t,
  current,
  values,
  runId,
  id,
}: {
  threshold: WhatIfThreshold;
  current: number | undefined;
  values: { runId: string; value: number }[];
  runId: string;
  id: string;
}) {
  // The domain uses recorded values and the captured threshold only, so the
  // layout and height never change while editing.
  const layout = useMemo(() => {
    const scale = stripScale(
      [...values.map((v) => v.value), t.value],
      percent(t),
    );
    return { ...scale, ...stripLayout(values, scale.x, 8, runId) };
  }, [t, values, runId]);
  const { min, max, x, dots, overflow, reach } = layout;
  const passes = (v: number) =>
    current === undefined
      ? undefined
      : t.op === "gte"
        ? v >= current
        : t.op === "gt"
          ? v > current
          : v < current;
  const tone = (v: number) => {
    const pass = passes(v);
    return pass === undefined ? "neutral" : pass ? "pass" : "fail";
  };
  const passing = values.filter((v) => passes(v.value)).length;
  // Percentage points for probabilities; other scales have no natural band.
  const near =
    percent(t) && current !== undefined
      ? values.filter((v) => Math.abs(v.value - current) <= 0.03 + 1e-9).length
      : undefined;
  const outside =
    current === undefined
      ? undefined
      : current < min
        ? "below"
        : current > max
          ? "above"
          : undefined;
  const top = overflow.length ? 10 : 0;
  const height = top + Math.max(18, (2 * reach + 1) * 8 + 6);
  const axis = top + (height - top) / 2;
  const edge = current === undefined ? undefined : x(current);
  return (
    <div className="flow-what-if-strip">
      <svg
        width="300"
        height={height}
        viewBox={`0 0 300 ${height}`}
        aria-hidden="true"
      >
        <line className="axis" x1="6" x2="294" y1={axis} y2={axis} />
        {edge !== undefined && current !== t.value && (
          <line
            className="captured"
            x1={x(t.value)}
            x2={x(t.value)}
            y1={top + 2}
            y2={height - 2}
          />
        )}
        {edge !== undefined && (
          <line
            className="threshold"
            x1={edge}
            x2={edge}
            y1={top + 1}
            y2={height - 1}
          />
        )}
        {edge !== undefined && outside && (
          // Pinned to the edge: the caret points toward the real threshold.
          <path
            className="threshold-caret"
            d={
              outside === "above"
                ? `M${edge + 2} ${axis - 4}l5 4-5 4z`
                : `M${edge - 2} ${axis - 4}l-5 4 5 4z`
            }
          />
        )}
        {[...dots]
          .sort((a, b) => Number(a.runId === runId) - Number(b.runId === runId))
          .map((v) => (
            <circle
              key={v.runId}
              className={`${tone(v.value)}${v.runId === runId ? " current" : ""}`}
              cx={v.x}
              cy={axis + v.slot * 8}
              r={v.runId === runId ? 4.5 : 3}
            />
          ))}
        {overflow.map((o) => (
          <text key={o.x} x={o.x} y="8" textAnchor="middle">
            +{o.count}
          </text>
        ))}
      </svg>
      <small id={id}>
        {values.length} recorded {values.length === 1 ? "value" : "values"}
        {current !== undefined &&
          ` · ${passing} ${passing === 1 ? "passes" : "pass"}`}
        {near !== undefined && ` · ${near} within 3 percentage points`}
        {outside && ` · threshold is ${outside} the plotted range`}
      </small>
    </div>
  );
}

/** Local what-if replay of recorded values; never changes the captured run. */
export function WhatIfPanel({
  definition,
  node,
  run,
  runs,
  traces,
  unit = "run",
}: {
  definition: FlowDefinition;
  node: FlowNode;
  run: FlowRun;
  /** Retained runs of this definition; item runs for an item definition. */
  runs: readonly FlowRun[];
  traces: ReadonlyMap<string, Trace>;
  /** What one counted run is, for the across-runs summary. */
  unit?: "run" | "item" | "iteration";
}) {
  const thresholds = useMemo(
    () => whatIfThresholds({ ...definition, nodes: [node] }),
    [definition, node],
  );
  // Only edited fields override; untouched thresholds keep the exact literal.
  const [edits, setEdits] = useState<Record<string, string>>({});
  // One effective threshold per field, shared by replay and the strip:
  // the captured literal unless edited, undefined while an edit is invalid.
  const effective = useMemo(
    () =>
      new Map(
        thresholds.map((t) => {
          if (!(t.id in edits)) return [t.id, t.value];
          const value = parse(t, edits[t.id]);
          // Retyping the shown value (or 90.0 for 90) is not a change.
          return [
            t.id,
            value === parse(t, shown(t)) ? t.value : value,
          ] as const;
        }),
      ),
    [thresholds, edits],
  );
  const overrides = useMemo(() => {
    const parsed: WhatIfOverrides = {};
    for (const t of thresholds) {
      const value = effective.get(t.id);
      if (value === undefined) return undefined;
      if (value !== t.value) parsed[t.id] = value;
    }
    return parsed;
  }, [thresholds, effective]);
  const recorded = run.steps[node.id]?.decision;
  const baseline = evaluateRecordedCondition(
    node.id,
    node.conditionRule,
    run,
    traces,
  );
  const replayed =
    overrides &&
    evaluateRecordedCondition(
      node.id,
      node.conditionRule,
      run,
      traces,
      overrides,
    );
  // Operands are resolved once per history; an edit only re-compares them,
  // and the history-wide count trails typing so the input stays responsive.
  const prepared = useMemo(
    () => prepareWhatIf({ ...definition, nodes: [node] }, runs, traces),
    [definition, node, runs, traces],
  );
  const deferredOverrides = useDeferredValue(overrides);
  const updating = overrides !== deferredOverrides;
  const across = useMemo(
    () => deferredOverrides && countWhatIf(prepared, deferredOverrides),
    [prepared, deferredOverrides],
  );
  const recordedValues = useMemo(
    () =>
      new Map(
        thresholds.map((t) => [
          t.id,
          whatIfValues(definition, runs, traces, t.id),
        ]),
      ),
    [definition, runs, traces, thresholds],
  );
  const id = useId();
  const limits = whatIfLimits(node.conditionRule, definition);
  if (!thresholds.length)
    return (
      <section className="flow-what-if" aria-labelledby={`${id}-title`}>
        <span className="eyebrow" id={`${id}-title`}>
          What if
        </span>
        <p className="muted">
          {limits.includes("rule")
            ? `${limitText.rule} Its thresholds can't be changed.`
            : "This rule has no numeric thresholds to change."}
        </p>
      </section>
    );
  let result: string, detail: string;
  if (recorded === undefined) {
    result = "This condition wasn't evaluated in this run.";
    detail = "";
  } else if (baseline === undefined) {
    result = "This run can't be re-evaluated.";
    detail = limits.length
      ? limits.map((limit) => limitText[limit]).join(" ")
      : capturesMissing;
  } else if (baseline !== recorded) {
    result = "This run can't be re-evaluated.";
    detail =
      "Replaying the captured values doesn't reproduce the recorded decision.";
  } else if (replayed === undefined) {
    result = "Enter a number for every threshold.";
    detail = "";
  } else if (replayed === recorded) {
    result = `Still the ${route(recorded)} route`;
    detail = "";
  } else {
    result = `Switches to the ${route(replayed)} route (recorded: ${route(recorded)})`;
    detail = `No outcome was recorded for the ${route(replayed)} route.`;
  }
  const changed = across?.changed.length ?? 0;
  return (
    <section className="flow-what-if" aria-labelledby={`${id}-title`}>
      <div className="flow-what-if-heading">
        <span className="eyebrow" id={`${id}-title`}>
          What if
        </span>
        <button
          disabled={!!overrides && !Object.keys(overrides).length}
          onClick={() => setEdits({})}
        >
          Reset
        </button>
      </div>
      <p className="muted">
        Replays captured values locally. Nothing is sent to Jev.
      </p>
      <div className="flow-what-if-thresholds">
        {thresholds.map((t) => {
          const text = edits[t.id] ?? shown(t);
          const invalid = parse(t, text) === undefined;
          const values = recordedValues.get(t.id) ?? [];
          const summary = `${id}-${t.id}-values`;
          return (
            <div className="flow-what-if-threshold" key={t.id}>
              <label>
                <code>
                  {t.label} {symbol[t.op]}
                  {percent(t) && (
                    <span className="flow-what-if-hidden">percent</span>
                  )}
                </code>
                <span className="flow-what-if-value">
                  <input
                    type="number"
                    step="any"
                    value={text}
                    aria-invalid={invalid}
                    aria-describedby={
                      [
                        values.length ? summary : "",
                        invalid ? `${id}-result` : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    onChange={(e) =>
                      setEdits((previous) => ({
                        ...previous,
                        [t.id]: e.target.value,
                      }))
                    }
                  />
                  {percent(t) && <span aria-hidden="true">%</span>}
                </span>
              </label>
              {values.length > 0 && (
                <CalibrationStrip
                  threshold={t}
                  current={effective.get(t.id)}
                  values={values}
                  runId={run.id}
                  id={summary}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flow-what-if-result" role="status">
        <strong id={`${id}-result`}>{result}</strong>
        <p>{detail}</p>
        <p className="muted" aria-busy={updating}>
          {updating
            ? "Updating counts…"
            : across
              ? `${changed} of ${across.evaluated} retained ${unit}${across.evaluated === 1 ? "" : "s"} would change${across.unavailable ? ` · ${across.unavailable} can't be re-evaluated` : ""}`
              : ""}
        </p>
      </div>
    </section>
  );
}
