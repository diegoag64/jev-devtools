import { readFileSync } from "node:fs";
import { noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import {
  isRerankingCase,
  rerankingCases,
  type RerankingCase,
} from "./cases.js";
export type Candidate = {
  id: string;
  title: string;
  text: string;
  retrievalRank: number;
};
export type RankedCandidate = Candidate & { probability: number };
export const sourceQuestion = {
  is_cited_source: noul(
    "The query excerpt comes from a US federal court opinion and was written immediately around a citation to a precedent; the citation itself has been removed. Could the candidate passage be from that cited precedent — does it establish the specific legal proposition the query excerpt invokes at its citation point?",
    {
      true: "The candidate passage states or establishes the specific rule, standard, holding, or fact pattern that the query excerpt attributes to its removed citation.",
      false:
        "The candidate passage is merely on a similar topic or doctrine; it does not supply the specific proposition the query excerpt relies on.",
    },
  ),
};
const fixture: { id: string; title: string; text: string; noul: number }[] =
  JSON.parse(
    readFileSync(new URL("./retrieval-fixture.json", import.meta.url), "utf8"),
  );
export function retrieveSample(
  caseId: RerankingCase,
  message: string,
): Candidate[] {
  if (!isRerankingCase(caseId) || message !== rerankingCases[caseId].message)
    throw new Error("No re-ranking sample retrieval matches this query");
  return fixture.map(({ id, title, text }, index) => ({
    id,
    title,
    text,
    retrievalRank: index + 1,
  }));
}
export function sampleProbability(caseId: RerankingCase, candidateId: string) {
  const row = fixture.find((candidate) => candidate.id === candidateId);
  if (!row) throw new Error("Unknown sample candidate");
  return caseId === "ties" ? 0.5 : row.noul;
}
/** Python's sorted(..., key=lambda c: -noul) is stable: ties keep input order. */
export function rerank(rows: RankedCandidate[]): RankedCandidate[] {
  for (const row of rows) {
    if (
      !Number.isFinite(row.probability) ||
      row.probability < 0 ||
      row.probability > 1
    )
      throw new Error("Expected a Noul probability between 0 and 1");
  }
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.probability - a.row.probability || a.index - b.index)
    .map(({ row }) => row);
}
export type RerankingResult = {
  query: string;
  before: RankedCandidate[];
  after: RankedCandidate[];
};
export const rerankingFlow = defineJevFlow<{
  message: string;
  caseId: RerankingCase;
}>("Cookbook · Re-ranking", (flow) => {
  const candidates = flow.task(
    "retrieve-sample",
    {
      input: flow.input,
      run: ({ caseId, message }) => retrieveSample(caseId, message),
    },
    {
      title: "Load the retrieval fixture",
      description:
        "30 authored legal-style passages in fixed retrieval order. This task does not run BM25 or load CLERC.",
    },
  );
  const scored = flow.map(
    "score-candidates",
    {
      items: candidates,
      input: { query: flow.input.get("message") },
      concurrency: 12,
      maxItems: 30,
    },
    (item) => {
      const request = item.jev(
        "score-candidate",
        {
          model: "jev-1.12",
          state: {
            query_excerpt: item.input.get("context").get("query"),
            candidate_passage: item.input.get("item").get("text"),
          },
          questions: sourceQuestion,
        },
        {
          title: "Assess one candidate",
          description:
            "One independent Noul about the cited precedent. The sample probability is authored, not measured inference or Choice confidence.",
        },
      );
      return item.task(
        "attach-probability",
        {
          input: {
            candidate: item.input.get("item"),
            probability: request.answer("is_cited_source").noul,
          },
          run: ({ candidate, probability }): RankedCandidate => ({
            ...candidate,
            probability,
          }),
        },
        { title: "Keep candidate and probability" },
      );
    },
    {
      title: "Score the shortlist",
      description:
        "One request per candidate, at most 12 active. Collection items retain retrieval order, independent of completion order.",
    },
  );
  const sorted = flow.task(
    "sort-candidates",
    { input: scored, run: rerank },
    {
      title: "Sort by Noul, highest first",
      description:
        "A real stable sort: equal probabilities keep their original retrieval order. No threshold, normalization or candidate elimination.",
    },
  );
  return flow.output(
    "reranking-result",
    { query: flow.input.get("message"), before: scored, after: sorted },
    {
      title: "Compare candidate order",
      description:
        "Before and after contain the same candidates. Synthetic scores demonstrate sorting only; they do not measure retrieval quality.",
    },
  );
});
