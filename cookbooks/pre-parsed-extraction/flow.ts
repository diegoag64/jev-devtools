import { defineJevFlow, not } from "jev-devtools/flow";
import {
  extractionCases,
  isExtractionCase,
  type ExtractionCase,
  type ExtractionKind,
} from "./cases.js";
import {
  findCandidates,
  selectionPlan,
  selectionRequest,
  creditRequest,
  toDecimal,
  normalizeContact,
  NONE,
  type Selection,
  type Normalized,
} from "./recipe.js";
export type ExtractionResult = {
  document: string;
  kind: ExtractionKind;
  candidates: string[];
  selections: Selection[];
  rows: Normalized[];
};
export const extractionFlow = defineJevFlow<{
  message: string;
  caseId: ExtractionCase;
}>("Cookbook · Pre-parsed value extraction", (flow) => {
  const prepared = flow.task(
    "find-candidates",
    {
      input: flow.input,
      run: ({ message, caseId }) => {
        if (
          !isExtractionCase(caseId) ||
          message !== extractionCases[caseId].message
        )
          throw new Error("No extraction sample matches this document");
        const kind = extractionCases[caseId].kind;
        const candidates = findCandidates(kind, message);
        return {
          kind,
          candidates,
          document: message,
          plan: selectionPlan(kind, candidates),
        };
      },
    },
    {
      title: "Find candidates in document order",
      description:
        "Run the recipe regex, trim and deduplicate exact spans. Validate the fixed sample before any request.",
    },
  );
  const selections = flow.if(
    "has-candidates",
    {
      when: prepared.get("candidates").get("length").gt(0),
      then: (path) =>
        path.map(
          "separate-helper-calls",
          {
            items: prepared.get("plan"),
            input: { document: prepared.get("document") },
            concurrency: 1,
            maxItems: 3,
          },
          (item) => {
            const response = item.jev(
              "select",
              {
                input: item.input,
                request: ({ item: spec, context }) =>
                  selectionRequest(context.document, spec),
              },
              {
                title: "One helper, one Choice request",
                description:
                  "Preserve source order; candidate selections include none. Country and currency are separate fixed-label calls.",
              },
            );
            return item.task(
              "read-selection",
              {
                input: {
                  spec: item.input.get("item"),
                  answers: response.answers,
                },
                run: ({ spec, answers }): Selection => {
                  const answer = answers[spec.helper === "pick" ? "pick" : "q"];
                  if (
                    answer.type !== "choice" ||
                    !(
                      spec.options.includes(answer.choice) ||
                      (spec.helper === "pick" && answer.choice === NONE)
                    )
                  )
                    throw new Error("Selection is not an offered option");
                  return {
                    role: spec.role,
                    choice: answer.choice,
                    confidence: answer.confidence,
                    probabilities: answer.probabilities,
                  };
                },
              },
              {
                title: "Copy the selected label",
                description:
                  "Keep Choice confidence and probabilities separate. Neither gates normalization.",
              },
            );
          },
          {
            title: "Select values sequentially",
            description:
              "Email: receipt then sender. Phone: mobile then country. Money: currency, total, credit. No helper calls are batched.",
          },
        ),
      else: (path) =>
        path.task(
          "no-candidates",
          { input: prepared, run: (): Selection[] => [] },
          { title: "No candidates · no requests" },
        ),
    },
    { title: "Did the regex find candidates?" },
  );
  const rows = flow.if(
    "money-or-contact",
    {
      when: prepared.get("kind").eq("money"),
      then: (path) => {
        const amounts = path.task(
          "selected-amounts",
          {
            input: selections,
            run: (values) =>
              values.filter((s) => s.role === "total" || s.role === "credit"),
          },
          { title: "Total first, then credit" },
        );
        return path.map(
          "credit-checks",
          {
            items: amounts,
            input: { document: prepared.get("document"), selections },
            concurrency: 1,
            maxItems: 2,
          },
          (item) => {
            const chosen = item.input.get("item");
            return item.if(
              "has-selected-amount",
              {
                when: not(chosen.get("choice").eq(NONE)),
                then: (found) => {
                  const response = found.jev(
                    "is-credit",
                    {
                      input: {
                        document: item.input.get("context").get("document"),
                        amount: chosen.get("choice"),
                      },
                      request: ({ document, amount }) =>
                        creditRequest(document, amount),
                    },
                    {
                      title: "Ask about this selected amount",
                      description:
                        "A later, separate Noul uses the verbatim selected span in its instructions.",
                    },
                  );
                  const kind = found.if(
                    "credit-or-charge",
                    {
                      when: response.answers.get("q").get("noul").gt(0.5),
                      then: (arm) =>
                        arm.task("credit", {
                          input: chosen,
                          run: (): "credit" => "credit",
                        }),
                      else: (arm) =>
                        arm.task("charge", {
                          input: chosen,
                          run: (): "charge" => "charge",
                        }),
                    },
                    {
                      title: "P(credit) > 0.5?",
                      description:
                        "Strict source threshold: exactly 0.5 is a charge.",
                    },
                  );
                  return found.task(
                    "parse-decimal",
                    {
                      input: {
                        chosen,
                        kind,
                        probability: response.answers.get("q").get("noul"),
                        selections: item.input.get("context").get("selections"),
                      },
                      run: ({
                        chosen,
                        kind,
                        probability,
                        selections,
                      }): Normalized => {
                        const normalized = toDecimal(chosen.choice);
                        return {
                          role: chosen.role,
                          source: chosen.choice,
                          normalized,
                          currency:
                            selections.find((s) => s.role === "currency")
                              ?.choice ?? null,
                          probability,
                          kind,
                          status:
                            normalized === null
                              ? "Unsupported amount format"
                              : "Normalized in code",
                        };
                      },
                    },
                    {
                      title: "Parse a decimal string",
                      description:
                        "Comma grouping and dot decimals; no floating-point arithmetic. Keep magnitude and credit/charge separately, as in the recipe.",
                    },
                  );
                },
                else: (missing) =>
                  missing.task(
                    "no-amount",
                    {
                      input: chosen,
                      run: (chosen): Normalized => ({
                        role: chosen.role,
                        source: null,
                        normalized: null,
                        currency: null,
                        probability: null,
                        kind: null,
                        status: "No value to normalize",
                      }),
                    },
                    { title: "None · skip Noul and parsing" },
                  ),
              },
              { title: "Was an amount selected?" },
            );
          },
          {
            title: "Check and normalize each amount",
            description:
              "Total Noul and parsing complete before the credit Noul. Missing spans bypass both.",
          },
        );
      },
      else: (path) =>
        path.task(
          "normalize-contact",
          {
            input: { kind: prepared.get("kind"), selections },
            run: ({ kind, selections }) => normalizeContact(kind, selections),
          },
          {
            title: "Normalize email or phone",
            description:
              "Lowercase email; libphonenumber-js formats the selected phone with the selected country as E.164. None never reaches a parser.",
          },
        ),
    },
    { title: "Does this document contain money?" },
  );
  const result = flow.task(
    "assemble-result",
    {
      input: { prepared, selections, rows },
      run: ({ prepared, selections, rows }): ExtractionResult => ({
        document: prepared.document,
        kind: prepared.kind,
        candidates: prepared.candidates,
        selections,
        rows,
      }),
    },
    { title: "Show source, choices and normalized values" },
  );
  return flow.output("extracted-values", result, {
    title: "Pre-parsed values",
    description:
      "Synthetic selections with real deterministic extraction and normalization.",
  });
});
