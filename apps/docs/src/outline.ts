const toc = document.querySelector<HTMLElement>(".toc");
const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-toc-link]")];
const entries = links.flatMap((link) => {
  const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
  return heading ? [{ link, heading }] : [];
});
const groups = [...document.querySelectorAll<HTMLDetailsElement>(".toc-group")];
const progressTracks = groups.flatMap((group) => {
  const link = group.querySelector<HTMLAnchorElement>("summary a");
  const track = group.querySelector<HTMLElement>(".toc-methods");
  const section = link && document.getElementById(decodeURIComponent(link.hash.slice(1)))?.closest(".reference-group");
  return track && section ? [{ track, section }] : [];
});
const stickyHeaders = [...document.querySelectorAll<HTMLElement>(".api-entry-header")]
  .map((header) => ({ header, card: header.parentElement! }));
let active: HTMLAnchorElement | undefined;
let queued = false;

function update() {
  queued = false;
  if (!toc || !entries.length) return;
  // Read the responsive sticky inset from CSS. Keep displaced headers square,
  // including while the next card pushes them away, and restore on scrolling up.
  if (stickyHeaders.length) {
    const inset = parseFloat(getComputedStyle(stickyHeaders[0].header).top);
    const states = stickyHeaders.map(({ header, card }) => ({
      header, stuck: card.getBoundingClientRect().top + card.clientTop < inset,
    }));
    for (const { header, stuck } of states) header.classList.toggle("is-stuck", stuck);
  }
  // Use the same reading line as native anchor navigation below the header.
  const readingLine = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) + 8;
  // Update even while the active method stays the same: long entries should
  // advance the track continuously. Past groups fill; future groups stay empty.
  for (const { track, section } of progressTracks) {
    const box = section.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (readingLine - box.top) / Math.max(1, box.height))).toFixed(4);
    if (track.style.getPropertyValue("--section-progress") !== progress)
      track.style.setProperty("--section-progress", progress);
  }
  let current = entries[0];
  for (const entry of entries) {
    if (entry.heading.getBoundingClientRect().top > readingLine) break;
    current = entry;
  }
  if (scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2)
    current = entries[entries.length - 1];
  if (current.link === active) return;
  active?.removeAttribute("aria-current");
  active = current.link;
  active.setAttribute("aria-current", "location");
  const currentGroup = active.closest<HTMLDetailsElement>(".toc-group");
  for (const group of groups) {
    const selected = group === currentGroup;
    group.open = selected;
    group.classList.toggle("is-current", selected);
  }
  // Scroll only the outline, never the document or the reader's keyboard focus.
  if (toc.getClientRects().length) {
    const box = toc.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.top < box.top + 16 || item.bottom > box.bottom - 16)
      toc.scrollTop += item.top - box.top - box.height / 2;
  }
}
function schedule() {
  if (!queued) { queued = true; requestAnimationFrame(update); }
}
addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", schedule);
addEventListener("hashchange", schedule);
addEventListener("pageshow", schedule);
// Expanded declarations and wrapped content can move headings without scrolling.
const article = document.querySelector("article");
if (article) new ResizeObserver(schedule).observe(article);
schedule();
