export const structureCases = {
  memo: {
    label: "Team memo · headings, steps, code and callout",
    message: `Release checklist

The new build pipeline is ready for
the team to try.

Before Monday

Install the toolchain
Run the doctor script

bun run build
bun run test

If the doctor reports a failure, stop and
ask the platform team for help.

As Dana said, "a quiet migration is
a successful migration."`,
  },
  boundaries: {
    label: "Join thresholds · exactly at and just below",
    message: `A dangling fragment
continues here.
A new sentence.
continued after punctuation.
Another unfinished
separate thought`,
  },
  separated: {
    label: "Blank-line separation · skip stitching request",
    message: "A title\n\nA standalone paragraph.",
  },
  empty: {
    label: "Empty document · no Jev requests",
    message: " \n\t\n",
  },
} as const;
export type StructureCase = keyof typeof structureCases;
export function isStructureCase(value: unknown): value is StructureCase {
  return typeof value === "string" && Object.hasOwn(structureCases, value);
}
