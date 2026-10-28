if (import.meta.env.DEV) {
  void import("./workbench/Workbench").then(({ mount }) => mount());
} else {
  document.getElementById("root")!.textContent =
    "Jev DevTools is a local development tool. Start it with npm run dev.";
}
