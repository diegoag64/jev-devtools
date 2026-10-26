// Authored illustration, not a Wikipedia extract or legal advice.
export const sampleDocument = `Synthetic regulatory briefing for a batching demonstration.
The GDPR is an EU regulation concerning personal data. It describes rights including access, erasure and portability, obligations for controllers and processors, and supervisory enforcement. Some organisations outside the EU fall within its scope. Consent requires affirmative action; pre-ticked boxes do not provide it. Data protection officer requirements depend on processing activities. Certain breaches must be notified within 72 hours. Administrative fines can reach EUR 20 million or 4% of worldwide annual turnover, whichever is greater. The regulation is not a United States federal law. This abbreviated authored context is not the original article and cannot reproduce its evaluation.`;
export const parallelQuestionsCases = {
  stable: {
    label: "Identical repeats · fixed synthetic answers",
    message: sampleDocument,
  },
  varied: {
    label: "Varying repeats · synthetic metric boundaries",
    message: sampleDocument,
  },
} as const;
export type ParallelQuestionsCase = keyof typeof parallelQuestionsCases;
export function isParallelQuestionsCase(
  value: unknown,
): value is ParallelQuestionsCase {
  return (
    typeof value === "string" && Object.hasOwn(parallelQuestionsCases, value)
  );
}
