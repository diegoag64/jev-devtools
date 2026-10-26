import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { snapshotSource, assertFreshReport } from "./verification-evidence.mjs";
const [path, ...args] = process.argv.slice(2);
try {
  if (
    !path ||
    args.length % 2 ||
    args.some(
      (arg, i) => i % 2 === 0 && !["--mode", "--reviewed-head"].includes(arg),
    )
  )
    throw new Error(
      "Usage: npm run verify:evidence -- <summary.json> [--mode full|receipts|cookbook-browser|cookbook-browser-selected] [--reviewed-head <full SHA>]",
    );
  const options = Object.fromEntries(
    Array.from({ length: args.length / 2 }, (_, i) => [
      args[i * 2],
      args[i * 2 + 1],
    ]),
  );
  const current = await snapshotSource(
    fileURLToPath(new URL("../", import.meta.url)),
  );
  const report = JSON.parse(await readFile(path, "utf8"));
  assertFreshReport(report, current, {
    mode: options["--mode"] ?? "full",
    reviewedHead: options["--reviewed-head"],
  });
  console.log(
    `Evidence is current: ${report.mode}, ${current.revision}, ${current.sourceHash}`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
