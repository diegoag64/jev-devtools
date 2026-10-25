import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { replayClient } from "jev-devtools/flow";
import { refundFlow, parallelFlow, skillShortlistFlow } from "../apps/playground/server/flows.ts";

const flows = [refundFlow, parallelFlow, skillShortlistFlow];
const usage = `Replay a copied playground fixture without a server or API key.

  npm run replay -- --clipboard                  macOS clipboard
  npm run replay -- path/to/fixture.json         saved JSON
  pbpaste | npm run replay -- -                  JSON on stdin

Options:
  --input path/to/input.json  Input object with a string message
  --expect outcome           Exit with an error if the outcome differs
  --help                     Show this help

Supported flows:
${flows.map((flow) => `  ${flow.definition.name}`).join("\n")}

Without --input, uses a sample message and prints it with the result.
Fixtures contain answers, not the original input. Cookbook/custom flows
must be replayed with their own definition and input using replayClient().`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      clipboard: { type: "boolean" },
      input: { type: "string" },
      expect: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(usage);
  } else {
    if (positionals.length > 1 || (values.clipboard && positionals.length)) {
      throw new Error("Choose one fixture source: --clipboard, a file, or - for stdin.");
    }
    let source;
    if (values.clipboard) {
      if (process.platform !== "darwin") {
        throw new Error("--clipboard requires macOS. Save the JSON to a file or pipe it to stdin instead.");
      }
      source = execFileSync("pbpaste", { encoding: "utf8" });
    } else if (positionals[0] && positionals[0] !== "-") {
      source = readFileSync(positionals[0], "utf8");
    } else {
      if (process.stdin.isTTY) throw new Error(`Choose a fixture source.\n\n${usage}`);
      source = readFileSync(0, "utf8");
    }
    if (!source.trim()) throw new Error("No fixture JSON found. Use Copy fixture on a completed flow run first.");
    const fixture = JSON.parse(source);
    const client = replayClient(fixture);
    const flow = flows.find((candidate) => candidate.definition.name === fixture.flow);
    if (!flow) throw new Error(`Unsupported flow ${JSON.stringify(fixture.flow)}.\n\n${usage}`);
    const input = values.input
      ? JSON.parse(readFileSync(values.input, "utf8"))
      : { message: "I was charged twice and need a refund." };
    if (!input || Array.isArray(input) || typeof input.message !== "string") {
      throw new Error("Input must be a JSON object with a string message.");
    }
    // This helper runs only the three local sample flows above, whose tasks
    // are pure. Catch accidental fetch calls if those examples later change.
    globalThis.fetch = async () => { throw new Error("Unexpected network request during fixture replay."); };
    const result = await flow.run(input, { client });
    console.log(JSON.stringify({ flow: fixture.flow, input, outcome: result.outcome, value: result.value }, null, 2));
    if (values.expect !== undefined && result.outcome !== values.expect) {
      throw new Error(`Expected outcome ${JSON.stringify(values.expect)}, received ${JSON.stringify(result.outcome)}.`);
    }
  }
} catch (error) {
  console.error(`Replay failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
