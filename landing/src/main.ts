import "./style.css";
import {
  drawerShowcase,
  flowApiShowcase,
  setupProductShowcases,
} from "./product-showcases";
import { flows, type Card, type Edge, type Flow } from "./flows";

const DOCS = "https://docs.jevtools.dev";
const GITHUB = "https://github.com/diegoag64/jev-devtools";
const logo =
  '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 7h9v9h9v9h-9v-9H7z" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="3" fill="currentColor"/><circle cx="25" cy="25" r="3" fill="currentColor"/></svg>';
const github =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0 1 12 6.82c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>';
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="site-header wrap">
    <a class="wordmark" href="#" aria-label="JevTools home">${logo}<span>jev<span class="wordmark-light">tools</span><span class="wordmark-dot">.</span></span></a>
    <nav aria-label="Main navigation"><a href="#flows">Explore the flows</a><a href="${DOCS}">Docs</a><a class="nav-github" href="${GITHUB}" aria-label="Jev DevTools on GitHub">${github}<span>GitHub</span></a></nav>
  </header>
  <main id="main">
    <section class="hero wrap" aria-labelledby="hero-title">
      <h1 id="hero-title">Visualize your<br /><span>System One flows.</span></h1>
      <p class="hero-description">Models, primitives, and your code. One clear picture.<br class="desktop-break" /> Make complex Jev flows easy to understand.</p>
      <div class="hero-actions"><a class="button primary" href="${DOCS}">Read the Docs</a><a class="button secondary" href="${GITHUB}">${github} View on GitHub</a></div>
    </section>
    <section id="flows" class="flow-stage wrap" aria-label="Animated flow examples" aria-roledescription="carousel">
      <div class="diagram-scroll" tabindex="0" role="region" aria-label="Flow diagram; scroll horizontally on small screens"><svg id="diagram" viewBox="0 0 1140 520" role="img"></svg></div>
      <div class="flow-caption">
        <div class="flow-caption-copy"><p><span id="flow-number" class="flow-number"></span><span id="flow-name"></span><span class="sample-label">Simulated flow</span></p><p id="flow-description"></p></div>
        <div class="playback"><button id="previous" aria-label="Previous flow" title="Previous flow">Previous</button><button id="play" aria-label="Pause animation" title="Pause animation">Ⅱ</button><button id="next" aria-label="Next flow" title="Next flow">Next</button></div>
      </div>
      <p class="mobile-hint">Swipe to explore the diagram <span aria-hidden="true">↔</span></p>
      <span id="flow-announcement" class="sr-only" role="status"></span>
    </section>
    ${drawerShowcase}
    <section class="primitives-section wrap" aria-labelledby="primitives-title">
      <div class="section-heading"><div><h2 id="primitives-title">Every answer has a shape.</h2></div><p>Inspect what the model returned.<br />Understand what your application did next.</p></div>
      <div class="primitive-grid">
        <article class="primitive"><div class="primitive-title"><span class="primitive-symbol">◈</span><h3>Choice</h3><span class="mono">01</span></div><p>A distribution over competing options.</p><div class="choice-rows"><div><span>Billing</span><b>76%</b><i style="--value:76%"></i></div><div><span>Delivery</span><b>18%</b><i style="--value:18%"></i></div><div><span>Other</span><b>6%</b><i style="--value:6%"></i></div></div></article>
        <article class="primitive"><div class="primitive-title"><span class="primitive-symbol">◐</span><h3>Noul</h3><span class="mono">02</span></div><p>The probability that an answer is yes.</p><div class="noul-value">0.94<span>probability of yes</span></div><div class="noul-track"><i></i></div><div class="scale-labels"><span>No</span><span>Uncertain</span><span>Yes</span></div></article>
        <article class="primitive"><div class="primitive-title"><span class="primitive-symbol">▥</span><h3>Score</h3><span class="mono">03</span></div><p>A distribution across ordered criteria.</p><div class="score-chart" role="img" aria-label="Sample ordered probabilities: low 10%, medium 25%, high 65%. Expected index 1.55 out of 2."><div><i style="--value:15%"></i><span>Low</span></div><div><i style="--value:38%"></i><span>Med</span></div><div><i style="--value:100%"></i><span>High</span></div><strong>1.55<small>of 2</small></strong></div></article>
        <article class="primitive"><div class="primitive-title"><span class="primitive-symbol">⌗</span><h3>Box</h3><span class="mono">04</span></div><p>A region, expressed as coordinates.</p><div class="box-scene" role="img" aria-label="Illustrative box around a mug; coordinates do not establish object presence."><svg viewBox="0 0 200 110" aria-hidden="true"><path d="M75 38h43v42q-22 12-43 0Z" fill="#5e4359"/><path d="M118 45h10q17 15-10 24" fill="none" stroke="#78516c" stroke-width="5"/><path d="M84 26q-7-8 0-16m17 16q-7-8 0-16" fill="none" stroke="#61505c" stroke-width="2"/><rect x="63" y="29" width="78" height="64" rx="2" fill="none" stroke="#e551ba" stroke-dasharray="4 3"/><path d="M63 39V29h10m58 0h10v10M63 83v10h10m58 0h10V83" fill="none" stroke="#f28dce" stroke-width="2"/></svg><span>REGION / SAMPLE</span></div></article>
      </div>
      <p class="primitive-disclaimer">All values above are illustrative samples, not live model results.</p>
    </section>
    ${flowApiShowcase}
    <section class="integration wrap" aria-labelledby="integration-title">
      <div class="integration-copy"><h2 id="integration-title">Keep your code.<br />See the connections.</h2><p>Mount the React drawer, connect a server adapter, and inspect your Jev requests right where you build. Add connected flows when you need the whole picture.</p><a class="text-link" href="${DOCS}">Find your integration guide</a><div class="integration-tags"><span>React 18 / 19</span><span>Next.js App Router</span></div></div>
      <div class="code-window"><div class="code-heading"><span><span class="code-dot"></span> Your application</span><span>React / Vite</span></div><div class="install-command"><code>npm install jev-devtools @typesafe-ai/sdk</code><button id="copy" aria-label="Copy install command" title="Copy install command">Copy</button></div><pre><code><span class="syntax-purple">import</span> { JevDevtools } <span class="syntax-purple">from</span> <span class="syntax-green">'jev-devtools'</span>;

<span class="syntax-purple">export function</span> <span class="syntax-pink">Root</span>() {
  <span class="syntax-purple">return</span> (
    &lt;&gt;
      &lt;<span class="syntax-pink">App</span> /&gt;
      &lt;<span class="syntax-pink">JevDevtools</span> enabled={import.meta.env.DEV} /&gt;
    &lt;/&gt;
  );
}</code></pre><p class="code-note">The browser side is this small. The integration guide covers the server adapter and request capture.</p><span class="sr-only" id="copy-status" role="status"></span></div>
    </section>
    <section class="closing section-band" data-theme="plum"><div class="wrap"><h2>Complex flows.<br /><span>Clear understanding.</span></h2><p>Open source, actively evolving, and ready for your next idea.<br />Explore the docs. Try it in your app. Help shape what’s next.</p><div class="hero-actions"><a class="button primary" href="${DOCS}">Explore the docs</a><a class="text-link" href="${GITHUB}">Build with us</a></div><span class="experimental">Experimental software. APIs may evolve before 1.0.</span></div></section>
  </main>
  <footer class="site-footer wrap"><p>Jev DevTools is an independent, open-source community project. It is not affiliated with TypeSafe AI.</p></footer>
`;

const svg = document.querySelector<SVGSVGElement>("#diagram")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let selected = 0;
let elapsed = 0;
let paused = reducedMotion.matches;
let lastFrame = 0;
let frame = 0;
let inView = true;
const DURATION = 6.6;
const CYCLE = 11;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const icons = { input: "↳", jev: "◈", code: "ƒ", output: "↗" };
const labels = {
  input: "INPUT",
  jev: "SYSTEM ONE",
  code: "CODE",
  output: "OUTPUT",
};
function card(n: Card) {
  return `<g class="flow-node ${n.kind}${n.muted ? " inactive" : ""}" transform="translate(${n.x} ${n.y})" data-at="${n.at}"><rect class="node-surface" width="214" height="112" rx="8"/><text class="node-type" x="15" y="22">${icons[n.kind]}  ${labels[n.kind]}</text><circle class="node-indicator" cx="196" cy="18" r="3"/><text class="node-title" x="15" y="46">${escape(n.title)}</text><text class="node-subtitle" x="15" y="65">${escape(n.subtitle)}</text>${(n.rows ?? []).map(([label, value, probability]) => `<text class="node-detail" x="15" y="90">${escape(label)}</text><text class="node-value" x="199" y="90" text-anchor="end">${escape(value)}</text>${probability !== undefined ? `<rect class="node-track" x="15" y="99" width="184" height="3" rx="1.5"/><rect class="node-probability" x="15" y="99" width="${184 * probability}" height="3" rx="1.5"/>` : ""}`).join("")}</g>`;
}
function connection(e: Edge, flow: Flow) {
  const a = flow.nodes.find((n) => n.id === e.from)!;
  const b = flow.nodes.find((n) => n.id === e.to)!;
  let x1 = a.x + 214,
    y1 = a.y + 56,
    x2 = b.x,
    y2 = b.y + 56;
  let path: string;
  let lx = (x1 + x2) / 2,
    ly = (y1 + y2) / 2 - 12;
  if (e.feedback) {
    x1 = a.x + 107;
    y1 = a.y + 112;
    x2 = b.x + 107;
    y2 = b.y + 112;
    path = `M${x1} ${y1} V370 Q${x1} 385 ${x1 - 20} 385 H${x2 + 20} Q${x2} 385 ${x2} 365 V${y2}`;
    lx = (x1 + x2) / 2;
    ly = 376;
  } else if (a.x === b.x) {
    x1 = a.x + 107;
    y1 = a.y + 112;
    x2 = b.x + 107;
    y2 = b.y;
    path = `M${x1} ${y1} V${y2}`;
    lx = x1 + 18;
  } else {
    const bend = Math.max(35, (x2 - x1) / 2);
    path = `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
  }
  const at = Math.max(0, b.at - 0.6);
  return `<g class="connection${e.inactive ? " inactive" : ""}" data-at="${e.feedback ? a.at + 0.3 : at}"><path class="edge-base" d="${path}"/><path class="edge-signal" d="${path}" pathLength="100"/>${e.label ? `<text class="edge-label" x="${lx}" y="${ly}" text-anchor="middle">${escape(e.label)}</text>` : ""}<circle class="edge-port" cx="${x1}" cy="${y1}" r="3"/><circle class="edge-port" cx="${x2}" cy="${y2}" r="3"/></g>`;
}
let timed: SVGElement[] = [];
function render() {
  const flow = flows[selected];
  el("flow-number").textContent =
    `${String(selected + 1).padStart(2, "0")} / 06`;
  el("flow-name").textContent = flow.label;
  el("flow-description").textContent = flow.description;
  svg.innerHTML = `<title>${escape(flow.label)} — simulated flow</title><desc>${escape(flow.description)} ${flow.nodes.map((n) => `${n.title}: ${n.subtitle}${n.muted ? " (inactive path)" : ""}`).join(". ")}. Fixed illustrative data; no inference is performed.</desc>${flow.group ? `<g class="flow-group"><rect x="${flow.group.x}" y="${flow.group.y}" width="${flow.group.w}" height="${flow.group.h}" rx="12"/><text x="${flow.group.x + 20}" y="${flow.group.y + 24}">${flow.group.label}</text></g>` : ""}${flow.edges.map((e) => connection(e, flow)).join("")}${flow.nodes.map(card).join("")}`;
  timed = [...svg.querySelectorAll<SVGElement>("[data-at]")];
  elapsed = reducedMotion.matches || paused ? DURATION : 0;
  lastFrame = 0;
  paint();
  schedule();
}
function paint() {
  for (const item of timed) {
    const at = Number(item.dataset.at);
    const reveal = Math.min(1, Math.max(0, (elapsed - at) / 0.7));
    item.style.opacity = String(0.08 + 0.92 * reveal);
    if (item.classList.contains("flow-node"))
      item.style.translate = `0 ${(1 - reveal) * 12}px`;
    item.classList.toggle("arrived", elapsed > at + 0.7);
  }
  // Hold the assembled flow before fading into the next authored example.
  svg.style.opacity = String(
    reducedMotion.matches
      ? 1
      : Math.min(1, Math.max(0, (CYCLE - elapsed) / 0.8)),
  );
  svg.classList.toggle(
    "motion-paused",
    paused || !inView || document.hidden || reducedMotion.matches,
  );
  el("play").textContent = paused ? "▶" : "Ⅱ";
  el("play").setAttribute(
    "aria-label",
    paused ? "Play animation" : "Pause animation",
  );
  el("play").title = reducedMotion.matches
    ? "Animation disabled by reduced-motion preference"
    : el("play").getAttribute("aria-label")!;
  (el("play") as HTMLButtonElement).disabled = reducedMotion.matches;
}
function schedule() {
  cancelAnimationFrame(frame);
  if (!paused && !reducedMotion.matches && !document.hidden && inView)
    frame = requestAnimationFrame(tick);
}
function tick(time: number) {
  if (lastFrame) elapsed += Math.min((time - lastFrame) / 1000, 0.1);
  lastFrame = time;
  if (elapsed >= CYCLE) {
    selected = (selected + 1) % flows.length;
    render();
    return;
  }
  paint();
  schedule();
}
function changeFlow(direction: number) {
  selected = (selected + direction + flows.length) % flows.length;
  render();
  el("flow-announcement").textContent =
    `${flows[selected].label}. ${flows[selected].description}`;
}
el("previous").addEventListener("click", () => changeFlow(-1));
el("next").addEventListener("click", () => changeFlow(1));
el("play").addEventListener("click", () => {
  paused = !paused;
  lastFrame = 0;
  paint();
  schedule();
});
reducedMotion.addEventListener("change", () => {
  paused = reducedMotion.matches;
  render();
});
document.addEventListener("visibilitychange", () => {
  lastFrame = 0;
  paint();
  schedule();
});
new IntersectionObserver((entries) => {
  inView = entries[0].isIntersecting;
  lastFrame = 0;
  paint();
  schedule();
}).observe(svg);
let copyTimer: ReturnType<typeof setTimeout>;
el("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(
      "npm install jev-devtools @typesafe-ai/sdk",
    );
    el("copy").textContent = "Copied";
    el("copy-status").textContent = "Install command copied.";
  } catch {
    el("copy-status").textContent =
      "Copy unavailable. Select and copy the install command.";
    el("copy").textContent = "Select text";
  }
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    el("copy").textContent = "Copy";
  }, 2400);
});
setupProductShowcases();
render();
