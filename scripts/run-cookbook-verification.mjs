import { fileURLToPath } from "node:url";
import { runBrowserSuite } from "./cookbook-verification.mjs";
const args = process.argv.slice(2);
const controller = new AbortController();
const interrupt = () =>
  controller.abort(new Error("Browser verification interrupted"));
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  if (args.length && (args.length !== 2 || args[0] !== "--only"))
    throw new Error("Usage: npm run verify:cookbooks -- [--only <check>]");
  await runBrowserSuite(fileURLToPath(new URL("../", import.meta.url)), {
    only: args[1],
    signal: controller.signal,
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
