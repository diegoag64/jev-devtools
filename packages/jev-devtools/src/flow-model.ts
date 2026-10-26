import type { AnswerView, Json } from "./protocol.js";
export function findImage(value: Json): string | undefined {
  if (!value || typeof value !== "object") return;
  if (
    !Array.isArray(value) &&
    typeof value.preview === "string" &&
    /^data:image\/(png|jpeg);base64,/.test(value.preview)
  )
    return value.preview;
  for (const child of Object.values(value)) {
    const result = findImage(child);
    if (result) return result;
  }
}
export function flowAnswer(answer?: AnswerView) {
  if (!answer) return [];
  if (answer.type === "choice")
    return Object.entries(answer.probabilities ?? {}).map(
      ([label, probability]) => ({
        label,
        detail: `${Number((probability * 100).toPrecision(6))}% probability`,
        active: label === answer.choice,
        eyebrow: label === answer.choice ? "RETURNED CHOICE" : "ALTERNATIVE",
      }),
    );
  if (answer.type === "score" && answer.score !== undefined)
    return [
      {
        label: `Score ${answer.score}`,
        detail: "Returned by Jev",
        active: true,
        eyebrow: "RETURNED SCORE",
      },
    ];
  if (answer.type === "noul" && answer.noul !== undefined)
    return [
      {
        label: "True",
        detail: `${Math.round(answer.noul * 100)}% probability`,
        active: true,
        eyebrow: "P(TRUE)",
        probability: answer.noul,
      },
      {
        label: "False",
        detail: `${Math.round((1 - answer.noul) * 100)}% probability`,
        active: true,
        eyebrow: "P(FALSE)",
        probability: 1 - answer.noul,
      },
    ];
  if (answer.type === "box" && answer.box)
    return [
      {
        label: "Region coordinates",
        detail: "Your application decides how to use this region.",
        active: true,
        eyebrow: "RETURNED BOX",
      },
    ];
  return [];
}
