import { build } from "vite";
import { withTemporaryProject } from "./temporary-project.mjs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// Compile the actual development UI as well as the production notice.
// This temporary output has no running API and must not be deployed.
const root = fileURLToPath(new URL("../apps/playground", import.meta.url));
await withTemporaryProject("jev-playground-build-", async (output) => {
  await build({
    root,
    configFile: join(root, "vite.config.ts"),
    define: { "import.meta.env.DEV": "true" },
    build: { outDir: output, emptyOutDir: true },
  });
});
