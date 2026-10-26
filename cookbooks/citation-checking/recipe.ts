import { readFileSync } from "node:fs";
import { choice } from "@typesafe-ai/sdk";
import { citationCases, isCitationCase, type CitationCase } from "./cases.js";
export type Citation = {
  id: string;
  claim: string;
  quote: string | null;
  section: string;
};
export const source = readFileSync(
  new URL("./rfc7519.txt", import.meta.url),
  "utf8",
);
export const citations: Citation[] = JSON.parse(
  readFileSync(new URL("./citations.json", import.meta.url), "utf8"),
);
// Python splitlines() also splits form feeds, which occur at RFC page boundaries.
export function loadSource(raw: string): string {
  return raw
    .split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)
    .map((line) => line.replace(/^\f+/, ""))
    .filter(
      (line) =>
        !/^Jones, et al\.\s.*\[Page \d+\]$/.test(line) &&
        !/^RFC 7519\s+JSON Web Token \(JWT\)\s+May 2015$/.test(line),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
export function splitSections(text: string): Record<string, string> {
  const marks = [
    ...text.matchAll(/^(?:(\d+(?:\.\d+)*)\.  .+|Appendix [A-Z]\..*)$/gm),
  ];
  return Object.fromEntries(
    marks.flatMap((mark, i) =>
      mark[1]
        ? [
            [
              mark[1],
              text.slice(mark.index, marks[i + 1]?.index ?? text.length).trim(),
            ],
          ]
        : [],
    ),
  );
}
export function normalize(text: string): string {
  const quotes: Record<string, string> = {
    "“": '"',
    "”": '"',
    "‘": "'",
    "’": "'",
  };
  // Match Python Unicode whitespace: JS \s differs for NEL and BOM.
  return text
    .replace(/[“”‘’]/g, (char) => quotes[char])
    .replace(
      /[\t\n\v\f\r \x1c-\x1f\x85\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g,
      " ",
    )
    .replace(/^ +| +$/g, "");
}
function sectionOrder(a: string, b: string) {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
export function locate(sections: Record<string, string>, citation: Citation) {
  const normalizedQuote =
    citation.quote === null ? null : normalize(citation.quote);
  const sectionNumber =
    normalizedQuote === null
      ? citation.section
      : (Object.keys(sections)
          .sort(sectionOrder)
          .find((number) =>
            normalize(sections[number]).includes(normalizedQuote),
          ) ?? null);
  if (normalizedQuote === null && !Object.hasOwn(sections, citation.section))
    throw new Error(`Unknown cited section: ${citation.section}`);
  const section = sectionNumber === null ? null : sections[sectionNumber];
  const normalizedSection = section === null ? null : normalize(section);
  return {
    citation,
    status:
      normalizedQuote === null
        ? ("section-only" as const)
        : section === null
          ? ("missing" as const)
          : ("found" as const),
    sectionNumber,
    section,
    normalizedQuote,
    normalizedSection,
    matchOffset:
      normalizedQuote === null || normalizedSection === null
        ? null
        : normalizedSection.indexOf(normalizedQuote),
  };
}
export type Evidence = ReturnType<typeof locate>;
export const relationQuestions = {
  relation: choice("How does the section relate to the claim?", {
    supports:
      "The section states the claim or directly implies that it is true",
    contradicts:
      "The section states the opposite of the claim or implies it is false",
    says_nothing:
      "The section does not address what the claim asserts, either way",
  }),
};
export const AUTO_ACCEPT = 0.8;
export const relationToVerdict = {
  supports: "verified",
  contradicts: "contradicted",
  says_nothing: "unsupported",
} as const;
export type Relation = keyof typeof relationToVerdict;
export type Assessment = {
  choice: Relation;
  confidence: number;
  probabilities: Record<Relation, number>;
};
export type CitationRow = Evidence & {
  answer: Assessment | null;
  verdict: "fabricated" | (typeof relationToVerdict)[Relation];
  confidence: number | null;
  auto: boolean;
};
export function sampleCitations(
  caseId: CitationCase,
  message: string,
): Citation[] {
  if (!isCitationCase(caseId) || message !== citationCases[caseId].message)
    throw new Error("No citation sample matches this input");
  const aud = citations[1];
  switch (caseId) {
    case "original":
      return citations;
    case "missing":
      return [citations[2]];
    case "section":
      return [citations[6]];
    case "boundary":
      return ["below", "at", "above"].map((id) => ({ ...aud, id }));
    case "matching":
      return [
        {
          ...aud,
          id: "curly",
          quote: aud.quote!.replaceAll('"', "“").replaceAll(" ", "\n  "),
        },
        { ...aud, id: "wrong-section", section: "4.1.6" },
        { ...aud, id: "reworded", quote: aud.quote!.replace("MUST", "must") },
      ];
  }
}
