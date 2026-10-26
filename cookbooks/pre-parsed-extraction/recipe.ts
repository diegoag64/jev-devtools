import { choice, noul } from "@typesafe-ai/sdk";
import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import type { ExtractionKind } from "./cases.js";
export const NONE = "none";
// The recipe's recall-tuned regexes. Matching/deduplication is case-sensitive.
const patterns = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone: /\(?\+?\d[\d\s()\-.]{6,}\d/g,
  money: /[$€£¥]\s?\d[\d,]*(?:\.\d{2})?/g,
};
export function findCandidates(
  kind: ExtractionKind,
  document: string,
): string[] {
  return [
    ...new Set(
      [...document.matchAll(new RegExp(patterns[kind]))]
        .map((m) => m[0].trim())
        .filter(Boolean),
    ),
  ];
}
export const prompts = {
  receipt: "Which email address does the sender want their receipt sent to?",
  sender: "Which email address did this message come from (the From line)?",
  mobile: "Which of these is the direct mobile / cell number?",
  country: "In what country is this office located?",
  currency: "What currency are these amounts in?",
  total: "Which amount is the total the customer must pay?",
  credit: "Which amount is the courtesy credit that was applied?",
} as const;
export const countries = ["US", "GB", "DE", "FR", "CA", "AU"];
export const currencies = ["USD", "EUR", "GBP", "JPY", "CAD"];
export type SelectionSpec = {
  role: keyof typeof prompts;
  helper: "pick" | "classify";
  options: string[];
};
export type Selection = {
  role: keyof typeof prompts;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export function selectionPlan(
  kind: ExtractionKind,
  candidates: string[],
): SelectionSpec[] {
  // Empty candidates are an explicit local bypass, not a fabricated Choice.
  if (!candidates.length) return [];
  if (candidates.length > 254)
    throw new Error(
      "At most 254 candidates plus none are supported; narrow the document first",
    );
  const pick = (role: SelectionSpec["role"]): SelectionSpec => ({
    role,
    helper: "pick",
    options: candidates,
  });
  if (kind === "email") return [pick("receipt"), pick("sender")];
  if (kind === "phone")
    return [
      pick("mobile"),
      { role: "country", helper: "classify", options: countries },
    ];
  return [
    { role: "currency", helper: "classify", options: currencies },
    pick("total"),
    pick("credit"),
  ];
}
export function selectionRequest(document: string, spec: SelectionSpec) {
  const criteria: Record<string, string | null> = Object.fromEntries(
    spec.options.map((option) => [option, null]),
  );
  if (spec.helper === "pick")
    criteria[NONE] = "None of these is the requested value.";
  return {
    model: "jev-1.12",
    state: document,
    questions: {
      [spec.helper === "pick" ? "pick" : "q"]: choice(
        prompts[spec.role],
        criteria,
      ),
    },
  };
}
export function creditRequest(document: string, amount: string) {
  return {
    model: "jev-1.12",
    state: document,
    questions: {
      q: noul(
        `Is the amount ${amount} a credit or refund to the customer, not a charge?`,
      ),
    },
  };
}
// Decimal-safe canonical string; no Number/parseFloat conversion. US-style
// comma grouping and dot decimals only, matching the source's stated scope.
export function toDecimal(value: string): string | null {
  if (value === NONE) return null;
  if (!/^[$€£¥]\s?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/.test(value))
    return null;
  const digits = value.replace(/[^\d.]/g, "");
  const [integer, fraction] = digits.split(".");
  return (
    integer.replace(/^0+(?=\d)/, "") +
    (fraction === undefined ? "" : `.${fraction}`)
  );
}
export function normalizePhone(value: string, country: string): string | null {
  if (value === NONE || !countries.includes(country)) return null;
  return (
    parsePhoneNumberFromString(value, {
      defaultCountry: country as CountryCode,
      extract: false,
    })?.number ?? null
  );
}
export type Normalized = {
  role: string;
  source: string | null;
  normalized: string | null;
  currency: string | null;
  probability: number | null;
  kind: "credit" | "charge" | null;
  status: string;
};
export function normalizeContact(
  kind: ExtractionKind,
  selections: Selection[],
): Normalized[] {
  return selections
    .filter((s) => s.role !== "country")
    .map((s) => {
      const normalized =
        s.choice === NONE
          ? null
          : kind === "email"
            ? s.choice.toLowerCase()
            : normalizePhone(
                s.choice,
                selections.find((x) => x.role === "country")?.choice ?? "",
              );
      return {
        role: s.role,
        source: s.choice === NONE ? null : s.choice,
        normalized,
        currency: null,
        probability: null,
        kind: null,
        status:
          normalized === null ? "No value to normalize" : "Normalized in code",
      };
    });
}
