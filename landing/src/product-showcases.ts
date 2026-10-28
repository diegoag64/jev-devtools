const flowGuide = "https://docs.jevtools.dev/api/flow/";

export const drawerShowcase = `
<section id="drawer" class="drawer-showcase section-band" data-theme="plum" aria-labelledby="drawer-title">
  <div class="wrap">
  <div class="product-heading">
    <h2 id="drawer-title">System One Diagrams<br /><span>Anywhere in your App</span></h2>
    <div><p>Open the drawer to inspect request inputs, answers, and returned probabilities. View captured steps in a connected flow.</p><a class="text-link" href="https://docs.jevtools.dev">Add the drawer to your app</a></div>
  </div>
  <figure class="drawer-demo">
    <video id="drawer-video" controls playsinline muted preload="metadata" width="1920" height="1066" aria-label="Recorded demo of Jev DevTools in the React playground" aria-describedby="drawer-description">
      <source src="/media/jev-devtools-demo.mp4" type="video/mp4" />
      Your browser cannot play this video. <a href="/media/jev-devtools-demo.mp4">Open the drawer demo recording</a>.
    </video>
  </figure>
  <div class="drawer-details" id="drawer-description">
    <div><h3>Open the inspector</h3><p>Toggle the React drawer alongside your application UI.</p></div>
    <div><h3>Inspect request data</h3><p>Inspect questions, returned probabilities, shared context, transport details, and raw captured data.</p></div>
    <div><h3>Inspect flow steps</h3><p>Pan and zoom through connected flows to inspect captured steps and their results.</p></div>
  </div>
  </div>
</section>`;

export const flowApiShowcase = `
<section id="flow-api" class="flow-api-section section-band" data-theme="plum" aria-labelledby="flow-api-title">
  <div class="wrap">
  <div class="product-heading">
    <h2 id="flow-api-title">Code to diagrams<br /><span>via the Flow API</span></h2>
    <div><p>Use the Flow API to define System One requests and application logic in TypeScript. It supports functions, branches, parallel steps, maps, and loops. Inspect recorded runs as diagrams.</p><p>See how Jev requests and code form complete workflows in the <a href="https://playground.jevtools.dev/">Cookbook Playground</a>. Read the source beside each diagram and follow the step-by-step guides. No installation or API key needed.</p><a class="text-link" href="${flowGuide}">Explore the Flow API</a></div>
  </div>
  <div class="api-comparison">
    <div class="api-source code-window">
      <div class="code-heading"><span><span class="code-dot"></span> refund-review.ts</span><span>Server-side TypeScript</span></div>
      <pre><code><span class="syntax-purple">import</span> { noul } <span class="syntax-purple">from</span> <span class="syntax-green">"@typesafe-ai/sdk"</span>;
<span class="syntax-purple">import</span> { defineJevFlow } <span class="syntax-purple">from</span> <span class="syntax-green">"jev-devtools/flow"</span>;

<span class="syntax-purple">const</span> review = <span class="syntax-pink">defineJevFlow</span>&lt;{ message: string }&gt;(
  <span class="syntax-green">"refund-review"</span>, (flow) =&gt; {
    <span class="syntax-purple">const</span> check = flow.<span class="syntax-pink">jev</span>(<span class="syntax-green">"eligibility"</span>, {
      state: flow.input,
      questions: { eligible: <span class="syntax-pink">noul</span>(<span class="syntax-green">"Eligible for a refund?"</span>) },
    });

    <span class="syntax-purple">return</span> flow.<span class="syntax-pink">branch</span>(<span class="syntax-green">"route"</span>, {
      when: check.answer(<span class="syntax-green">"eligible"</span>).noul.<span class="syntax-pink">gte</span>(0.9),
      then: (path) =&gt; path.<span class="syntax-pink">output</span>(<span class="syntax-green">"approve"</span>),
      else: (path) =&gt; path.<span class="syntax-pink">output</span>(<span class="syntax-green">"manual-review"</span>),
    });
  },
);</code></pre>
    </div>
    <div class="api-result">
      <p class="api-result-label">Illustrative run</p>
      <svg id="api-diagram" viewBox="0 0 500 355" role="img" aria-labelledby="api-diagram-title api-diagram-description">
        <title id="api-diagram-title">Refund review flow</title>
        <desc id="api-diagram-description"></desc>
        <path class="api-connector" d="M250 94V147"/>
        <path id="api-approve-edge" class="api-route" d="M250 211V230Q250 242 238 242H129Q117 242 117 254V274"/>
        <path id="api-review-edge" class="api-route" d="M250 211V230Q250 242 262 242H371Q383 242 383 254V274"/>
        <g transform="translate(132 18)"><rect class="api-model-card" width="236" height="76" rx="8"/><text class="api-node-title" x="18" y="27">eligibility</text><text class="api-node-detail" x="18" y="49">Noul · eligible</text><text id="api-probability" class="api-node-value" x="218" y="49" text-anchor="end">0.94</text><rect class="api-probability-track" x="18" y="61" width="200" height="3" rx="1.5"/><rect id="api-probability-bar" x="18" y="61" width="188" height="3" rx="1.5"/></g>
        <text class="api-edge-description" x="262" y="126">returned answer</text>
        <g transform="translate(132 147)"><rect class="api-policy-card" width="236" height="64" rx="8"/><text class="api-node-title" x="18" y="26">route</text><text class="api-node-detail" x="18" y="46">your code · eligible ≥ 0.90</text></g>
        <text class="api-edge-description" x="139" y="264">then</text><text class="api-edge-description" x="332" y="264">else</text>
        <g id="api-approve-node" class="api-outcome" transform="translate(22 274)"><rect width="190" height="60" rx="8"/><text class="api-node-title" x="17" y="26">approve</text><text class="api-outcome-state" x="17" y="45"></text></g>
        <g id="api-review-node" class="api-outcome" transform="translate(288 274)"><rect width="190" height="60" rx="8"/><text class="api-node-title" x="17" y="26">manual-review</text><text class="api-outcome-state" x="17" y="45"></text></g>
      </svg>
      <div class="api-sample-controls" role="group" aria-label="Choose an illustrative flow outcome"><button data-api-sample="approve" aria-pressed="true">Approve sample <span>0.94</span></button><button data-api-sample="review" aria-pressed="false">Manual-review sample <span>0.62</span></button></div>
      <p id="api-sample-status" role="status"></p>
    </div>
  </div>
  </div>
</section>`;

export function setupProductShowcases() {
  const video = document.querySelector<HTMLVideoElement>("#drawer-video")!;
  // Explicit playback only; don't start motion just because the section is visible.
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) video.pause();
  }).observe(video);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) video.pause();
  });

  const buttons =
    document.querySelectorAll<HTMLButtonElement>("[data-api-sample]");
  function showSample(approved: boolean) {
    const probability = approved ? 0.94 : 0.62;
    document.querySelector("#api-probability")!.textContent =
      probability.toFixed(2);
    document
      .querySelector("#api-probability-bar")!
      .setAttribute("width", String(200 * probability));
    for (const [name, active] of [
      ["approve", approved],
      ["review", !approved],
    ] as const) {
      document
        .querySelector(`#api-${name}-edge`)!
        .classList.toggle("selected", active);
      const node = document.querySelector(`#api-${name}-node`)!;
      node.classList.toggle("selected", active);
      node.querySelector(".api-outcome-state")!.textContent = active
        ? "returned outcome"
        : "untaken path";
    }
    buttons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String((button.dataset.apiSample === "approve") === approved),
      ),
    );
    const summary = approved
      ? "The sample value 0.94 meets the 0.90 threshold, so the branch returns approve."
      : "The sample value 0.62 is below the 0.90 threshold, so the branch returns manual-review.";
    document.querySelector("#api-sample-status")!.textContent =
      summary + " This demo makes no model calls.";
    document.querySelector("#api-diagram-description")!.textContent =
      "Eligibility request, then application-defined branch, then approve or manual-review. " +
      summary;
  }
  buttons.forEach((button) =>
    button.addEventListener("click", () =>
      showSample(button.dataset.apiSample === "approve"),
    ),
  );
  showSample(true);
}
