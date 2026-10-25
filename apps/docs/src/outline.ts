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
  return track && section ? [{ track, section, methods: entries.filter(({ link }) => track.contains(link)) }] : [];
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
  let current = entries[0];
  for (const entry of entries) {
    if (entry.heading.getBoundingClientRect().top > readingLine) break;
    current = entry;
  }
  if (scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2)
    current = entries[entries.length - 1];
  const changed = current.link !== active;
  if (changed) {
    active?.removeAttribute("aria-current");
    active = current.link;
    active.setAttribute("aria-current", "location");
    const currentGroup = active.closest<HTMLDetailsElement>(".toc-group");
    for (const group of groups) {
      const selected = group === currentGroup;
      group.open = selected;
      group.classList.toggle("is-current", selected);
    }
  }
  // Measure after opening the group and styling its active link, since wrapped
  // labels change the sidebar geometry. Keep updating within long methods.
  updateProgress(readingLine);
  if (!changed) return;
  // Scroll only the outline, never the document or the reader's keyboard focus.
  if (toc.getClientRects().length) {
    const box = toc.getBoundingClientRect();
    const item = current.link.getBoundingClientRect();
    if (item.top < box.top + 16 || item.bottom > box.bottom - 16)
      toc.scrollTop += item.top - box.top - box.height / 2;
  }
}
function updateProgress(readingLine: number) {
  for (const { track, section, methods } of progressTracks) {
    const sectionBox = section.getBoundingClientRect();
    let progress = 0;
    if (readingLine >= sectionBox.bottom) progress = 1;
    else if (readingLine > sectionBox.top) {
      const trackBox = track.getBoundingClientRect();
      if (!trackBox.height) continue; // Recompute when a collapsed group opens.
      let from = { page: sectionBox.top, rail: 0 };
      let to = { page: sectionBox.bottom, rail: trackBox.height };
      for (const { heading, link } of methods) {
        const item = link.getBoundingClientRect();
        const point = {
          page: heading.getBoundingClientRect().top,
          rail: item.top + item.height / 2 - trackBox.top,
        };
        if (point.page > readingLine) { to = point; break; }
        from = point;
      }
      // Each method heading maps to its own label center, regardless of method
      // length or label wrapping. Scroll between headings fills between labels.
      const fraction = Math.max(0, Math.min(1, (readingLine - from.page) / Math.max(1, to.page - from.page)));
      progress = (from.rail + (to.rail - from.rail) * fraction) / trackBox.height;
    }
    const value = Math.max(0, Math.min(1, progress)).toFixed(4);
    if (track.style.getPropertyValue("--section-progress") !== value)
      track.style.setProperty("--section-progress", value);
  }
}
function schedule() {
  if (!queued) { queued = true; requestAnimationFrame(update); }
}
for (const group of groups) group.addEventListener("toggle", schedule);
addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", schedule);
addEventListener("hashchange", schedule);
addEventListener("pageshow", schedule);
// Expanded declarations and wrapped content can move headings without scrolling.
const article = document.querySelector("article");
if (article) new ResizeObserver(schedule).observe(article);
schedule();
