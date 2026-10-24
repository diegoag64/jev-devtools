export type Extraction = {
  registration_open_date: string;
  description: string;
};
const empty: Extraction = { registration_open_date: "", description: "" };
const supported: Extraction = {
  registration_open_date: "2026-08-01",
  description: "Registration opens for the fall semester",
};
const calendar =
  "University calendar. Home | Events | Admissions | Contact. No event details are available on this page.";
const event = "Fall semester registration opens on August 1, 2026.";
/** Authored fixtures. None of these probabilities are measured model results. */
export const sdeCases = {
  fabricated: {
    label: "Escalate · fabricated description",
    message: calendar,
    cheap: { ...empty, description: supported.description },
    strong: empty,
    flag: "description::hallucinated",
    probability: 0.95,
    overall: 0.56,
  },
  supported: {
    label: "Accept · overall judge alone is high",
    message: event,
    cheap: supported,
    strong: supported,
    flag: "description::off_target",
    probability: 0.12,
    overall: 0.96,
  },
  boundary: {
    label: "Accept · exactly 70%",
    message: event,
    cheap: supported,
    strong: supported,
    flag: "description::hallucinated",
    probability: 0.7,
    overall: 0.9,
  },
  missing: {
    label: "Escalate · wrongly empty date",
    message: event,
    cheap: { ...supported, registration_open_date: "" },
    strong: supported,
    flag: "registration_open_date::absence_wrong",
    probability: 0.91,
    overall: 0.3,
  },
} satisfies Record<
  string,
  {
    label: string;
    message: string;
    cheap: Extraction;
    strong: Extraction;
    flag: string;
    probability: number;
    overall: number;
  }
>;
export type SdeCase = keyof typeof sdeCases;
export const isSdeCase = (value: unknown): value is SdeCase =>
  typeof value === "string" && Object.hasOwn(sdeCases, value);
