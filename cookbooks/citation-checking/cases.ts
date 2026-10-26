export const citationCases = {
  original: {
    label: "Eight official citations · synthetic answers",
    message:
      "Check all eight official RFC 7519 citations with synthetic Choice responses.",
  },
  missing: {
    label: "Fabricated quote · zero requests",
    message: "Check only the fabricated signature-reporting quote.",
  },
  section: {
    label: "No quoted text · named section",
    message: "Check the claim-only citation against section 4.1.6.",
  },
  boundary: {
    label: "Confidence below / at / above 0.80",
    message:
      "Compare three synthetic responses at confidence 0.7999, 0.80 and 0.8001.",
  },
  matching: {
    label: "Curly quotes, wrong section and rewording",
    message:
      "Compare normalized matching, a quote found outside its cited section, and a reworded quote.",
  },
} as const;
export type CitationCase = keyof typeof citationCases;
export const isCitationCase = (value: unknown): value is CitationCase =>
  typeof value === "string" && Object.hasOwn(citationCases, value);
