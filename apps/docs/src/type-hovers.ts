// Type signatures and documentation are already HTML. No compiler runs here.
let active: HTMLElement | undefined;
let popup: HTMLElement | undefined;
let closing: ReturnType<typeof setTimeout> | undefined;
function hide() {
  clearTimeout(closing);
  active?.setAttribute("aria-expanded", "false");
  if (popup) popup.hidden = true;
  active = popup = undefined;
}
function show(token: HTMLElement) {
  clearTimeout(closing);
  if (token === active) return;
  hide();
  active = token;
  popup = document.getElementById(token.dataset.typeInfo!)!;
  popup.hidden = false;
  token.setAttribute("aria-expanded", "true");
  position();
}
function position() {
  if (!active || !popup) return;
  const rect = active.getBoundingClientRect();
  if (
    rect.bottom < 0 ||
    rect.top > innerHeight ||
    rect.right < 0 ||
    rect.left > innerWidth
  ) {
    hide();
    return;
  }
  const box = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - box.width - 12))}px`;
  popup.style.top = `${Math.max(12, rect.bottom + box.height + 8 < innerHeight ? rect.bottom + 8 : rect.top - box.height - 8)}px`;
}

function tokenAt(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-type-info]")
    : null;
}
document.addEventListener("pointerover", (event) => {
  const token = tokenAt(event.target);
  if (token) show(token);
  else if (popup?.contains(event.target as Node)) clearTimeout(closing);
});
document.addEventListener("pointerout", (event) => {
  if (tokenAt(event.target) || popup?.contains(event.target as Node)) {
    if (
      popup?.contains(event.relatedTarget as Node) ||
      active?.contains(event.relatedTarget as Node)
    )
      return;
    if (active !== document.activeElement) closing = setTimeout(hide, 120);
  }
});
document.addEventListener("focusin", (event) => {
  const token = tokenAt(event.target);
  if (token) show(token);
  else if (!popup?.contains(event.target as Node)) hide();
});
document.addEventListener("click", (event) => {
  const token = tokenAt(event.target);
  if (token) show(token);
  else if (!popup?.contains(event.target as Node)) hide();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hide();
  else if (event.key === "Enter" || event.key === " ") {
    const token = tokenAt(event.target);
    if (token) {
      event.preventDefault();
      show(token);
    }
  }
});
// Browser focus/hover can scroll a symbol into view after its event fires.
// Reposition then; dismiss once the symbol leaves the viewport.
window.addEventListener("resize", position);
document.addEventListener(
  "scroll",
  (event) => {
    if (!popup?.contains(event.target as Node)) position();
  },
  true,
);

export {};
