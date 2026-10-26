import { choice, noul } from "@typesafe-ai/sdk";
export const categories = [
  "question",
  "hype",
  "conversation",
  "backseat",
  "spam",
] as const;
export type Category = (typeof categories)[number];
export type Action = "show" | "highlight" | "dim" | "blur" | "hide";
export type Rules = Record<Category, Action>;
export type Classification = {
  category: Category;
  probabilities: Record<string, number>;
  confidence: number;
  toxic: number;
  spoiler: number;
};
export type Decision = { action: Action; reason: string };
export const TOXIC_AT = 0.7;
export const SPOILER_AT = 0.7;
export const RULES: Rules = {
  question: "highlight",
  hype: "show",
  conversation: "show",
  backseat: "hide",
  spam: "hide",
};
export const QUIET: Rules = { ...RULES, hype: "hide", conversation: "dim" };
export const questions = {
  category: choice(
    "Which category best describes the main purpose of `message.text`?",
    {
      question:
        "A genuine request for information from the streamer or chat, not gameplay instructions phrased as a question or a promotional pitch",
      hype: "Cheering, reactions, or repeated emotes (PogChamp, LUL, GG, W, lets gooo); repetition alone does not make cheering spam",
      conversation:
        "Ordinary chatter, opinions, replies, useful shared links, or any message whose main purpose does not fit the other categories",
      backseat:
        "Unrequested gameplay advice telling the streamer what to do, including instructions phrased as a question; not a request for information",
      spam: "Unsolicited advertising, self-promotion, follower selling, or promotional links; not ordinary cheering, repeated emotes, or a useful link",
    },
  ),
  toxic: noul(
    "Is this message insulting, hateful or harassing towards someone?",
    {
      true: "Insults, slurs, threats or personal attacks on the streamer or another viewer",
      false: "Friendly, neutral, or light banter with no target",
    },
  ),
  spoiler: noul(
    "Does this message reveal a plot point or ending of the game being played?",
  ),
};
/** Reapply the source policy to existing answers, without any inference. */
export function decide(
  result: Pick<Classification, "category" | "toxic" | "spoiler">,
  rules: Rules = RULES,
): Decision {
  if (result.toxic >= TOXIC_AT) return { action: "hide", reason: "toxic" };
  const action = rules[result.category];
  if (action === "hide") return { action, reason: result.category };
  if (result.spoiler >= SPOILER_AT)
    return { action: "blur", reason: "spoiler" };
  return { action, reason: result.category };
}
