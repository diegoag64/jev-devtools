import { defineJevFlow } from "jev-devtools/flow";
import {
  dateCases,
  isDateCase,
  type DateCase,
  type DateEntry,
} from "./cases.js";
import { assemble, dateRequest, TODAY, type DateAssembly } from "./recipe.js";
export type DateRow = DateEntry & DateAssembly & { route: "review" | "accept" };
export type DateResult = {
  referenceDate: string;
  rows: DateRow[];
  accepted: number;
  review: number;
};
export const dateFlow = defineJevFlow<{ caseId: DateCase; message: string }>(
  "Cookbook · Date extraction",
  (flow) => {
    const entries = flow.task(
      "sample-roles",
      {
        input: flow.input,
        run: ({ caseId, message }): DateEntry[] => {
          if (!isDateCase(caseId) || message !== dateCases[caseId].message)
            throw new Error(
              "Date sample does not match the selected documents",
            );
          return dateCases[caseId].entries;
        },
      },
      {
        title: "Select sample documents and roles",
        description:
          "Fixed, server-validated samples. Each role receives one request, even when roles share a document.",
      },
    );
    const rows = flow.map(
      "extract-dates",
      { items: entries, input: null, concurrency: 1, maxItems: 7 },
      (item) => {
        const reading = item.jev(
          "read-date-parts",
          {
            input: item.input.get("item"),
            request: ({ document, role }) => dateRequest(document, role),
          },
          {
            title: "Read seven date parts",
            description:
              "One request for this role, preserving the official Choice questions. Answers and confidence are synthetic fixtures.",
          },
        );
        const assembled = item.task(
          "assemble-date",
          {
            input: { entry: item.input.get("item"), parts: reading.answers },
            run: ({ entry, parts }) => ({ ...entry, ...assemble(parts) }),
          },
          {
            title: "Assemble the calendar date",
            description:
              "Code validates the date and resolves relative dates against 2026-07-30. Confidence is the minimum among used components; missing used confidence requires review.",
          },
        );
        return item.if(
          "needs-review",
          {
            when: assembled.get("needsReview").eq(true),
            then: (path) =>
              path.task(
                "review-date",
                {
                  input: assembled,
                  run: (row) => ({ ...row, route: "review" as const }),
                },
                {
                  title: "Send date to review",
                  description:
                    "Unresolved date, missing used confidence, or minimum confidence strictly below 0.60. This returns data; no person is contacted.",
                },
              ),
            else: (path) =>
              path.task(
                "accept-date",
                {
                  input: assembled,
                  run: (row) => ({ ...row, route: "accept" as const }),
                },
                {
                  title: "Accept assembled date",
                  description:
                    "Resolved date with all used confidences available and a minimum of at least 0.60.",
                },
              ),
          },
          {
            title: "Does this date need review?",
            description:
              "The strict below-0.60 gate accepts exactly 0.60. Inspect the assembly task for the components actually used.",
          },
        );
      },
      {
        title: "Extract each requested date",
        description:
          "Sequential requests preserve source example order. Select a role and View Flow to inspect its questions, calendar math, and review branch.",
      },
    );
    const result = flow.task(
      "summarize-dates",
      {
        input: rows,
        run: (rows): DateResult => ({
          referenceDate: TODAY,
          rows,
          accepted: rows.filter((r) => r.route === "accept").length,
          review: rows.filter((r) => r.route === "review").length,
        }),
      },
      {
        title: "Collect dates and review decisions",
        description:
          "ISO date strings or null, in input order. Counts describe this synthetic walkthrough, not extraction accuracy.",
      },
    );
    return flow.output("date-results", result);
  },
);
