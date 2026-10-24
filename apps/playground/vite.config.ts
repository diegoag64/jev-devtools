import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { jevInspectorServer } from "./server/plugin.ts";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "TYPESAFE_");
  return {
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    plugins: [
      tailwindcss(),
      jevInspectorServer(
        process.env.TYPESAFE_API_KEY || env.TYPESAFE_API_KEY,
        process.env.TYPESAFE_COOKBOOK_MODEL || env.TYPESAFE_COOKBOOK_MODEL,
      ),
    ],
    server: { host: "127.0.0.1", port: 4182, strictPort: true },
    build: { outDir: "dist" },
  };
});
