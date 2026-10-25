import "./lab.css";
import { effects } from "./catalog";
import { TRANSITION_DURATION } from "./effects/prism-jade";
import { mountHeroEffect } from "./renderer";

export function mountHeroEffectLab() {
  const target = document.querySelector<HTMLElement>(".hero h1 > span");
  if (!target) return;
  const key = "jevtools:hero-effect-lab:transitions";
  let saved = "";
  try { saved = sessionStorage.getItem(key) ?? ""; } catch { /* Private contexts may disable storage. */ }
  let selected = Math.max(0, effects.findIndex(effect => effect.id === saved));
  let paused = false, collapsed = false;
  const panel = document.createElement("aside");
  panel.className = "hero-lab";
  panel.setAttribute("aria-label", "Temporary hero transition lab");
  panel.innerHTML = `
    <header><div><strong>Transition lab</strong><br><span>Prism &amp; Jade · local development</span></div><button type="button" data-collapse aria-expanded="true" aria-controls="hero-lab-body">Hide</button></header>
    <div id="hero-lab-body">
      <label class="sr-only" for="hero-lab-effect">Transition type</label>
      <select id="hero-lab-effect">${effects.map((effect, i) => `<option value="${i}">${i + 1} / ${effects.length} — ${effect.name}</option>`).join("")}</select>
      <p class="hero-lab-description" aria-live="polite"></p>
      <div class="hero-lab-row"><button type="button" data-previous aria-label="Previous transition">Previous</button><button type="button" data-pause>Pause</button><button type="button" data-next aria-label="Next transition">Next</button></div>
      <div class="hero-lab-row"><label for="hero-lab-position">Cycle position</label><input id="hero-lab-position" type="range" min="0" max="${TRANSITION_DURATION}" value="0" step="0.5"><output for="hero-lab-position" data-position>0s</output></div>
      <div class="hero-lab-row"><button type="button" data-half>Half takeover</button><span class="hero-lab-phase" data-phase>Prism to Jade</span></div>
      <div class="hero-lab-row"><label for="hero-lab-speed">Speed</label><input id="hero-lab-speed" type="range" min="0.25" max="4" value="1" step="0.25"><output for="hero-lab-speed" data-speed>1×</output></div>
      <div class="hero-lab-row"><label><input type="checkbox" data-cycle>Cycle types every 10 seconds</label></div>
      <small>Scrub to pause; Play continues. Switching types keeps the same position. The full loop is 64 seconds.</small>
    </div>`;
  document.body.append(panel);
  const events = new AbortController();
  const on = { signal: events.signal };
  const select = panel.querySelector<HTMLSelectElement>("select")!;
  const description = panel.querySelector<HTMLElement>(".hero-lab-description")!;
  const pause = panel.querySelector<HTMLButtonElement>("[data-pause]")!;
  const cycle = panel.querySelector<HTMLInputElement>("[data-cycle]")!;
  const speed = panel.querySelector<HTMLInputElement>("#hero-lab-speed")!;
  const position = panel.querySelector<HTMLInputElement>("#hero-lab-position")!;
  const positionOutput = panel.querySelector<HTMLOutputElement>("[data-position]")!;
  const phase = panel.querySelector<HTMLElement>("[data-phase]")!;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let timer: ReturnType<typeof setInterval> | undefined;
  let displayedTime = -1;
  function showPosition(time: number) {
    const remainder = time % TRANSITION_DURATION;
    const inCycle = time > 0 && remainder === 0 ? TRANSITION_DURATION : remainder;
    const rounded = Math.round(inCycle * 2) / 2;
    if (rounded === displayedTime) return;
    displayedTime = rounded;
    position.value = String(rounded);
    positionOutput.value = `${rounded}s`;
    position.setAttribute("aria-valuetext", `${rounded} seconds of a 64 second loop`);
    phase.textContent = inCycle < TRANSITION_DURATION / 2 ? "Prism to Jade" : "Jade to Prism";
  }
  const renderer = mountHeroEffect(target, effects[selected].paint, showPosition);
  function choose(index: number) {
    selected = (index + effects.length) % effects.length;
    select.value = String(selected);
    description.textContent = effects[selected].description;
    renderer.setEffect(effects[selected].paint, true);
    try { sessionStorage.setItem(key, effects[selected].id); } catch { /* Selection works without storage. */ }
  }
  function updateCycle() {
    clearInterval(timer);
    if (cycle.checked && !paused && !motion.matches) {
      timer = setInterval(() => {
        const rect = target!.getBoundingClientRect();
        if (!document.hidden && rect.bottom > 0 && rect.top < innerHeight && document.activeElement !== select) choose(selected + 1);
      }, 10000);
    }
  }
  function updateMotion() {
    pause.disabled = motion.matches;
    speed.disabled = motion.matches;
    cycle.disabled = motion.matches;
    pause.textContent = motion.matches ? "Static preview" : paused ? "Play" : "Pause";
    pause.setAttribute("aria-pressed", String(paused || motion.matches));
    renderer.setPaused(paused);
    updateCycle();
  }
  function seek(seconds: number) {
    paused = true;
    updateMotion();
    renderer.seek(seconds);
  }
  select.addEventListener("change", () => { choose(Number(select.value)); updateCycle(); }, on);
  panel.querySelector("[data-previous]")!.addEventListener("click", () => { choose(selected - 1); updateCycle(); }, on);
  panel.querySelector("[data-next]")!.addEventListener("click", () => { choose(selected + 1); updateCycle(); }, on);
  pause.addEventListener("click", () => { paused = !paused; updateMotion(); }, on);
  position.addEventListener("input", () => seek(Number(position.value)), on);
  panel.querySelector("[data-half]")!.addEventListener("click", () => seek(TRANSITION_DURATION / 4), on);
  speed.addEventListener("input", () => {
    renderer.setSpeed(Number(speed.value));
    panel.querySelector<HTMLOutputElement>("[data-speed]")!.value = `${speed.value}×`;
  }, on);
  cycle.addEventListener("change", updateCycle, on);
  panel.querySelector("[data-collapse]")!.addEventListener("click", (event) => {
    collapsed = !collapsed;
    panel.classList.toggle("is-collapsed", collapsed);
    panel.querySelector<HTMLElement>("#hero-lab-body")!.hidden = collapsed;
    const button = event.currentTarget as HTMLButtonElement;
    button.textContent = collapsed ? "Show" : "Hide";
    button.setAttribute("aria-expanded", String(!collapsed));
  }, on);
  motion.addEventListener("change", updateMotion, on);
  choose(selected);
  updateMotion();
  function destroy() {
    clearInterval(timer);
    events.abort();
    renderer.destroy();
    panel.remove();
  }
  if (import.meta.hot) import.meta.hot.dispose(destroy);
  return destroy;
}
