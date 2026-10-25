import "./lab.css";
import { effects } from "./catalog";
import { mountHeroEffect } from "./renderer";

export function mountHeroEffectLab() {
  const target = document.querySelector<HTMLElement>(".hero h1 > span");
  if (!target) return;
  const key = "jevtools:hero-effect-lab";
  let saved = "";
  try { saved = sessionStorage.getItem(key) ?? ""; } catch { /* Storage can be unavailable in private contexts. */ }
  let selected = Math.max(0, effects.findIndex(effect => effect.id === saved));
  let paused = false, collapsed = false;
  const renderer = mountHeroEffect(target, effects[selected].paint);
  const panel = document.createElement("aside");
  panel.className = "hero-lab";
  panel.setAttribute("aria-label", "Temporary hero effect lab");
  panel.innerHTML = `
    <header><div><strong>Hero effect lab</strong><br><span>Temporary · local development</span></div><button type="button" data-collapse aria-expanded="true" aria-controls="hero-lab-body">Hide</button></header>
    <div id="hero-lab-body">
      <label class="sr-only" for="hero-lab-effect">Hero color effect</label>
      <select id="hero-lab-effect">${effects.map((effect, i) => `<option value="${i}">${i + 1} / ${effects.length} — ${effect.name}</option>`).join("")}</select>
      <p class="hero-lab-description" aria-live="polite"></p>
      <div class="hero-lab-row"><button type="button" data-previous aria-label="Previous hero effect">Previous</button><button type="button" data-pause>Pause</button><button type="button" data-next aria-label="Next hero effect">Next</button></div>
      <div class="hero-lab-row"><label for="hero-lab-speed">Speed</label><input id="hero-lab-speed" type="range" min="0.25" max="2" value="1" step="0.25"><output for="hero-lab-speed">1×</output></div>
      <div class="hero-lab-row"><label><input type="checkbox" data-cycle>Cycle every 10 seconds</label></div>
      <small>Only the lettering changes. Hide this panel for a clean view.</small>
    </div>`;
  document.body.append(panel);
  const events = new AbortController();
  const on = { signal: events.signal };
  const select = panel.querySelector<HTMLSelectElement>("select")!;
  const description = panel.querySelector<HTMLElement>(".hero-lab-description")!;
  const pause = panel.querySelector<HTMLButtonElement>("[data-pause]")!;
  const cycle = panel.querySelector<HTMLInputElement>("[data-cycle]")!;
  const speed = panel.querySelector<HTMLInputElement>("[type=range]")!;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let timer: ReturnType<typeof setInterval> | undefined;
  function choose(index: number) {
    selected = (index + effects.length) % effects.length;
    select.value = String(selected); description.textContent = effects[selected].description;
    renderer.setEffect(effects[selected].paint);
    try { sessionStorage.setItem(key, effects[selected].id); } catch { /* Selection still works without storage. */ }
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
    pause.disabled = motion.matches; speed.disabled = motion.matches; cycle.disabled = motion.matches;
    pause.textContent = motion.matches ? "Static preview" : paused ? "Play" : "Pause";
    pause.setAttribute("aria-pressed", String(paused || motion.matches));
    renderer.setPaused(paused); updateCycle();
  }
  select.addEventListener("change", () => { choose(Number(select.value)); updateCycle(); }, on);
  panel.querySelector("[data-previous]")!.addEventListener("click", () => { choose(selected - 1); updateCycle(); }, on);
  panel.querySelector("[data-next]")!.addEventListener("click", () => { choose(selected + 1); updateCycle(); }, on);
  pause.addEventListener("click", () => { paused = !paused; updateMotion(); }, on);
  speed.addEventListener("input", () => { renderer.setSpeed(Number(speed.value)); panel.querySelector("output")!.textContent = `${speed.value}×`; }, on);
  cycle.addEventListener("change", updateCycle, on);
  panel.querySelector("[data-collapse]")!.addEventListener("click", (event) => {
    collapsed = !collapsed;
    panel.classList.toggle("is-collapsed", collapsed);
    panel.querySelector<HTMLElement>("#hero-lab-body")!.hidden = collapsed;
    const button = event.currentTarget as HTMLButtonElement;
    button.textContent = collapsed ? "Show" : "Hide"; button.setAttribute("aria-expanded", String(!collapsed));
  }, on);
  motion.addEventListener("change", updateMotion, on);
  choose(selected); updateMotion();
  function destroy() { clearInterval(timer); events.abort(); renderer.destroy(); panel.remove(); }
  if (import.meta.hot) import.meta.hot.dispose(destroy);
  return destroy;
}
