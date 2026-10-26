import { appendFileSync } from "node:fs";
import { join } from "node:path";
// Inherited by Vite subprocesses. No real key reaches a sample browser run;
// fail the suite even if application code handles a rejected provider request.
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? input));
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    appendFileSync(
      join(process.env.JEV_COOKBOOK_OUTPUT, "external-fetch.log"),
      url.origin + "\n",
    );
    throw new Error("External fetch forbidden in sample cookbook verification");
  }
  return original(input, init);
};
