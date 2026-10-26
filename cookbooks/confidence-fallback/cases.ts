/** Authored descriptions, not SEC filings. Answers live only in server fixtures. */
export const confidenceCases = {
  below: {
    label: "Below cutoff · 0.899 → parent division",
    message:
      "Synthetic company: We manufacture optical instruments and measuring equipment. We also plan to develop software for our instruments.",
  },
  equal: {
    label: "At cutoff · 0.900 → industry group",
    message:
      "Synthetic company: We accept deposits and provide commercial banking services to local businesses and households.",
  },
  above: {
    label: "Above cutoff · 0.901 → industry group",
    message:
      "Synthetic company: We manufacture packaged food products, including prepared meats and dairy products.",
  },
  services: {
    label: "Low confidence · different parent division",
    message:
      "Synthetic company: We provide engineering consulting and research services, and are developing a new computer service business.",
  },
} as const;
export type ConfidenceCase = keyof typeof confidenceCases;
export function isConfidenceCase(value: unknown): value is ConfidenceCase {
  return typeof value === "string" && Object.hasOwn(confidenceCases, value);
}
