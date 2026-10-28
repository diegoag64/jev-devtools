if (import.meta.env.DEV) {
  const params = new URLSearchParams(location.search);
  if (params.has("legacy") || params.has("sandbox"))
    void import("./Playground").then(({ mount }) => mount());
  else void import("./workbench/Workbench").then(({ mount }) => mount());
} else {
  document.getElementById("root")!.textContent =
    "Jev DevTools is a local development tool. Start it with npm run dev.";
}
