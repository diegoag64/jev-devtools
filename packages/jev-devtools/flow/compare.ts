import { isDeepStrictEqual } from "node:util";
import type {
  FlowDefinition,
  FlowNode,
  FlowRun,
  FlowStep,
} from "../src/flow-protocol.js";
import type { FlowFixture } from "../src/flow-fixture.js";
import type { FlowObserver, FlowOutcome, FlowRunOptions } from "./index.js";
import { replayClient } from "./replay.js";
import { observeRequest } from "./runtime.js";

type AnswerValue = string | number | boolean | null;
/** One scalar answer field of a jev step both sides ran; delta is set when both sides and their difference are finite. Answer drift never sets FixtureComparison.changed on its own. */
export type AnswerChange = {
  stepId: string;
  question: string;
  field: string;
  recorded?: AnswerValue;
  live?: AnswerValue;
  delta?: number;
  changed: boolean;
};
export type FixtureComparison = {
  /** Outcome, value or a decision differs, or a jev step ran on only one side. Answer drift alone does not set it. */
  changed: boolean;
  outcome: { recorded: string; live: string; changed: boolean };
  value: { recorded?: unknown; live?: unknown; changed: boolean };
  decisions: {
    stepId: string;
    recorded?: boolean;
    live?: boolean;
    changed: boolean;
  }[];
  answers: AnswerChange[];
  /** Jev step ids; map and loop items use `${parentId}/${index}/${innerId}`. */
  steps: { onlyRecorded: string[]; onlyLive: string[] };
  /** The live run's response bodies, unredacted and untruncated. */
  liveFixture: FlowFixture;
};
/** Any flow from defineJevFlow, typed by its input. */
export type ComparableFlow<T> = {
  definition: FlowDefinition;
  run(
    input: T,
    options: FlowRunOptions,
  ): Promise<FlowOutcome & { runId: string }>;
};
type Side = FlowOutcome & {
  /** The root run's last update; map and loop item runs are nested in it. */
  run?: FlowRun;
  /** Response bodies by composed step id. */
  bodies: Map<string, unknown>;
};

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

async function observe<T>(
  flow: ComparableFlow<T>,
  input: T,
  options: FlowRunOptions,
): Promise<Side> {
  const bodies = new Map<string, unknown>();
  const captures: Promise<unknown>[] = [];
  let latest: FlowRun | undefined;
  const user = options.devtools;
  const devtools: FlowObserver = {
    startFlow(definition, run) {
      latest = run;
      let inner: ReturnType<FlowObserver["startFlow"]>;
      try {
        inner = user?.startFlow(structuredClone(definition), structuredClone(run));
      } catch {
        /* Recording cannot stop execution. */
      }
      return {
        update(next: FlowRun) {
          latest = next;
          try {
            // Recording consumers cannot alter the comparison's private snapshot.
            inner?.update(structuredClone(next));
          } catch {
            /* Best effort capture. */
          }
        },
        request(link, onTrace, callback) {
          const stepId = link.stepId;
          // Capture the runner's result even if recording skips, throws or substitutes it.
          const result = observeRequest(
            callback,
            inner
              ? (callOnce) => inner.request({ ...link }, onTrace, callOnce)
              : undefined,
          );
          // A separate subscriber; the runner awaits the original result unchanged.
          const capture = Promise.resolve(result).then(
            // Observers may retain the result and mutate it on later run updates.
            (body) => bodies.set(stepId, structuredClone(body)),
            () => undefined, // The runner reports the failure.
          );
          // Handle snapshot failures now, then surface them after successful execution.
          void capture.catch(() => {});
          captures.push(capture);
          return result;
        },
      };
    },
  };
  const result = await flow.run(input, { ...options, devtools });
  await Promise.all(captures);
  return {
    outcome: result.outcome,
    ...(result.value !== undefined ? { value: result.value } : {}),
    ...(latest ? { run: latest } : {}),
    bodies,
  };
}

/**
 * Visits both runs' nodes in flowFixture's order: definition order, and at a map or loop
 * its items by ascending index, each item walked whole before the next.
 */
function walk(
  definition: FlowDefinition,
  recorded: FlowRun | undefined,
  live: FlowRun | undefined,
  visit: (node: FlowNode, id: string, r?: FlowStep, l?: FlowStep) => void,
  prefix = "",
): void {
  const items = (step: FlowStep | undefined) =>
    new Map(
      (step?.collection?.items ?? []).flatMap((item) =>
        item.run ? [[item.index, item.run] as const] : [],
      ),
    );
  for (const node of definition.nodes) {
    const r = recorded?.steps[node.id],
      l = live?.steps[node.id];
    if (node.itemDefinition) {
      const before = items(r),
        after = items(l);
      // Items complete in any order, so walk them by index.
      for (const index of union(before.keys(), after.keys()).sort(
        (a, b) => a - b,
      ))
        walk(
          node.itemDefinition,
          before.get(index),
          after.get(index),
          visit,
          `${prefix}${node.id}/${index}/`,
        );
    }
    visit(node, prefix + node.id, r, l);
  }
}

type Leaf = { path: string[]; value: AnswerValue };
/** Scalar leaves of an answer, by path segments, without the type discriminator. */
function leaves(value: unknown, path: string[] = [], out: Leaf[] = []): Leaf[] {
  if (!value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    if (!path.length && key === "type") continue;
    if (child && typeof child === "object") leaves(child, [...path, key], out);
    else if (
      child === null ||
      typeof child === "string" ||
      typeof child === "number" ||
      typeof child === "boolean"
    )
      out.push({ path: [...path, key], value: child });
  }
  return out;
}
/** Dotted for plain keys; keys with dots, brackets or quotes are bracketed so paths stay distinct. */
const fieldName = (path: string[]) =>
  path.reduce(
    (name, key) =>
      key && !/[.[\]"]/.test(key)
        ? name + (name ? "." : "") + key
        : `${name}[${JSON.stringify(key)}]`,
    "",
  );
const byPath = (leaves: Leaf[]) =>
  new Map(leaves.map((leaf) => [JSON.stringify(leaf.path), leaf]));

const answersOf = (body: unknown): Record<string, unknown> =>
  record(body) && record(body.answers) ? body.answers : {};

/** Recorded keys first, then keys only the live side has. */
const union = <K>(recorded: Iterable<K>, live: Iterable<K>) => [
  ...new Set([...recorded, ...live]),
];

function compareAnswers(
  stepId: string,
  recordedBody: unknown,
  liveBody: unknown,
  tolerance: number,
): AnswerChange[] {
  const recorded = answersOf(recordedBody),
    live = answersOf(liveBody),
    changes: AnswerChange[] = [];
  for (const question of union(Object.keys(recorded), Object.keys(live))) {
    const before = byPath(leaves(recorded[question])),
      after = byPath(leaves(live[question]));
    for (const key of union(before.keys(), after.keys())) {
      const r = before.get(key)?.value,
        l = after.get(key)?.value;
      const leaf = before.get(key) ?? after.get(key);
      if (!leaf) continue; // Every key comes from one of the two maps.
      const change: AnswerChange = {
        stepId,
        question,
        field: fieldName(leaf.path),
        changed: false,
      };
      if (before.has(key)) change.recorded = r;
      if (after.has(key)) change.live = l;
      if (typeof r === "number" && typeof l === "number") {
        const delta = l - r;
        if (!Number.isFinite(r) || !Number.isFinite(l))
          change.changed = !Object.is(r, l);
        else if (!Number.isFinite(delta))
          change.changed = true; // Overflow: never read as unchanged.
        else {
          change.delta = delta;
          // Allow float noise at the boundary (0.4 - 0.3 is 0.10000000000000003).
          change.changed =
            Math.abs(delta) > tolerance + tolerance * 8 * Number.EPSILON;
        }
      } else change.changed = before.has(key) !== after.has(key) || r !== l;
      changes.push(change);
    }
  }
  return changes;
}

/**
 * Replays `fixture` offline and runs the flow with `options.client` on the same input, then
 * reports what changed. Only the live run reaches `options.devtools`. Tasks run on both
 * sides, the recorded side on the replayed answers. Rejects when the
 * fixture cannot replay this input, or with the live run's own error.
 */
export async function compareWithFixture<T>(
  flow: ComparableFlow<T>,
  input: T,
  fixture: FlowFixture,
  options: FlowRunOptions & { tolerance?: number },
): Promise<FixtureComparison> {
  const { tolerance = 0, ...runOptions } = options;
  if (!Number.isFinite(tolerance) || tolerance < 0)
    throw new TypeError("tolerance must be a non-negative finite number");
  // Outside the try, so an invalid fixture rejects with replayClient's own TypeError.
  const client = replayClient(fixture);
  let recorded: Side;
  try {
    recorded = await observe(flow, input, {
      client,
      ...(runOptions.signal ? { signal: runOptions.signal } : {}),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["AbortError", "APIUserAbortError"].includes(error.name)
    )
      throw error;
    throw new Error(
      `Fixture replay failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const live = await observe(flow, input, runOptions);

  const decisions: FixtureComparison["decisions"] = [],
    answers: AnswerChange[] = [],
    onlyRecorded: string[] = [],
    onlyLive: string[] = [],
    steps: Record<string, unknown> = {};
  walk(flow.definition, recorded.run, live.run, (node, id, rs, ls) => {
    // Merges copy their if()'s decision and loops keep their last while(); neither counts.
    if (node.kind === "branch" || node.kind === "if") {
      const r = rs?.decision,
        l = ls?.decision;
      if (r !== undefined || l !== undefined)
        decisions.push({
          stepId: id,
          ...(r !== undefined ? { recorded: r } : {}),
          ...(l !== undefined ? { live: l } : {}),
          changed: r !== l,
        });
      return;
    }
    if (node.kind !== "jev") return;
    // Item status is under the bare id; bodies arrive under the composed id.
    const inRecorded = rs?.status === "completed" && recorded.bodies.has(id),
      inLive = ls?.status === "completed" && live.bodies.has(id);
    if (inLive) steps[id] = structuredClone(live.bodies.get(id));
    if (inRecorded && inLive)
      answers.push(
        ...compareAnswers(
          id,
          recorded.bodies.get(id),
          live.bodies.get(id),
          tolerance,
        ),
      );
    else if (inRecorded) onlyRecorded.push(id);
    else if (inLive) onlyLive.push(id);
  });
  const outcome = {
    recorded: recorded.outcome,
    live: live.outcome,
    changed: recorded.outcome !== live.outcome,
  };
  const value = {
    ...(recorded.value !== undefined ? { recorded: recorded.value } : {}),
    ...(live.value !== undefined ? { live: live.value } : {}),
    changed: !isDeepStrictEqual(recorded.value, live.value),
  };
  return {
    changed:
      outcome.changed ||
      value.changed ||
      decisions.some((d) => d.changed) ||
      onlyRecorded.length > 0 ||
      onlyLive.length > 0,
    outcome,
    value,
    decisions,
    answers,
    steps: { onlyRecorded, onlyLive },
    liveFixture: { version: 1, flow: flow.definition.name, steps },
  };
}

/** JSON for ordinary values; never throws on BigInt, cycles, functions or symbols. */
function json(v: unknown): string {
  if (v === undefined) return "(none)";
  try {
    const text = JSON.stringify(v) as string | undefined;
    if (text !== undefined) return text;
  } catch {
    /* Not plain JSON; render it below. */
  }
  try {
    return loose(v, new Set()) ?? `[${typeof v}]`;
  } catch {
    return "[unserializable]";
  }
}
/** JSON.stringify's layout, with BigInt as 1n, cycles as [cycle] and other values by type. */
function loose(v: unknown, ancestors: Set<object>): string | undefined {
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "function" || typeof v === "symbol") return `[${typeof v}]`;
  if (v === undefined) return undefined;
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (ancestors.has(v)) return "[cycle]";
  const toJSON = (v as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === "function") return loose(toJSON.call(v), ancestors);
  ancestors.add(v);
  const text = Array.isArray(v)
    ? `[${v.map((item) => loose(item, ancestors) ?? "null").join(",")}]`
    : `{${Object.entries(v)
        .flatMap(([key, item]) => {
          const shown = loose(item, ancestors);
          return shown === undefined ? [] : [`${JSON.stringify(key)}:${shown}`];
        })
        .join(",")}}`;
  ancestors.delete(v);
  return text;
}
/** Report text beyond this many characters is cut; the comparison keeps values in full. */
const LIMIT = 160;
/** Up to LIMIT characters from start, marking cut ends; never splits a surrogate pair. */
function cut(text: string, start: number): string {
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start])) start--;
  if (start === 0 && text.length <= LIMIT) return text;
  let end = Math.min(start + LIMIT, text.length);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return `${start ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""} (${text.length} chars)`;
}
/** Cuts both sides alike; when the first difference is past the cut, both show a window around it. */
function clipPair(a: string, b: string): [string, string] {
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at++;
  const start =
    a !== b && a.length > LIMIT && b.length > LIMIT && at >= LIMIT - 1
      ? at - 40
      : 0;
  return [cut(a, start), cut(b, start)];
}
const route = (v: boolean | undefined) =>
  v === undefined ? "(not run)" : v ? "then" : "else";
/** Fixed decimals, or undefined for the shortest exact form. */
type Digits = number | undefined;
const scalar = (v: AnswerValue | undefined, digits: Digits) =>
  v === undefined
    ? "(none)"
    : typeof v === "number" && digits !== undefined
      ? v.toFixed(digits)
      : String(v);
/** Two decimals, more when two different numbers would print the same, else exact. */
function precision(
  a: AnswerValue | undefined,
  b: AnswerValue | undefined,
): Digits {
  if (typeof a !== "number" || typeof b !== "number" || a === b) return 2;
  for (let digits = 2; digits <= 20; digits++)
    if (a.toFixed(digits) !== b.toFixed(digits)) return digits;
  return undefined;
}
function signed(delta: number, digits: Digits): string {
  const sign = delta < 0 ? "-" : "+";
  if (digits !== undefined)
    for (; digits <= 20; digits++)
      if (delta === 0 || Number(delta.toFixed(digits)) !== 0)
        return sign + Math.abs(delta).toFixed(digits);
  return sign + String(Math.abs(delta));
}

/** One plain line per change, or "no changes from fixture". */
export function formatComparison(comparison: FixtureComparison): string {
  const lines: string[] = [];
  const { outcome, value, decisions, steps, answers } = comparison;
  if (outcome.changed)
    lines.push(`outcome: ${outcome.recorded} -> ${outcome.live}`);
  if (value.changed) {
    const [recorded, live] = clipPair(json(value.recorded), json(value.live));
    lines.push(`value: ${recorded} -> ${live}`);
  }
  for (const d of decisions)
    if (d.changed)
      lines.push(
        `decision ${d.stepId}: ${route(d.recorded)} -> ${route(d.live)}`,
      );
  for (const id of steps.onlyRecorded) lines.push(`step ${id}: recorded only`);
  for (const id of steps.onlyLive) lines.push(`step ${id}: live only`);
  for (const a of answers) {
    if (!a.changed) continue;
    const digits = precision(a.recorded, a.live);
    const [recorded, live] = clipPair(
      scalar(a.recorded, digits),
      scalar(a.live, digits),
    );
    lines.push(
      `${fieldName([a.stepId, a.question])}${a.field.startsWith("[") ? "" : "."}${a.field}: ${recorded} -> ${live}` +
        (a.delta !== undefined ? ` (${signed(a.delta, digits)})` : ""),
    );
  }
  return lines.length ? lines.join("\n") : "no changes from fixture";
}
