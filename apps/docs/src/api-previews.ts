import type { ApiPreview } from "../api-previews.js";

const base = import.meta.env.BASE_URL;
const buttons = new WeakMap<HTMLAnchorElement, HTMLButtonElement>();
const popup = document.createElement("span");
popup.id = "api-link-preview";
popup.className = "api-link-preview";
popup.setAttribute("role", "dialog");
popup.setAttribute("aria-label", "API preview");
popup.hidden = true;
popup.innerHTML = `<span class="api-preview-meta"></span><strong class="api-preview-title"></strong><span class="api-preview-summary" role="status"></span><span class="api-preview-actions"><button type="button" class="api-preview-read">Read in side panel</button><a class="api-preview-visit">Open reference ↗</a><button type="button" class="api-preview-dismiss" aria-label="Dismiss API preview">×</button></span>`;
const meta = popup.querySelector<HTMLElement>(".api-preview-meta")!;
const title = popup.querySelector<HTMLElement>(".api-preview-title")!;
const summary = popup.querySelector<HTMLElement>(".api-preview-summary")!;
const visit = popup.querySelector<HTMLAnchorElement>(".api-preview-visit")!;
const read = popup.querySelector<HTMLButtonElement>(".api-preview-read")!;

const panel = document.createElement("dialog");
panel.className = "api-reference-panel";
panel.setAttribute("aria-labelledby", "api-panel-title");
panel.innerHTML = `<header class="api-panel-header"><span><small>API reference</small><h2 id="api-panel-title"></h2></span><button type="button" class="api-panel-close" aria-label="Close API reference">×</button></header><div class="api-panel-toolbar"><a class="api-panel-visit">Open full reference ↗</a></div><div class="api-panel-content api-entry-body"></div>`;
document.body.append(popup, panel);
const panelTitle = panel.querySelector<HTMLElement>("#api-panel-title")!;
const panelContent = panel.querySelector<HTMLElement>(".api-panel-content")!;
const panelVisit = panel.querySelector<HTMLAnchorElement>(".api-panel-visit")!;
const panelClose = panel.querySelector<HTMLButtonElement>(".api-panel-close")!;
let active: HTMLAnchorElement | undefined;
let returnFocus: HTMLElement | undefined;
let opening: ReturnType<typeof setTimeout> | undefined;
let closing: ReturnType<typeof setTimeout> | undefined;
let restoringFocus = false;
let panelVersion = 0;
let index: Promise<Record<string, ApiPreview>> | undefined;
const fragments = new Map<string, string>();

function getIndex() {
  return (index ??= fetch(`${base}api-preview-index.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error("Preview unavailable");
      return (await response.json()) as Record<string, ApiPreview>;
    })
    .catch((error: unknown) => {
      index = undefined;
      throw error;
    }));
}
function hide(restore = false) {
  clearTimeout(opening);
  clearTimeout(closing);
  const previous = active;
  active = undefined;
  popup.hidden = true;
  if (previous) buttons.get(previous)?.setAttribute("aria-expanded", "false");
  if (restore && previous) {
    restoringFocus = true;
    buttons.get(previous)?.focus({ preventScroll: true });
    restoringFocus = false;
  }
}
function position() {
  if (!active || popup.hidden) return;
  const anchor = active.getBoundingClientRect();
  if (anchor.bottom < 0 || anchor.top > innerHeight) {
    hide();
    return;
  }
  const box = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - box.width - 12))}px`;
  popup.style.top = `${Math.max(12, anchor.bottom + box.height + 8 < innerHeight ? anchor.bottom + 8 : anchor.top - box.height - 8)}px`;
}
async function show(link: HTMLAnchorElement, focus = false) {
  clearTimeout(opening);
  clearTimeout(closing);
  if (panel.open) return;
  if (active === link) {
    if (focus) read.focus();
    return;
  }
  hide();
  active = link;
  const button = buttons.get(link)!;
  // Keep actions next to the source link in keyboard reading order.
  button.after(popup);
  button.setAttribute("aria-expanded", "true");
  popup.hidden = false;
  title.textContent = link.textContent;
  meta.textContent = "API reference";
  summary.textContent = "Loading preview…";
  visit.href = link.href;
  position();
  if (focus) read.focus();
  try {
    const entry = (await getIndex())[link.dataset.apiPreview!];
    if (active !== link) return;
    if (!entry) throw new Error("Unknown API");
    title.textContent = entry.title;
    meta.textContent = [entry.kind, entry.source].filter(Boolean).join(" · ");
    summary.innerHTML = entry.summaryHtml;
  } catch {
    if (active !== link) return;
    summary.textContent =
      "Preview could not load. Open the reference or try the side panel.";
  }
  position();
}
function triggerAt(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const link = target.closest<HTMLAnchorElement>("a[data-api-preview]");
  if (link) return link;
  const button = target.closest<HTMLButtonElement>(".api-preview-trigger");
  return button?.previousElementSibling instanceof HTMLAnchorElement
    ? button.previousElementSibling
    : null;
}
function withinPreview(target: EventTarget | null) {
  return (
    target instanceof Node &&
    (popup.contains(target) ||
      active?.contains(target) ||
      (active && buttons.get(active)?.contains(target)))
  );
}
function scheduleHide() {
  clearTimeout(closing);
  if (!withinPreview(document.activeElement))
    closing = setTimeout(() => hide(), 180);
}
for (const link of document.querySelectorAll<HTMLAnchorElement>(
  "a[data-api-preview]",
)) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "api-preview-trigger";
  button.setAttribute("aria-label", `Preview ${link.textContent?.trim()}`);
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", popup.id);
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2" fill="none" stroke="currentColor"/><path d="M9 3v10" stroke="currentColor"/></svg>`;
  link.after(button);
  buttons.set(link, button);
}
document.addEventListener("pointerover", (event) => {
  if (event.pointerType !== "mouse") return;
  if (popup.contains(event.target as Node)) {
    clearTimeout(closing);
    return;
  }
  const link = triggerAt(event.target);
  if (!link) return;
  clearTimeout(opening);
  clearTimeout(closing);
  opening = setTimeout(() => void show(link), 180);
});
document.addEventListener("pointerout", (event) => {
  if (triggerAt(event.target) || popup.contains(event.target as Node)) {
    clearTimeout(opening);
    if (!withinPreview(event.relatedTarget)) scheduleHide();
  }
});
document.addEventListener("focusin", (event) => {
  if (restoringFocus || panel.open) return;
  const link = triggerAt(event.target);
  if (link) void show(link);
  else if (!popup.contains(event.target as Node)) hide();
});
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const link = triggerAt(target);
  if (link && target?.closest(".api-preview-trigger")) void show(link, true);
  else if (!popup.contains(event.target as Node)) hide();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !popup.hidden && !panel.open) {
    event.preventDefault();
    hide(popup.contains(document.activeElement));
  }
});
popup
  .querySelector(".api-preview-dismiss")!
  .addEventListener("click", () => hide(true));
visit.addEventListener("click", () => hide());
window.addEventListener("resize", position);
document.addEventListener(
  "scroll",
  (event) => {
    if (!popup.contains(event.target as Node)) position();
  },
  true,
);

async function loadPanel(id: string) {
  const version = ++panelVersion;
  panelContent.innerHTML = `<p role="status">Loading reference…</p>`;
  panel.scrollTop = 0;
  try {
    let html = fragments.get(id);
    if (html === undefined) {
      const response = await fetch(
        `${base}api-previews/${encodeURIComponent(id)}.html`,
      );
      if (!response.ok) throw new Error("Reference unavailable");
      html = await response.text();
      if (/<!doctype|<html[\s>]/i.test(html))
        throw new Error("Invalid reference");
      fragments.set(id, html);
    }
    if (!panel.open || version !== panelVersion) return;
    const template = document.createElement("template");
    template.innerHTML = html;
    // Namespace fragment IDs: a glossary page may already contain this entry.
    for (const element of template.content.querySelectorAll<HTMLElement>(
      "[id]",
    ))
      element.id = `api-panel-${element.id}`;
    for (const element of template.content.querySelectorAll<HTMLElement>(
      "[aria-labelledby], [aria-describedby], [aria-controls], [data-type-info]",
    )) {
      for (const attribute of [
        "aria-labelledby",
        "aria-describedby",
        "aria-controls",
        "data-type-info",
      ]) {
        const value = element.getAttribute(attribute);
        if (value)
          element.setAttribute(
            attribute,
            value
              .split(/\s+/)
              .map((id) => `api-panel-${id}`)
              .join(" "),
          );
      }
    }
    for (const button of template.content.querySelectorAll<HTMLButtonElement>(
      ".copy-code",
    ))
      button.hidden = false;
    panelContent.replaceChildren(template.content);
    if (panelContent.querySelector("[data-type-info]"))
      void import("./type-hovers.js");
  } catch {
    if (!panel.open || version !== panelVersion) return;
    panelContent.innerHTML = `<p role="status">The reference could not load. Try again or open the full page.</p><button type="button" class="api-panel-retry">Try again</button>`;
    panelContent.querySelector("button")!.addEventListener("click", () => {
      panelClose.focus();
      void loadPanel(id);
    });
  }
}
read.addEventListener("click", () => {
  if (!active) return;
  const link = active;
  returnFocus = buttons.get(link);
  panelTitle.textContent = title.textContent;
  panelVisit.href = link.href;
  hide();
  panel.showModal();
  document.documentElement.classList.add("api-panel-open");
  panelClose.focus();
  void loadPanel(link.dataset.apiPreview!);
});
panelClose.addEventListener("click", () => panel.close());
panel.addEventListener("close", () => {
  panelVersion++;
  document.documentElement.classList.remove("api-panel-open");
  restoringFocus = true;
  returnFocus?.focus({ preventScroll: true });
  restoringFocus = false;
});
panel.addEventListener("click", (event) => {
  const link =
    event.target instanceof Element ? event.target.closest("a") : null;
  if (
    link &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.button === 0
  )
    panel.close();
  if (event.target !== panel) return;
  const box = panel.getBoundingClientRect();
  if (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  )
    panel.close();
});
