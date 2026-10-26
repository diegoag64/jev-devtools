import { defineJevFlow } from "jev-devtools/flow";
import { twitchCases, isTwitchCase, type TwitchCase } from "./cases.js";
import { fixtures, stream, type Message } from "./fixtures.js";
import {
  questions,
  categories,
  RULES,
  QUIET,
  TOXIC_AT,
  SPOILER_AT,
  decide,
  type Classification,
  type Decision,
} from "./recipe.js";
export function messageRequest(message: Message) {
  return { model: "jev-1.13.0", state: { stream, message }, questions };
}
export type ChatRow = {
  message: Message;
  classification: Classification;
  normal: Decision;
  quiet: Decision;
};
export type TwitchResult = {
  rows: ChatRow[];
  changed: number;
  stream: typeof stream;
};
export const twitchFlow = defineJevFlow<{
  message: string;
  caseId: TwitchCase;
}>("Cookbook · Twitch chat filter", (flow) => {
  const messages = flow.task(
    "load-chat",
    {
      input: flow.input,
      run: ({ caseId, message }) => {
        if (!isTwitchCase(caseId) || message !== twitchCases[caseId].message)
          throw new Error("No Twitch sample matches this input");
        return fixtures(caseId).map((row) => row.message);
      },
    },
    {
      title: "Load the finite sample feed",
      description:
        "Original 29-message feed or authored boundary cases. Answers are synthetic; there is no Twitch connection.",
    },
  );
  const rows = flow.map(
    "classify-chat",
    { items: messages, input: null, concurrency: 8, maxItems: 29 },
    (item) => {
      const response = item.jev(
        "classify-message",
        {
          input: item.input.get("item"),
          request: messageRequest,
        },
        {
          title: "Classify one message",
          description:
            "One request contains category Choice, toxic Noul and spoiler Noul, with the original stream context.",
        },
      );
      const classification = item.task(
        "read-classification",
        {
          input: response.answers,
          run: (answers): Classification => {
            const category = answers.category.choice;
            if (!categories.includes(category))
              throw new Error("Unknown message category");
            return {
              category,
              probabilities: answers.category.probabilities,
              confidence: answers.category.confidence,
              toxic: answers.toxic.noul,
              spoiler: answers.spoiler.noul,
            };
          },
        },
        {
          title: "Read label and probabilities",
          description:
            "Use the winning category label. Choice confidence and category probabilities are inspectable but do not gate the policy; Nouls are separate probabilities.",
        },
      );
      const categoryAction = item.task(
        "category-action",
        {
          input: classification.get("category"),
          run: (category) => RULES[category],
        },
        { title: "Look up category action" },
      );
      const normal = item.if(
        "toxic-threshold",
        {
          when: classification.get("toxic").gte(TOXIC_AT),
          then: (path) =>
            path.task(
              "hide-toxic",
              {
                input: null,
                run: (): Decision => ({ action: "hide", reason: "toxic" }),
              },
              { title: "Hide toxic message" },
            ),
          else: (path) =>
            path.if(
              "category-hidden",
              {
                when: categoryAction.eq("hide"),
                then: (hidden) =>
                  hidden.task(
                    "hide-category",
                    {
                      input: classification.get("category"),
                      run: (category): Decision => ({
                        action: "hide",
                        reason: category,
                      }),
                    },
                    { title: "Hide by category" },
                  ),
                else: (visible) =>
                  visible.if(
                    "spoiler-threshold",
                    {
                      when: classification.get("spoiler").gte(SPOILER_AT),
                      then: (blurred) =>
                        blurred.task(
                          "blur-spoiler",
                          {
                            input: null,
                            run: (): Decision => ({
                              action: "blur",
                              reason: "spoiler",
                            }),
                          },
                          { title: "Blur spoiler" },
                        ),
                      else: (shown) =>
                        shown.task(
                          "remaining-action",
                          {
                            input: {
                              action: categoryAction,
                              category: classification.get("category"),
                            },
                            run: ({ action, category }): Decision => ({
                              action,
                              reason: category,
                            }),
                          },
                          { title: "Apply remaining category action" },
                        ),
                    },
                    { title: "Spoiler ≥ 0.70?" },
                  ),
              },
              { title: "Does category hide?" },
            ),
        },
        {
          title: "Toxic ≥ 0.70?",
          description:
            "First match wins: toxic hide, category hide, spoiler blur, remaining category action.",
        },
      );
      return item.task(
        "reapply-quiet",
        {
          input: { message: item.input.get("item"), classification, normal },
          run: ({ message, classification, normal }): ChatRow => ({
            message,
            classification,
            normal,
            quiet: decide(classification, QUIET),
          }),
        },
        {
          title: "Reapply quiet policy · no request",
          description:
            "Reuse the same answers. Quiet hides hype and dims conversation, preserving toxic/category/spoiler precedence.",
        },
      );
    },
    {
      title: "Filter messages · eight at a time",
      description:
        "One request per message. Finite map returns results in input order, even when requests finish out of order. Select an item and View Flow to inspect its policy path.",
    },
  );
  const result = flow.task(
    "assemble-chat",
    {
      input: rows,
      run: (rows): TwitchResult => ({
        rows,
        stream,
        changed: rows.filter(
          (row) =>
            row.normal.action !== row.quiet.action ||
            row.normal.reason !== row.quiet.reason,
        ).length,
      }),
    },
    {
      title: "Assemble ordered views",
      description:
        "Count actual policy changes over the same classified feed. No new inference.",
    },
  );
  return flow.output("filtered-chat", result, {
    title: "Review normal and quiet chat",
    description:
      "Synthetic answers demonstrate application policy, not measured moderation quality.",
  });
});
