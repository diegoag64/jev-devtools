/** Fixed queries only; every model response is an authored synthetic fixture. */
export const lineSearchCases = {
  ownership: {
    label: "Ownership · answered",
    message: "who owns the code I upload?",
  },
  termination: {
    label: "Termination · answered",
    message: "can GitHub kick me off the platform without warning?",
  },
  absent: {
    label: "Arbitration · strong top line, no answer",
    message: "do I have to take disputes to arbitration?",
  },
  partial: {
    label: "Parental permission · partial answer",
    message: "can minors use GitHub with parental permission?",
  },
  belowAbsent: {
    label: "Boundary · exists 0.3499",
    message: "do I have to take disputes to arbitration?",
  },
  atAbsent: {
    label: "Boundary · exists 0.35",
    message: "do I have to take disputes to arbitration?",
  },
  aboveAbsent: {
    label: "Boundary · exists 0.3501",
    message: "do I have to take disputes to arbitration?",
  },
  belowFound: {
    label: "Boundary · exists 0.6999",
    message: "who owns the code I upload?",
  },
  atFound: {
    label: "Boundary · exists 0.70",
    message: "who owns the code I upload?",
  },
  aboveFound: {
    label: "Boundary · exists 0.7001",
    message: "who owns the code I upload?",
  },
};
export type LineSearchCase = keyof typeof lineSearchCases;
export const isLineSearchCase = (value: unknown): value is LineSearchCase =>
  typeof value === "string" && Object.hasOwn(lineSearchCases, value);
