const managers = [
  ["pnpm", "pnpm", "pnpm add"],
  ["npm", "npm", "npm install"],
  ["yarn", "Yarn", "yarn add"],
  ["bun", "Bun", "bun add"],
] as const;

// Explicit install fences keep repository setup and arbitrary shell scripts
// out of command conversion. The Markdown itself remains runnable with pnpm.
export function renderInstall(command: string, highlight: (command: string) => string, id: string) {
  const match = command.trim().match(/^pnpm add ((?:@?[a-z0-9][a-z0-9@/._~^+-]*)(?: +@?[a-z0-9][a-z0-9@/._~^+-]*)*)$/i);
  if (!match) throw new Error("Install fences require one pnpm add command with package names; use a normal shell fence for scripts or flags.");
  const tabs = managers.map(([manager, label]) => `<button type="button" role="tab" id="${id}-${manager}-tab" aria-controls="${id}-${manager}" aria-selected="${manager === "pnpm"}" tabindex="${manager === "pnpm" ? 0 : -1}" data-package-manager="${manager}">${label}</button>`).join("");
  const panels = managers.map(([manager, , prefix]) => `<div class="install-panel" role="tabpanel" id="${id}-${manager}" aria-labelledby="${id}-${manager}-tab" tabindex="0" data-install-panel="${manager}"${manager === "pnpm" ? "" : " hidden"}>${highlight(`${prefix} ${match[1]}`)}</div>`).join("");
  return `<div class="code-block install-block" data-install><div class="code-toolbar install-toolbar"><span data-install-fallback>Install with pnpm</span><div class="install-tabs" role="tablist" aria-label="Package manager" hidden>${tabs}</div><button type="button" class="copy-code" hidden>Copy command</button></div>${panels}</div>`;
}
