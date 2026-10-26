export const dateCases = {
  official: {
    label: "Official documents \u00b7 synthetic readings",
    entries: [
      {
        id: "effective",
        document:
          "This agreement is effective January 1, 2025 and expires December 31, 2027.",
        role: "the date the agreement takes effect",
      },
      {
        id: "expires",
        document:
          "This agreement is effective January 1, 2025 and expires December 31, 2027.",
        role: "the date the agreement expires",
      },
      {
        id: "form",
        document: "Please return the signed form by August 14.",
        role: "the deadline to return the form",
      },
      {
        id: "kickoff",
        document: "Please return the signed form by August 14.",
        role: "the date of the kickoff call",
      },
      {
        id: "survey",
        document: "Heads up - the customer survey closes today at 5pm.",
        role: "the date the survey closes",
      },
      {
        id: "review",
        document: "Let's schedule the design review for next Thursday.",
        role: "the date of the design review",
      },
    ],
    message:
      "the date the agreement takes effect\nThis agreement is effective January 1, 2025 and expires December 31, 2027.\n\nthe date the agreement expires\nThis agreement is effective January 1, 2025 and expires December 31, 2027.\n\nthe deadline to return the form\nPlease return the signed form by August 14.\n\nthe date of the kickoff call\nPlease return the signed form by August 14.\n\nthe date the survey closes\nHeads up - the customer survey closes today at 5pm.\n\nthe date of the design review\nLet's schedule the design review for next Thursday.",
  },
  calendar: {
    label: "Calendar rules \u00b7 weekday and missing year",
    entries: [
      {
        id: "tomorrow",
        document: "The event is tomorrow.",
        role: "the date of the event",
      },
      {
        id: "day-after",
        document: "The event is the day after tomorrow.",
        role: "the date of the event",
      },
      {
        id: "bare",
        document: "The event is Thursday.",
        role: "the date of the event",
      },
      {
        id: "current",
        document: "The event was this Monday.",
        role: "the date of the event",
      },
      {
        id: "next",
        document: "The event is next Monday.",
        role: "the date of the event",
      },
      {
        id: "31-days",
        document: "The event is June 29.",
        role: "the date of the event",
      },
      {
        id: "32-days",
        document: "The event is June 28.",
        role: "the date of the event",
      },
    ],
    message:
      "the date of the event\nThe event is tomorrow.\n\nthe date of the event\nThe event is the day after tomorrow.\n\nthe date of the event\nThe event is Thursday.\n\nthe date of the event\nThe event was this Monday.\n\nthe date of the event\nThe event is next Monday.\n\nthe date of the event\nThe event is June 29.\n\nthe date of the event\nThe event is June 28.",
  },
  invalid: {
    label: "Review \u00b7 absent, incomplete or impossible",
    entries: [
      {
        id: "impossible",
        document: "The event is February 30, 2026.",
        role: "the date of the event",
      },
      {
        id: "outside",
        document: "The event is January 1, 2051.",
        role: "the date of the event",
      },
      {
        id: "incomplete",
        document: "The event is in August.",
        role: "the date of the event",
      },
      {
        id: "absent",
        document: "We will announce details later.",
        role: "the date of the event",
      },
      {
        id: "weekday-unread",
        document: "The event is next week.",
        role: "the date of the event",
      },
    ],
    message:
      "the date of the event\nThe event is February 30, 2026.\n\nthe date of the event\nThe event is January 1, 2051.\n\nthe date of the event\nThe event is in August.\n\nthe date of the event\nWe will announce details later.\n\nthe date of the event\nThe event is next week.",
  },
  thresholds: {
    label: "Confidence \u00b7 below, at, above and unavailable",
    entries: [
      {
        id: "below",
        document: "The event is tomorrow.",
        role: "the date of the event",
      },
      {
        id: "at",
        document: "The event is tomorrow.",
        role: "the date of the event",
      },
      {
        id: "above",
        document: "The event is tomorrow.",
        role: "the date of the event",
      },
      {
        id: "missing",
        document: "The event is tomorrow.",
        role: "the date of the event",
      },
      {
        id: "all-missing",
        document: "The event is tomorrow.",
        role: "the date of the event",
      },
      {
        id: "unused",
        document: "The event is tomorrow.",
        role: "the date of the event",
      },
    ],
    message:
      "the date of the event\nThe event is tomorrow.\n\nthe date of the event\nThe event is tomorrow.\n\nthe date of the event\nThe event is tomorrow.\n\nthe date of the event\nThe event is tomorrow.\n\nthe date of the event\nThe event is tomorrow.\n\nthe date of the event\nThe event is tomorrow.",
  },
};
export type DateCase = keyof typeof dateCases;
export type DateEntry = { id: string; document: string; role: string };
export const isDateCase = (value: unknown): value is DateCase =>
  typeof value === "string" && Object.hasOwn(dateCases, value);
