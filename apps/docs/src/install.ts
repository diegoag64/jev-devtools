const blocks = [...document.querySelectorAll<HTMLElement>("[data-install]")];
const managers = [...blocks[0].querySelectorAll<HTMLButtonElement>("[data-package-manager]")]
  .map((tab) => tab.dataset.packageManager!);
const preferenceKey = "jev-docs-package-manager";

function select(manager: string, remember = false) {
  for (const block of blocks) {
    for (const tab of block.querySelectorAll<HTMLButtonElement>("[data-package-manager]")) {
      const selected = tab.dataset.packageManager === manager;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of block.querySelectorAll<HTMLElement>("[data-install-panel]"))
      panel.hidden = panel.dataset.installPanel !== manager;
    block.querySelector<HTMLButtonElement>(".copy-code")!.textContent = "Copy command";
  }
  if (remember) {
    try { localStorage.setItem(preferenceKey, manager); } catch { /* Switching still works when storage is blocked. */ }
  }
}
let initial = "pnpm";
try {
  const saved = localStorage.getItem(preferenceKey);
  if (saved && managers.includes(saved)) initial = saved;
} catch { /* Static pnpm remains the default. */ }
select(initial);
for (const block of blocks) {
  block.querySelector<HTMLElement>("[data-install-fallback]")!.hidden = true;
  block.querySelector<HTMLElement>(".install-tabs")!.hidden = false;
  const tabs = [...block.querySelectorAll<HTMLButtonElement>("[data-package-manager]")];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab.dataset.packageManager!, true));
    tab.addEventListener("keydown", (event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
        : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
        : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      select(tabs[next].dataset.packageManager!, true);
      tabs[next].focus();
    });
  });
}

export {};
