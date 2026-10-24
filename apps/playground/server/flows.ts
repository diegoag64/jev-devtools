import { choice, noul, type Fetch } from "@typesafe-ai/sdk";
import { defineJevFlow, all } from "jev-devtools/flow";
/** Reduced synthetic demonstration, not a port of the official skill cookbook. */
export const skillShortlistFlow = defineJevFlow<{ message: string }>(
  "Skill shortlist · synthetic sample",
  (flow) => {
    const ranking = flow.jev(
      "rank-skills",
      {
        state: flow.input,
        questions: {
          ranking: choice("Which skill fits this request?", {
            coding: "Build and debug software",
            diagrams: "Visualize concepts",
            writing: "Write and edit text",
            research: "Investigate a topic",
            planning: "Organize a project",
          }),
        },
      },
      {
        title: "Rank available skills",
        description:
          "Synthetic probabilities for five skills, shown with the complete request.",
      },
    );
    const shortlist = flow.task(
      "select-shortlist",
      {
        input: {
          probabilities: ranking.answer("ranking").probabilities,
          limit: 3,
        },
        run: ({ probabilities, limit }) =>
          Object.entries(probabilities)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([name]) => name),
      },
      {
        title: "Keep the top three skills",
        description:
          "Application code sorts the returned probabilities. Its output becomes the next request's Choice options.",
      },
    );
    const selection = flow.jev(
      "assess-shortlist",
      {
        input: { message: flow.input.get("message"), skills: shortlist },
        request: ({ message, skills }) => ({
          state: { message, skills },
          questions: {
            selected: choice(
              "Which shortlisted skill best fits?",
              Object.fromEntries(skills.map((name) => [name, null])),
            ),
          },
        }),
      },
      {
        title: "Assess the shortlist",
        description:
          "This request is constructed at runtime from the function's actual returned candidates.",
      },
    );
    return flow.output(
      "suggestion",
      { skill: selection.answer("selected").choice, shortlist },
      {
        title: "Suggested skill",
        description:
          "Return the selected skill to the app. No tool is invoked; responses are synthetic fixtures.",
      },
    );
  },
);
export const refundFlow = defineJevFlow<{ message: string }>(
  "refund-review",
  (flow) => {
    const triage = flow.jev(
      "triage",
      {
        state: flow.input,
        questions: {
          category: choice("Is this a refund request?", {
            refund: null,
            other: null,
          }),
        },
      },
      {
        title: "Understand the request",
        description: "Classify the message before choosing a review path.",
      },
    );
    return flow.branch(
      "refund-request",
      {
        when: triage.answer("category").choice.eq("refund"),
        then: (branch) => {
          const review = branch.jev(
            "review",
            {
              state: {
                ticket: flow.input,
                category: triage.answer("category").choice,
              },
              questions: {
                eligible: noul("Is the refund eligible?"),
                risky: noul("Is this risky?"),
              },
            },
            {
              title: "Review the refund",
              description:
                "Evaluate eligibility and risk together against the same ticket.",
            },
          );
          return branch.branch(
            "approval",
            {
              when: all(
                review.answer("eligible").noul.gte(0.9),
                review.answer("risky").noul.lt(0.2),
              ),
              then: (path) =>
                path.output(
                  "approve",
                  {
                    eligibility: review.answer("eligible").noul,
                  },
                  {
                    title: "Ready for approval",
                    description:
                      "Eligibility is at least 90% and risk is below 20%. Return eligibility to the application; no refund is issued here.",
                  },
                ),
              else: (path) =>
                path.output("manual-review", undefined, {
                  title: "Needs human review",
                  description:
                    "Eligibility or risk did not meet the approval thresholds. Use this outcome to request a closer review.",
                }),
            },
            {
              title: "Meets the approval thresholds?",
              description:
                "Continue only when eligibility is at least 90% and risk is below 20%.",
            },
          );
        },
        else: (branch) =>
          branch.output("other", undefined, {
            title: "Different request type",
            description:
              "The message was not classified as a refund. Let the application choose another support path.",
          }),
      },
      {
        title: "Is this a refund?",
        description:
          "Refund requests continue to review. Other messages take a separate outcome.",
      },
    );
  },
);
export const parallelFlow = defineJevFlow<{ message: string }>(
  "parallel-review",
  (flow) => {
    const checks = flow.parallel(
      "checks",
      {
        eligibility: (lane) =>
          lane
            .jev(
              "eligibility",
              {
                state: flow.input,
                questions: { eligible: noul("Eligible?") },
              },
              {
                title: "Check eligibility",
                description:
                  "Evaluate whether this request qualifies while the risk check runs alongside it.",
              },
            )
            .answer("eligible").noul,
        risk: (lane) =>
          lane
            .jev(
              "risk",
              {
                state: flow.input,
                questions: { risky: noul("Risky?") },
              },
              {
                title: "Assess risk",
                description:
                  "Estimate risk independently using the same ticket context.",
              },
            )
            .answer("risky").noul,
      },
      {
        title: "Bring the checks together",
        description:
          "Both checks run concurrently. Their results become available to the readiness request only after both finish successfully.",
      },
    );
    const decision = flow.jev(
      "combined",
      {
        state: {
          ticket: flow.input,
          eligibility: checks.eligibility,
          risk: checks.risk,
        },
        questions: { ready: noul("Ready for approval?") },
      },
      {
        title: "Decide readiness",
        description:
          "Use the ticket, eligibility and risk together to evaluate readiness for approval.",
      },
    );
    return flow.branch(
      "ready",
      {
        when: decision.answer("ready").noul.gte(0.9),
        then: (p) =>
          p.output(
            "ready-output",
            {
              eligibility: checks.eligibility,
              risk: checks.risk,
            },
            {
              title: "Ready for approval",
              description:
                "Readiness is at least 90%. Return eligibility and risk to the application for its next action.",
            },
          ),
        else: (p) =>
          p.output("review-output", undefined, {
            title: "Needs a closer look",
            description:
              "Readiness is below 90%. Use this outcome to ask for human review before proceeding.",
          }),
      },
      {
        title: "Ready to proceed?",
        description:
          "Use a 90% readiness threshold to choose between approval and a closer review.",
      },
    );
  },
);
/** Deterministic fixtures, never inference. Delay makes progress/cancellation visible. */
export function flowTransport(scenario: string): Fetch {
  return async (_url, init) => {
    await new Promise<void>((resolve, reject) => {
      const signal = init?.signal;
      const timer = setTimeout(
        () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        },
        scenario === "flow-cancel" ? 5000 : 500,
      );
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(signal?.reason);
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
    const req = JSON.parse(String(init?.body));
    if (scenario === "flow-functions") {
      const ranking = !!req.questions.ranking;
      const names = Object.keys(
        req.questions[ranking ? "ranking" : "selected"].criteria,
      );
      const weights = ranking
        ? [0.44, 0.27, 0.14, 0.1, 0.05]
        : [0.65, 0.25, 0.1];
      return Response.json({
        model: "synthetic-skill-sample",
        answers: {
          [ranking ? "ranking" : "selected"]: {
            type: "choice",
            choice: names[0],
            confidence: ranking ? 0.4 : 0.7,
            probabilities: Object.fromEntries(
              names.map((name, i) => [name, weights[i]]),
            ),
          },
        },
      });
    }
    if (scenario === "flow-error" && !req.questions.category)
      return Response.json(
        { error: { message: "Sample review failed" } },
        { status: 400 },
      );
    const answers = Object.fromEntries(
      Object.entries(req.questions as Record<string, { type: string }>).map(
        ([key, q]) => [
          key,
          q.type === "choice"
            ? {
                type: "choice",
                choice: scenario === "flow-other" ? "other" : "refund",
                probabilities: {
                  refund: scenario === "flow-other" ? 0.1 : 0.9,
                  other: scenario === "flow-other" ? 0.9 : 0.1,
                },
                confidence: 0.9,
              }
            : {
                type: "noul",
                noul:
                  key === "risky"
                    ? 0.1
                    : scenario === "flow-manual"
                      ? 0.65
                      : 0.94,
              },
        ],
      ),
    );
    return Response.json({ model: "sample-flow", answers });
  };
}
