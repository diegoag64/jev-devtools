import React, { Profiler, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { JevDevtools } from "jev-devtools";
const root = createRoot(document.getElementById("root"));
const $ = (id) => document.getElementById(id);
const shadow = () => document.querySelector("jev-devtools-root")?.shadowRoot;
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stats = (values) => {
  const v = [...values].sort((a, b) => a - b);
  const at = (p) => v[Math.max(0, Math.ceil(v.length * p) - 1)] ?? 0;
  return { n: v.length, median: at(0.5), p95: at(0.95), max: at(1) };
};
const report = {
  timestamp: new Date().toISOString(),
  environment: {
    userAgent: navigator.userAgent,
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    production: true,
  },
  mounts: [],
  streams: [],
  reopens: [],
  interactions: [],
};
const commits = [];
let longTasks = [],
  eventTimings = [],
  actionTimes = [],
  gaps = [],
  lastFrame = 0,
  current = "small",
  generation = 0,
  busy = false;
const supported = PerformanceObserver.supportedEntryTypes;
if (supported.includes("longtask"))
  new PerformanceObserver((list) =>
    longTasks.push(
      ...list
        .getEntries()
        .map((e) => ({ start: e.startTime, duration: e.duration })),
    ),
  ).observe({ type: "longtask", buffered: true });
if (supported.includes("event"))
  new PerformanceObserver((list) =>
    eventTimings.push(
      ...list
        .getEntries()
        .filter((e) => e.interactionId && e.target?.getRootNode() === shadow())
        .map((e) => ({
          name: e.name,
          duration: e.duration,
          start: e.startTime,
          inputDelay: e.processingStart - e.startTime,
          processing: e.processingEnd - e.processingStart,
        })),
    ),
  ).observe({ type: "event", durationThreshold: 16, buffered: true });
function frames(t) {
  if (lastFrame) gaps.push({ start: lastFrame, duration: t - lastFrame });
  lastFrame = t;
  requestAnimationFrame(frames);
}
requestAnimationFrame(frames);
function attachInteractions() {
  const s = shadow();
  if (!s) return;
  for (const type of [
    "pointerdown",
    "pointerup",
    "wheel",
    "keydown",
    "input",
    "click",
  ])
    s.addEventListener(
      type,
      (event) => {
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            actionTimes.push({
              type,
              start,
              duration: performance.now() - start,
              target:
                event.target.getAttribute?.("aria-label") ||
                event.target.className?.baseVal ||
                event.target.className,
            }),
          ),
        );
      },
      { capture: true, passive: true },
    );
}
function windowMetrics(start, end = performance.now()) {
  const frames = gaps
    .filter((e) => e.start >= start && e.start < end)
    .map((e) => e.duration);
  const tasks = longTasks.filter((e) => e.start >= start && e.start < end);
  return {
    elapsedMs: end - start,
    frames: stats(frames),
    frameGapsOver34Ms: frames.filter((v) => v > 34).length,
    longTasks: tasks.length,
    longTaskMs: tasks.reduce((n, e) => n + e.duration, 0),
    longestTaskMs: Math.max(0, ...tasks.map((e) => e.duration)),
    visibility: document.visibilityState,
    ...(__BENCH_PROFILE__
      ? {
          commits: commits.filter((c) => c.start >= start && c.start < end),
        }
      : {}),
  };
}
async function save() {
  await fetch("/bench/results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
  });
}
function show(value) {
  $("metrics").textContent = JSON.stringify(value, null, 2);
}
const cases = await (await fetch("/bench/info")).json();
report.transportMode = cases[0].transportMode;
report.revision = cases[0].revision;
report.profiling = cases[0].profiling;
$("scenario").innerHTML = cases
  .map(
    (c) =>
      `<option value="${c.id}">${c.id} (${c.history} requests, ${c.choices} categories, ${c.questions} questions)</option>`,
  )
  .join("");
function choiceReady(s, count) {
  return (
    s?.querySelectorAll(".lab-output").length === count ||
    (s?.querySelectorAll(".lab-output").length > 0 &&
      [...s.querySelectorAll("button")].some(
        (b) => b.textContent === `All probabilities (${count})`,
      ))
  );
}
// Exercise the public prop without unmounting or reconnecting the inspector.
// The control belongs to this verification host, not the package drawer.
function InspectorFixture(props) {
  const [redact, setRedact] = useState(undefined);
  useEffect(() => {
    const control = $("display-redaction");
    control.value = "default";
    const change = () =>
      setRedact(
        control.value === "default" ? undefined : control.value === "on",
      );
    control.addEventListener("change", change);
    return () => control.removeEventListener("change", change);
  }, []);
  return <JevDevtools {...props} redactAdditionalSensitiveData={redact} />;
}
async function load(id, closed = false) {
  current = id;
  const spec = cases.find((s) => s.id === id);
  const start = performance.now();
  const inspector = (
    <InspectorFixture
      key={++generation}
      enabled
      endpoint={"/api/" + id}
      defaultOpen={!closed}
    />
  );
  root.render(
    __BENCH_PROFILE__ ? (
      <Profiler
        id="inspector"
        onRender={(
          _id,
          phase,
          actualDuration,
          baseDuration,
          start,
          commitTime,
        ) => {
          commits.push({
            phase,
            actualDuration,
            baseDuration,
            start,
            commitTime,
          });
        }}
      >
        {inspector}
      </Profiler>
    ) : (
      inspector
    ),
  );
  let ready = false;
  while (performance.now() - start < 30000) {
    await frame();
    const s = shadow();
    if (
      closed
        ? s?.querySelector(".jev-drawer-trigger")?.hidden === false
        : s?.querySelectorAll(".request-row").length === spec.history &&
          choiceReady(s, spec.choices) &&
          s.querySelector(".detail-header h2")?.textContent ===
            `Sample ${spec.history}`
    ) {
      ready = true;
      break;
    }
  }
  if (!ready) throw new Error("Timed out loading " + id);
  await frame();
  await frame();
  const readyMs = performance.now() - start;
  attachInteractions();
  const s = shadow();
  const result = {
    scenario: id,
    closed,
    readiness: closed ? "launcher" : "latest response",
    snapshotBytes: spec.bytes,
    readyAfterTwoFramesMs: readyMs,
    ...windowMetrics(start),
    domElements: s.querySelectorAll("*").length,
    rows: s.querySelectorAll(".request-row").length,
    outputs: s.querySelectorAll(".lab-output").length,
    animatedDots: s.querySelectorAll("animateMotion").length,
    canvasHeight: s.querySelector(".lab-flow-canvas")?.style.height,
    zoom: s.querySelector('[aria-label="Diagram zoom"]')?.textContent,
    viewport: [innerWidth, innerHeight],
    drawerHeight: s.querySelector(".jev-drawer").getBoundingClientRect().height,
  };
  const idleStart = performance.now();
  await pause(1000);
  result.idle = windowMetrics(idleStart);
  return result;
}
async function operation(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
    await save();
  } catch (e) {
    $("status").textContent = String(e);
  } finally {
    busy = false;
  }
}
$("suite").onclick = () =>
  operation(async () => {
    for (let repeat = 0; repeat < 3; repeat++)
      for (const spec of cases) {
        $("status").textContent = `Mount ${repeat + 1}/3: ${spec.id}`;
        // Unmount between samples so a previous dataset cannot satisfy readiness.
        root.render(null);
        await frame();
        await frame();
        const result = await load(spec.id);
        report.mounts.push({ repeat, ...result });
        show(result);
        await save();
      }
    $("status").textContent = "Mount suite complete";
  });
$("load").onclick = () =>
  operation(async () => {
    root.render(null);
    await frame();
    await frame();
    const result = await load($("scenario").value, $("closed").checked);
    report.mounts.push(result);
    show(result);
    $("status").textContent = "Loaded " + current;
  });
async function stream() {
  const live = report.transportMode === "adapter";
  const before = live ? await (await fetch("/bench/counters")).json() : null;
  const start = performance.now();
  let sent = 0,
    bytes = 0,
    pulses = 0,
    calls = 0,
    expectedRequestId;
  $("status").textContent = "Streaming " + current;
  // Serial scheduling avoids unbounded test-harness queues; report achieved rate, not just target.
  for (let i = 0; i < (live ? 5 : 25); i++) {
    const due = start + i * (live ? 1000 : 200);
    await pause(Math.max(0, due - performance.now()));
    const r = await (await fetch("/bench/pulse", { method: "POST" })).json();
    sent += r.sent;
    bytes += r.bytes;
    pulses++;
    calls += r.calls || 0;
    expectedRequestId = r.completed?.[current];
  }
  await pause(Math.max(250, start + 5050 - performance.now()));
  if (live) {
    const after = await (await fetch("/bench/counters")).json();
    sent = after.sent - before.sent;
    bytes = after.bytes - before.bytes;
  }
  const visibleRequestId = shadow()?.querySelector(
    ".detail-meta code:last-child",
  )?.textContent;
  const closed = !!shadow()?.querySelector(".jev-drawer")?.hidden;
  if (
    live &&
    !closed &&
    (visibleRequestId !== expectedRequestId ||
      !shadow()
        ?.querySelector(".detail-header .eyebrow")
        ?.textContent.includes("success"))
  )
    throw new Error("Latest completed response was not rendered");
  const result = {
    scenario: current,
    expectedRequestId,
    visibleRequestId,
    closed,
    pulses,
    calls,
    sent,
    bytes,
    ...windowMetrics(start),
  };
  result.achievedHz = sent / (result.elapsedMs / 1000);
  report.streams.push(result);
  show(result);
  $("status").textContent = "Stream complete";
}
$("stream").onclick = () => operation(stream);
$("reopen").onclick = () =>
  operation(async () => {
    const start = performance.now();
    const expectedRequestId = report.streams.at(-1)?.expectedRequestId;
    if (!expectedRequestId)
      throw new Error("Run a sample stream before reopening");
    shadow().querySelector('[aria-label="Open Jev DevTools"]').click();
    let ready = false;
    while (performance.now() - start < 30000) {
      await frame();
      const s = shadow();
      if (
        !s.querySelector(".jev-drawer").hidden &&
        s.querySelector(".detail-meta code:last-child")?.textContent ===
          expectedRequestId &&
        s
          .querySelector(".detail-header .eyebrow")
          ?.textContent.includes("success") &&
        choiceReady(s, cases.find((c) => c.id === current).choices)
      ) {
        ready = true;
        break;
      }
    }
    if (!ready)
      throw new Error("Reopening did not show the latest completed response");
    await frame();
    await frame();
    const result = {
      scenario: current,
      expectedRequestId,
      readyAfterTwoFramesMs: performance.now() - start,
      ...windowMetrics(start),
    };
    report.reopens.push(result);
    show(result);
    $("status").textContent = "Reopen complete";
  });
$("stream-suite").onclick = () =>
  operation(async () => {
    for (const [id, closed] of report.transportMode === "adapter"
      ? [
          ["max-history", false],
          ["combined", false],
        ]
      : [
          ["default-history", false],
          ["max-history", false],
          ["large-state", false],
          ["combined", false],
          ["combined", true],
        ]) {
      root.render(null);
      await frame();
      await frame();
      await load(id, closed);
      for (let repeat = 0; repeat < 3; repeat++) {
        await stream();
        await save();
      }
    }
    $("status").textContent = "Streaming suite complete";
  });
$("stream").textContent =
  report.transportMode === "adapter"
    ? "Run 1 sample call/sec for 5 seconds"
    : "Stream at 5 Hz for 5 seconds";
$("status").textContent =
  "Ready · " + report.transportMode + " · " + report.revision;
let interactionStart = performance.now();
$("reset").onclick = () => {
  interactionStart = performance.now();
  actionTimes = [];
  eventTimings = [];
  $("status").textContent = "Measuring real interactions in " + current;
};
$("save").onclick = () =>
  operation(async () => {
    const end = performance.now();
    const result = {
      scenario: current,
      ...windowMetrics(interactionStart, end),
      actions: actionTimes
        .filter((e) => e.start >= interactionStart && e.start < end)
        .map((e) => ({ ...e })),
      eventTimings: eventTimings
        .filter((e) => e.start >= interactionStart && e.start < end)
        .map((e) => ({ ...e })),
    };
    report.interactions.push(result);
    show(result);
    $("status").textContent = "Measurements saved";
  });

// Shared interaction protocol for baseline and virtualized implementations.
const questionScroller = () =>
  shadow().querySelector(".questions-viewport") ||
  shadow().querySelector(".detail-body");
const questionCards = () => [
  ...shadow().querySelectorAll(".question-node.standalone"),
];
const inView = (card) => {
  if (!card) return false;
  const a = card.getBoundingClientRect(),
    b = questionScroller().getBoundingClientRect();
  return a.bottom > b.top && a.top < b.bottom;
};
async function questionAction(action) {
  let previewSteps = 0;
  const spec = cases.find((s) => s.id === current);
  const start = performance.now();
  if (action === "open") {
    [...shadow().querySelectorAll(".detail-tabs button")]
      .find((b) => b.textContent === "Questions")
      .click();
  } else if (action === "flow") {
    [...shadow().querySelectorAll(".detail-tabs button")]
      .find((b) => b.textContent === "Flow")
      .click();
    await frame();
    await frame();
    $("status").textContent = "Questions flow complete";
    return;
  } else if (action === "sweep") {
    // Fixed 120 scroll positions at two-frame intervals; same input on both builds.
    for (let i = 0; i <= 120; i++) {
      const el = questionScroller();
      el.scrollTop = ((el.scrollHeight - el.clientHeight) * i) / 120;
      await frame();
      await frame();
      if (questionScroller().querySelector('article[aria-busy="true"]'))
        previewSteps++;
    }
  } else if (action === "read") {
    // Reading pace: 40 px per two frames, below the rapid-scan threshold.
    questionScroller().scrollTop = 0;
    await pause(200);
    for (let i = 0; i <= 120; i++) {
      questionScroller().scrollTop = i * 40;
      await frame();
      await frame();
      if (questionScroller().querySelector('article[aria-busy="true"]'))
        previewSteps++;
    }
  } else {
    const el = questionScroller();
    el.scrollTop = action === "last" ? el.scrollHeight : 0;
  }
  const target =
    action === "read"
      ? null
      : action === "last" || action === "sweep"
        ? spec.questions - 1
        : 0;
  let ready = false;
  while (performance.now() - start < 30000) {
    await frame();
    const card = questionCards().find((c) =>
      target === null
        ? inView(c)
        : c.querySelector("h3")?.textContent === `question_${target}`,
    );
    if (inView(card) && card.querySelector(".answer")) {
      ready = true;
      break;
    }
  }
  if (!ready)
    throw new Error(`Question ${target} was not reachable during ${action}`);
  await frame();
  await frame();
  const result = {
    scenario: current,
    action,
    target,
    previewSteps,
    readyAfterTwoFramesMs: performance.now() - start,
    mountedQuestions: questionCards().length,
    questionElements: questionCards().reduce(
      (n, c) => n + c.querySelectorAll("*").length + 1,
      0,
    ),
    ...windowMetrics(start),
  };
  (report.questions ??= []).push(result);
  show(result);
  $("status").textContent = `Questions ${action} complete`;
}
for (const action of ["open", "flow", "first", "last", "sweep", "read"])
  $(`questions-${action}`).onclick = () =>
    operation(() => questionAction(action));
