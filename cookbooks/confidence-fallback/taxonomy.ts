import { readFileSync } from "node:fs";
// Adapted from TypeSafe's MIT-licensed recipe; see provenance.json and LICENSE.typesafe.
export const divisions = [
  [1, 9, "agriculture, forestry and fishing"],
  [10, 14, "mining"],
  [15, 17, "construction"],
  [20, 39, "manufacturing"],
  [40, 49, "transportation, communications and utilities"],
  [50, 51, "wholesale trade"],
  [52, 59, "retail trade"],
  [60, 67, "finance, insurance and real estate"],
  [70, 89, "services"],
  [91, 99, "public administration"],
] as const;
export const industries: Record<string, string> = Object.fromEntries(
  readFileSync(new URL("./sic_codes.tsv", import.meta.url), "utf8")
    .trimEnd()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [code, , title] = line.split("\t");
      return [code, title.toLowerCase()];
    }),
);
export const groups: Record<string, string[]> = {};
for (const code of Object.keys(industries).sort())
  (groups[code.slice(0, 2)] ??= []).push(code);
export function division(group: string): string {
  if (!Object.hasOwn(groups, group))
    throw new Error(`Unknown SIC group: ${group}`);
  const found = divisions.find(
    ([low, high]) => low <= Number(group) && Number(group) <= high,
  );
  if (!found) throw new Error(`No division for SIC group: ${group}`);
  return found[2];
}
export function describe(group: string): string {
  if (!Object.hasOwn(groups, group))
    throw new Error(`Unknown SIC group: ${group}`);
  const umbrella = industries[`${group}00`];
  const listed = groups[group]
    .filter((code) => code !== `${group}00`)
    .slice(0, 8)
    .map((code) => industries[code])
    .join("; ");
  return umbrella && listed
    ? `${umbrella} — includes: ${listed}`
    : umbrella || listed;
}
export const groupCriteria = Object.fromEntries(
  Object.keys(groups)
    .sort()
    .map((group) => [group, describe(group)]),
);
