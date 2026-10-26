import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { choice } from "@typesafe-ai/sdk";
export const post = JSON.parse(
  readFileSync(new URL("./post.json", import.meta.url), "utf8"),
);
export const rubric: Record<string, [string, Record<string, string>]> =
  JSON.parse(
    readFileSync(new URL("./questions.json", import.meta.url), "utf8"),
  );
export const NUM_SAMPLES = 15;
export const MIN_PROBABILITY = 0.6;
// Match Python json.dumps(sort_keys=True)'s separators, ASCII encoding and ordering.
function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(", ")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${sortedJson(key)}: ${sortedJson(item)}`)
      .join(", ")}}`;
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
export const rubricHash = createHash("sha256")
  .update(sortedJson([post, rubric]))
  .digest("hex")
  .slice(0, 12);
export function makeRepeats() {
  return Array.from({ length: NUM_SAMPLES }, (_, index) => ({
    index,
    uid: `${rubricHash}:${index}:${randomBytes(4).toString("hex")}`,
  }));
}
export function rubricRequest(repeat: { uid: string }) {
  return {
    model: "jev-latest",
    state: { uid: repeat.uid, post },
    questions: Object.fromEntries(
      Object.entries(rubric).map(([key, [instructions, criteria]]) => [
        key,
        choice(instructions, criteria),
      ]),
    ),
  };
}
