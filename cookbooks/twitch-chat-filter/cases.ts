export const twitchCases = {
  original: {
    label: "Original 29-message feed · synthetic answers",
    message:
      "Elden Ring first playthrough! No spoilers please — original 29-message feed.",
  },
  boundaries: {
    label: "Policy boundaries · synthetic messages and answers",
    message:
      "Boundary examples at 0.6999, 0.7000 and 0.7001, plus overlapping hide and blur rules.",
  },
};
export type TwitchCase = keyof typeof twitchCases;
export const isTwitchCase = (value: unknown): value is TwitchCase =>
  typeof value === "string" && Object.hasOwn(twitchCases, value);
