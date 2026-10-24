export const ragCases = {
  premise: {
    label: "False premise · conflicting evidence",
    message:
      "Refresh tokens expire after 30 days - how do I extend that window?",
  },
  lifetime: {
    label: "Answerable · evidence and excluded injection",
    message: "How long should an access token live?",
  },
  empty: {
    label: "No retrieved passages · empty collection",
    message: "What does this corpus say about lunar gardening?",
  },
} as const;
export type RagCase = keyof typeof ragCases;
export const isRagCase = (value: unknown): value is RagCase =>
  typeof value === "string" && Object.hasOwn(ragCases, value);
