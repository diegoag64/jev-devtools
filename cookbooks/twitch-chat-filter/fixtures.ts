import chat from "./chat.json" with { type: "json" };
import type { Category } from "./recipe.js";
import type { TwitchCase } from "./cases.js";
export type Message = { user: string; text: string };
export const stream = chat.stream;
// Authored synthetic classifications; these are not the upstream cached model responses.
const labels: Category[] = [
  "conversation",
  "hype",
  "question",
  "conversation",
  "backseat",
  "spam",
  "conversation",
  "hype",
  "question",
  "conversation",
  "conversation",
  "backseat",
  "hype",
  "hype",
  "question",
  "question",
  "conversation",
  "conversation",
  "backseat",
  "conversation",
  "conversation",
  "question",
  "hype",
  "conversation",
  "spam",
  "hype",
  "question",
  "conversation",
  "conversation",
];
const boundarySpecs: [string, Category, number, number][] = [
  [
    "Toxic just below threshold; question stays highlighted",
    "question",
    0.6999,
    0.1,
  ],
  ["Toxic at threshold wins over spoiler and spam", "spam", 0.7, 0.9],
  ["Toxic just above threshold hides", "conversation", 0.7001, 0.1],
  [
    "Spoiler just below threshold; conversation stays visible",
    "conversation",
    0.1,
    0.6999,
  ],
  ["Spoiler at threshold blurs a question", "question", 0.1, 0.7],
  ["Spoiler just above threshold blurs", "conversation", 0.1, 0.7001],
  ["Backseat category hide wins over spoiler", "backseat", 0.1, 0.9],
  ["Hype is shown normally; quiet hides before spoiler", "hype", 0.1, 0.1],
  ["Quiet hides hype even when spoiler would blur", "hype", 0.1, 0.9],
];
export function fixtures(caseId: TwitchCase) {
  return caseId === "original"
    ? chat.messages.map((message, index) => ({
        message,
        category: labels[index],
        toxic: [9, 19].includes(index) ? 0.9 : 0.1,
        spoiler: [6, 16].includes(index) ? 0.9 : 0.1,
      }))
    : boundarySpecs.map(([text, category, toxic, spoiler], index) => ({
        message: { user: `boundary_${index + 1}`, text },
        category,
        toxic,
        spoiler,
      }));
}
