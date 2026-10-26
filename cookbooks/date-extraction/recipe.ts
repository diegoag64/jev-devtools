import { readFileSync } from "node:fs";
import { choice } from "@typesafe-ai/sdk";

export const TODAY = "2026-07-30";
export const REVIEW_BELOW = 0.6;
export const MONTHS =
  "January February March April May June July August September October November December".split(
    " ",
  );
export const WEEKDAYS =
  "Monday Tuesday Wednesday Thursday Friday Saturday Sunday".split(" ");
export const PARTS = [
  "mode",
  "month",
  "day",
  "year",
  "day_anchor",
  "weekday",
  "week_offset",
] as const;
export type Part = (typeof PARTS)[number];
export type Parts = Partial<
  Record<Part, { choice: string; confidence?: number | null }>
>;
const templates: Record<
  Part,
  { instructions: string; criteria: Record<string, string | null> }
> = JSON.parse(
  readFileSync(new URL("./questions.json", import.meta.url), "utf8"),
);
export function dateQuestions(role: string) {
  return Object.fromEntries(
    PARTS.map((part) => [
      part,
      choice(
        templates[part].instructions.replaceAll("{role}", role),
        templates[part].criteria,
      ),
    ]),
  );
}
export function dateRequest(document: string, role: string) {
  return { model: "jev-1.12", state: document, questions: dateQuestions(role) };
}
const DAY = 86_400_000;
// JavaScript normalizes impossible dates. Round-trip the fields to retain Python date() validity.
function calendarDate(year: number, month: number, day: number): Date | null {
  if (![year, month, day].every(Number.isInteger) || year < 1 || year > 9999)
    return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}
const iso = (date: Date) => date.toISOString().slice(0, 10);
function parseReference(reference: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reference))
    throw new Error("Invalid reference date");
  const [y, m, d] = reference.split("-").map(Number);
  const date = calendarDate(y, m, d);
  if (!date) throw new Error("Invalid reference date");
  return date;
}
export function resolveWeekday(
  reference: string,
  weekday: string,
  offset: string,
): string {
  const today = parseReference(reference);
  const w = WEEKDAYS.indexOf(weekday);
  if (w < 0) throw new Error("Invalid weekday");
  const current = (today.getUTCDay() + 6) % 7;
  const days =
    offset === "next"
      ? 7 + w - current
      : offset === "current"
        ? w - current
        : (w - current + 7) % 7;
  return iso(new Date(today.getTime() + days * DAY));
}
export function assemble(parts: Parts, reference = TODAY) {
  const today = parseReference(reference);
  const used: Part[] = ["mode"];
  const selected = (part: Part) => parts[part]?.choice ?? "none";
  function result(date: string | null, note: string) {
    const components = PARTS.map((part) => {
      const confidence = parts[part]?.confidence;
      return {
        part,
        choice: selected(part),
        confidence:
          typeof confidence === "number" &&
          Number.isFinite(confidence) &&
          confidence >= 0 &&
          confidence <= 1
            ? confidence
            : null,
        used: used.includes(part),
      };
    });
    const usedComponents = components.filter((c) => c.used);
    const available = usedComponents.flatMap((c) =>
      c.confidence === null ? [] : [c.confidence],
    );
    const confidence = available.length ? Math.min(...available) : null;
    const missingConfidence = usedComponents.some((c) => c.confidence === null);
    return {
      date,
      confidence,
      missingConfidence,
      needsReview:
        date === null ||
        missingConfidence ||
        confidence === null ||
        confidence < REVIEW_BELOW,
      note,
      components,
    };
  }
  const mode = selected("mode");
  if (mode === "none") return result(null, "no such date stated");
  if (mode === "absolute") {
    used.push("month", "day", "year");
    const month = selected("month"),
      day = selected("day"),
      year = selected("year");
    if (!MONTHS.includes(month) || !/^\d+$/.test(day))
      return result(null, "absolute date incomplete");
    if (year === "out_of_range") return result(null, "year outside 1900-2050");
    const m = MONTHS.indexOf(month) + 1;
    if (year === "none") {
      let date = calendarDate(today.getUTCFullYear(), m, Number(day));
      if (!date) return result(null, `impossible date: ${month} ${day}`);
      if (date.getTime() < today.getTime() - 31 * DAY)
        date = calendarDate(today.getUTCFullYear() + 1, m, Number(day));
      // The source can raise for inferred leap-day rollover; keep this a reviewable null.
      return result(
        date ? iso(date) : null,
        date ? "" : `impossible inferred date: ${month} ${day}`,
      );
    }
    const date =
      /^\d+$/.test(year) && Number(year) >= 1900 && Number(year) <= 2050
        ? calendarDate(Number(year), m, Number(day))
        : null;
    return result(
      date ? iso(date) : null,
      date ? "" : `impossible date: ${year}-${month}-${day}`,
    );
  }
  if (mode === "relative") {
    used.push("day_anchor");
    const anchor = selected("day_anchor");
    const days = { today: 0, tomorrow: 1, day_after: 2 };
    if (Object.hasOwn(days, anchor))
      return result(
        iso(
          new Date(today.getTime() + days[anchor as keyof typeof days] * DAY),
        ),
        "",
      );
    if (anchor === "weekday") {
      used.push("weekday", "week_offset");
      const weekday = selected("weekday"),
        offset = selected("week_offset");
      if (!WEEKDAYS.includes(weekday))
        return result(null, "relative weekday not read");
      return result(resolveWeekday(reference, weekday, offset), "");
    }
    return result(null, "relative day not read");
  }
  return result(null, `unrecognized mode: ${mode}`);
}
export type DateAssembly = ReturnType<typeof assemble>;
