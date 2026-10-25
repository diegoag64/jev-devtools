import {
  defineConfig,
  searchForWorkspaceRoot,
  normalizePath,
  type UserConfig,
} from "vite";
import { resolve } from "node:path";
import { appRoot, generated, generate, normalizeBase } from "./site.js";

export default defineConfig(async (): Promise<UserConfig> => {
  const base = normalizeBase(process.env.DOCS_BASE);
  const input = await generate(base);
  return {
    root: generated,
    base,
    appType: "mpa",
    server: {
      host: "127.0.0.1",
      port: 4185,
      strictPort: true,
      fs: { allow: [searchForWorkspaceRoot(appRoot)] },
    },
    preview: { host: "127.0.0.1", port: 4185, strictPort: true },
    build: {
      outDir: resolve(appRoot, "dist"),
      emptyOutDir: true,
      rollupOptions: { input },
    },
    plugins: [
      {
        name: "jev-docs-content",
        transformIndexHtml: {
          order: "pre",
          handler(html, context) {
            return context.server
              ? html.replace(
                  /(src|href)="[^"]*src\/(client\.ts|style\.css)"/g,
                  (_match, attribute: string, file: string) =>
                    `${attribute}="/@fs/${normalizePath(resolve(appRoot, "src", file))}"`,
                )
              : html;
          },
        },
        configureServer(server) {
          server.watcher.add([
            resolve(appRoot, "content"),
            resolve(appRoot, "examples"),
          ]);
          let pending = Promise.resolve();
          server.watcher.on("all", (_event, file) => {
            if (
              !["content", "examples"].some((folder) =>
                normalizePath(file).startsWith(
                  normalizePath(resolve(appRoot, folder)) + "/",
                ),
              )
            )
              return;
            pending = pending
              .then(async () => {
                await generate(base);
                server.ws.send({ type: "full-reload" });
              })
              .catch((error) => server.config.logger.error(String(error)));
          });
        },
      },
    ],
  };
});
