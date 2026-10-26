import { defineJevFlow } from "jev-devtools/flow";
import type { CitationCase } from "./cases.js";
import {
  source,
  loadSource,
  splitSections,
  sampleCitations,
  locate,
  relationQuestions,
  AUTO_ACCEPT,
  relationToVerdict,
  type CitationRow,
} from "./recipe.js";
export type CitationResult = { rows: CitationRow[] };
export const citationFlow = defineJevFlow<{
  message: string;
  caseId: CitationCase;
}>("Cookbook · Citation checking", (flow) => {
  const prepared = flow.task(
    "prepare-source",
    {
      input: flow.input,
      run: ({ caseId, message }) => ({
        sections: splitSections(loadSource(source)),
        citations: sampleCitations(caseId, message),
      }),
    },
    {
      title: "Clean RFC and split numbered sections",
      description:
        "Remove page headers/footers; appendices terminate numbered sections. Load a fixed citation sample on the server.",
    },
  );
  const rows = flow.map(
    "check-citations",
    {
      items: prepared.get("citations"),
      input: prepared.get("sections"),
      maxItems: 8,
      concurrency: 1,
    },
    (item) => {
      const evidence = item.task(
        "locate-quote",
        {
          input: item.input,
          run: ({ item: citation, context: sections }) =>
            locate(sections, citation),
        },
        {
          title: "Normalize and locate the quote",
          description:
            "Collapse whitespace and fold curly quotes. Search numbered sections in numeric order, regardless of the cited section. Null quotes use their named section.",
        },
      );
      return item.if(
        "quote-missing",
        {
          when: evidence.get("status").eq("missing"),
          then: (path) =>
            path.task(
              "fabricated",
              {
                input: evidence,
                run: (evidence): CitationRow => ({
                  ...evidence,
                  answer: null,
                  verdict: "fabricated",
                  confidence: null,
                  auto: true,
                }),
              },
              {
                title: "Fabricated · no Jev request",
                description:
                  "The normalized quote is absent. This deterministic verdict has no model confidence.",
              },
            ),
          else: (path) => {
            const assessed = path.jev(
              "assess-support",
              {
                input: evidence,
                request: ({ citation, section }) => ({
                  model: "jev-1.12",
                  state: { claim: citation.claim, section },
                  questions: relationQuestions,
                }),
              },
              {
                title: "Assess support in the actual section",
                description:
                  "One Choice: supports, contradicts or says_nothing. The quote match alone does not establish support.",
              },
            );
            const auto = path.if(
              "confidence-gate",
              {
                when: assessed.answer("relation").confidence.gte(AUTO_ACCEPT),
                then: (accepted) =>
                  accepted.task(
                    "accept-verdict",
                    {
                      input: assessed.answer("relation").confidence,
                      run: () => true,
                    },
                    {
                      title: "Accept verdict automatically",
                      description:
                        "API confidence is at least 0.80. This accepts any verdict, including contradicted or unsupported.",
                    },
                  ),
                else: (review) =>
                  review.task(
                    "human-review",
                    {
                      input: assessed.answer("relation").confidence,
                      run: () => false,
                    },
                    {
                      title: "Human review required",
                      description:
                        "API confidence is below 0.80. Retain the proposed verdict; no human action is performed by this sample.",
                    },
                  ),
              },
              {
                title: "API confidence ≥ 0.80?",
                description:
                  "Use returned confidence, not the winning option probability and not a Score.",
              },
            );
            return path.task(
              "record-verdict",
              {
                input: {
                  evidence,
                  answer: assessed.answers.get("relation"),
                  auto,
                },
                run: ({ evidence, answer, auto }): CitationRow => ({
                  ...evidence,
                  answer,
                  verdict: relationToVerdict[answer.choice],
                  confidence: answer.confidence,
                  auto,
                }),
              },
              { title: "Keep verdict and match evidence" },
            );
          },
        },
        {
          title: "Is the quote absent?",
          description:
            "Only an absent quoted string bypasses inference. A claim-only citation continues with its named section.",
        },
      );
    },
    {
      title: "Check citations in order",
      description:
        "One item per citation. Inspect each item for the match, optional Choice request and confidence route. Synthetic responses; no paid inference.",
    },
  );
  return flow.output(
    "citation-result",
    { rows },
    {
      title: "Review citation evidence",
      description:
        "All four verdicts, the proposed action and actual source section. Sample probabilities/confidences are authored fixtures.",
    },
  );
});
