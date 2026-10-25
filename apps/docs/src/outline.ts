const toc = document.querySelector<HTMLElement>(".toc");
const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-toc-link]")];
const entries = links.flatMap((link) => {
  const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
  return heading ? [{ link, heading }] : [];
});
const groups = [...document.querySelectorAll<HTMLDetailsElement>(".toc-group")];
let active: HTMLAnchorElement | undefined;
let queued = false;

function update() {
  queued = false;
  if (!toc || !entries.length) return;
  // Use the same reading line as native anchor navigation below the header.
  const readingLine = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) + 8;
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
