/** Authored synthetic cases, not cached official measurements. Safe for the browser. */
export const skillCases = {
  deck: {
    label: "Suggest a skill · Choice and fit disagree",
    message:
      "Create a branded pitch deck as a .pptx using our firm template and cite the source of each valuation number.",
  },
  explain: {
    label: "No skill needed · skip the second request",
    message: "Explain what a monad is in plain language, without using tools.",
  },
  unsupported: {
    label: "Nothing fits · reject the shortlist",
    message: "Add these three cards to our Trello backlog.",
  },
} as const;
export type SkillCase = keyof typeof skillCases;
export function isSkillCase(value: unknown): value is SkillCase {
  return typeof value === "string" && Object.hasOwn(skillCases, value);
}
