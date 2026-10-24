import { readFileSync } from "node:fs";
import { choice, noul, type Questions } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";

export type Skill = {
  name: string;
  category: string;
  description: string;
  description_full: string;
  body: string;
};
export const roster: Skill[] = JSON.parse(
  readFileSync(new URL("./roster.json", import.meta.url), "utf8"),
);
const byName = new Map(roster.map((skill) => [skill.name, skill]));
if (roster.length !== 182 || byName.size !== roster.length)
  throw new Error("Invalid cookbook roster");
export const defaultModel = "jev-1.12";
export const gateThreshold = 0.3;
export const fitsThreshold = 0.3;
export const gateQuestions = {
  acts_on_user_system:
    "Is the assistant being asked to act on the user's files, accounts, devices, or online services, rather than only to explain or advise?",
  would_follow_documented_procedure:
    "Would a careful expert answering this consult a specific documented procedure or set of commands, rather than answering from general understanding?",
  prose_suffices:
    "Could a knowledgeable generalist fully satisfy this request in prose, with no tools, no documentation, and no access to the user's files or accounts?",
};
const hint = (names: string[]) =>
  `\n\n<skill_relevance>\n${
    names.length
      ? `Relevant to the current request: ${names.join(", ")}. Ignore this if it does not fit what the user actually asked for.`
      : "No skill in the roster appears relevant to this request."
  }\n</skill_relevance>`;

/** Port of the official suggest()/suggestion_block(), not the external-agent evaluation harness. */
export function createSkillSuggestionFlow(model = defaultModel) {
  return defineJevFlow<{ message: string }>(
    "Cookbook · Skill suggestion",
    (flow) => {
      const ranking = flow.jev(
        "rank-roster",
        {
          model,
          state: { request: flow.input.get("message"), recent_context: "" },
          questions: {
            which: choice(
              "Which of these skills, if any, is the right one to load to help with the user's latest request?",
              Object.fromEntries(
                roster.map((skill) => [skill.name, skill.description]),
              ),
            ),
            "gate::acts_on_user_system": noul(
              gateQuestions.acts_on_user_system,
            ),
            "gate::would_follow_documented_procedure": noul(
              gateQuestions.would_follow_documented_procedure,
            ),
            "gate::prose_suffices": noul(gateQuestions.prose_suffices),
          },
        },
        {
          title: "Rank all 182 skills",
          description:
            "One Choice ranks the complete official roster. Three independent Nouls assess whether the request needs a skill.",
        },
      );
      const wide = flow.task(
        "compute-request-gate",
        {
          input: {
            probabilities: ranking.answer("which").probabilities,
            acts: ranking.answer("gate::acts_on_user_system").noul,
            procedure: ranking.answer("gate::would_follow_documented_procedure")
              .noul,
            prose: ranking.answer("gate::prose_suffices").noul,
          },
          run: ({ probabilities, acts, procedure, prose }) => ({
            gate: (acts + procedure + (1 - prose)) / 3,
            oriented: {
              acts_on_user_system: acts,
              would_follow_documented_procedure: procedure,
              needs_more_than_prose: 1 - prose,
            },
            ranked: Object.entries(probabilities)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 12)
              .map(([name, probability]) => ({ name, probability })),
          }),
        },
        {
          title: "Does the request need a skill?",
          description:
            "Average acts-on-system, documented-procedure, and 1 − prose-suffices. This is application arithmetic, not another Jev call.",
        },
      );
      return flow.branch(
        "needs-skill",
        {
          when: wide.get("gate").gte(gateThreshold),
          else: (path) =>
            path.output(
              "no-skill-needed",
              {
                suggestions: [],
                gate: wide.get("gate"),
                shortlist: [],
                fits: {},
                winner: null,
                bestFit: null,
                suggestionBlock: hint([]),
              },
              {
                title: "Stay quiet",
                description:
                  "The oriented mean is below 0.30. Skip the shortlist assessment and return no suggestion.",
              },
            ),
          then: (path) => {
            const shortlist = path.task(
              "prepare-shortlist",
              {
                input: { ranked: wide.get("ranked") },
                run: ({ ranked }) =>
                  ranked.slice(0, 3).map(({ name, probability }) => {
                    const skill = byName.get(name);
                    if (!skill)
                      throw new Error("The model returned an unknown skill");
                    return {
                      name,
                      probability,
                      description: skill.description_full,
                      excerpt: skill.body,
                    };
                  }),
              },
              {
                title: "Read the top three skills",
                description:
                  "Select the three highest probabilities. Attach each full description and the first 700 Unicode characters of its SKILL.md.",
              },
            );
            const reranked = path.jev(
              "recheck-shortlist",
              {
                input: { message: flow.input.get("message"), shortlist },
                request: ({ message, shortlist }) => {
                  const questions: Questions & {
                    which: ReturnType<typeof choice>;
                  } = {
                    which: choice(
                      "Exactly one of these skills is the right one to load for the user's latest request. Which one? Read what each actually does, not just its name.",
                      Object.fromEntries(
                        shortlist.map((skill) => [
                          skill.name,
                          `${skill.description} — ${skill.excerpt}`,
                        ]),
                      ),
                    ),
                  };
                  for (const skill of shortlist)
                    questions[`fits::${skill.name}`] = noul(
                      `Does the skill '${skill.name}' do the specific thing the user's request asks for? It is described as: ${skill.description}`,
                    );
                  return {
                    model,
                    state: { request: message, recent_context: "" },
                    questions,
                  };
                },
              },
              {
                title: "Re-check the shortlist",
                description:
                  "Choice selects one candidate. A separate fits::<skill> Noul checks each candidate independently, allowing all three to be unsuitable.",
              },
            );
            const fit = path.task(
              "evaluate-candidate-fit",
              {
                input: { answers: reranked.answers, shortlist },
                run: ({ answers, shortlist }) => {
                  const fits = Object.fromEntries(
                    shortlist.map(({ name }) => {
                      const answer = answers[`fits::${name}`];
                      if (!answer || answer.type !== "noul")
                        throw new Error("Missing candidate fit answer");
                      return [name, answer.noul];
                    }),
                  );
                  const winner = answers.which.choice;
                  if (!Object.hasOwn(fits, winner))
                    throw new Error("Selected skill is outside the shortlist");
                  return {
                    winner,
                    fits,
                    bestFit: Math.max(...Object.values(fits)),
                  };
                },
              },
              {
                title: "Check whether any candidate fits",
                description:
                  "Take the maximum of the independent fit Nouls. This only gates abstention; it does not replace the returned Choice winner.",
              },
            );
            return path.branch(
              "any-candidate-fits",
              {
                when: fit.get("bestFit").gte(fitsThreshold),
                then: (accepted) => {
                  const suggestion = accepted.task(
                    "format-agent-hint",
                    {
                      input: {
                        winner: fit.get("winner"),
                        fits: fit.get("fits"),
                        bestFit: fit.get("bestFit"),
                        shortlist,
                        gate: wide.get("gate"),
                      },
                      run: (input) => ({
                        ...input,
                        suggestions: [input.winner],
                        suggestionBlock: hint([input.winner]),
                      }),
                    },
                    {
                      title: "Prepare the agent hint",
                      description:
                        "Wrap the Choice winner in the cookbook's skill_relevance block. It is a suggestion; no skill is executed.",
                    },
                  );
                  return accepted.output("suggest-skill", suggestion, {
                    title: "Suggest one skill",
                    description:
                      "The agent receives at most one name and may ignore it. The highest fit Noul need not belong to the Choice winner.",
                  });
                },
                else: (rejected) =>
                  rejected.output(
                    "nothing-fits",
                    {
                      suggestions: [],
                      gate: wide.get("gate"),
                      shortlist,
                      fits: fit.get("fits"),
                      winner: fit.get("winner"),
                      bestFit: fit.get("bestFit"),
                      suggestionBlock: hint([]),
                    },
                    {
                      title: "No suitable skill",
                      description:
                        "Even the highest candidate fit is below 0.30. Return no suggestion despite Choice having selected a candidate.",
                    },
                  ),
              },
              {
                title: "Any fit at least 0.30?",
                description:
                  "At the threshold, continue. Below it, abstain. Independent fit probabilities do not sum to one.",
              },
            );
          },
        },
        {
          title: "Request gate at least 0.30?",
          description:
            "The source cookbook continues at 0.30 or higher. Requests below the threshold make only one Jev call.",
        },
      );
    },
  );
}
