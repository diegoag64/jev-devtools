import "./outline.js";

const root = document.documentElement;
const themeButton = document.querySelector<HTMLButtonElement>(".theme-toggle")!;
themeButton.hidden = false;
themeButton.addEventListener("click", () => {
  const dark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try {
    localStorage.setItem("jev-docs-theme", root.dataset.theme);
  } catch {
    /* The theme still applies for this page. */
  }
});
const menu = document.querySelector<HTMLButtonElement>(".menu-toggle")!;
menu.hidden = false;
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  document.querySelector(".sidebar")!.classList.toggle("is-open", open);
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  ".copy-code",
)) {
  button.hidden = false;
  const copyLabel = button.textContent;
  button.addEventListener("click", async () => {
    try {
      const block = button.closest(".code-block")!;
      const code = block.querySelector(".install-panel:not([hidden]) code") ?? block.querySelector("code");
      await navigator.clipboard.writeText(code?.textContent ?? "");
      button.textContent = "Copied!";
    } catch {
      button.textContent = "Select code to copy";
    }
    setTimeout(() => {
      button.textContent = copyLabel;
    }, 2200);
  });
}

type SearchPage = { title: string; group: string; url: string; text: string };
const dialog = document.querySelector<HTMLDialogElement>("#search-dialog")!;
const input = document.querySelector<HTMLInputElement>("#search-input")!;
const results = document.querySelector<HTMLUListElement>("#search-results")!;
const status = document.querySelector<HTMLElement>("#search-status")!;
let pages: SearchPage[] | undefined;
let loading: Promise<void> | undefined;
function renderSearch() {
  if (!pages) return;
  const terms = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = pages
    .filter((p) =>
      terms.every((term) =>
        `${p.title} ${p.text}`.toLowerCase().includes(term),
      ),
    )
    .sort(
      (a, b) =>
        Number(b.title.toLowerCase().includes(input.value.toLowerCase())) -
        Number(a.title.toLowerCase().includes(input.value.toLowerCase())),
    )
    .slice(0, 10);
  results.replaceChildren();
  for (const page of matches) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = page.url;
    // A glossary result may only change the hash, so navigation will not
    // replace the document and dismiss the search dialog for us.
    link.addEventListener("click", () => dialog.close());
    const title = document.createElement("strong");
    title.textContent = page.title;
    const group = document.createElement("span");
    group.textContent = page.group;
    link.append(title, group);
    item.append(link);
    results.append(item);
  }
  status.textContent = matches.length
    ? `${matches.length} results. Tab to a result, then press Enter.`
    : "No matching pages. Try a shorter search.";
}
async function openSearch() {
  if (!dialog.open) dialog.showModal();
  input.focus();
  if (pages) {
    renderSearch();
    return;
  }
  status.textContent = "Loading documentation…";
  loading ??= fetch(`${import.meta.env.BASE_URL}search-index.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error("Search unavailable");
      pages = (await response.json()) as SearchPage[];
      renderSearch();
    })
    .catch(() => {
      status.textContent =
        "Search could not load. Close and reopen to retry, or use the sidebar.";
    })
    .finally(() => {
      loading = undefined;
    });
  await loading;
}
const trigger = document.querySelector<HTMLButtonElement>(".search-trigger")!;
trigger.hidden = false;
trigger.addEventListener("click", openSearch);
input.addEventListener("input", renderSearch);
document
  .querySelector(".close-search")!
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const box = dialog.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      dialog.close();
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    void openSearch();
  }
  if (event.key === "Escape") {
    menu.setAttribute("aria-expanded", "false");
    document.querySelector(".sidebar")!.classList.remove("is-open");
  }
});
if (document.querySelector("[data-demo]")) void import("./demo.js");

if (document.querySelector("[data-type-info]")) void import("./type-hovers.js");

if (document.querySelector("[data-install]")) void import("./install.js");
