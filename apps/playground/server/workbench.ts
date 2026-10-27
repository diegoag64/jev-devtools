import { readFile } from "node:fs/promises";
import { cookbookCatalog } from "../src/workbench/catalog.js";
import type { CookbookDetail } from "../src/workbench/types.js";
import { workbenchRegistry } from "./workbench-registry.js";
import { mapCookbookSource } from "./workbench-source.js";
import { overviews } from "./workbench-overviews.js";
import { lessons } from "./workbench-lessons.js";
import { hierarchyLimitFlow } from "../../../cookbooks/hierarchical-classification/flow.js";

export async function readCookbook(
  slug: string,
): Promise<CookbookDetail | undefined> {
  const catalog = cookbookCatalog.find((recipe) => recipe.slug === slug);
  const recipe = workbenchRegistry[slug];
  if (!catalog || !recipe) return undefined;
  // Only a catalogued slug can reach the filesystem. Never accept a caller path.
  const directory = new URL(
    `../../../cookbooks/${catalog.slug}/`,
    import.meta.url,
  );
  const [source, provenance] = await Promise.all([
    readFile(new URL("flow.ts", directory), "utf8"),
    readFile(new URL("provenance.json", directory), "utf8").then(JSON.parse),
  ]);
  const mapped = mapCookbookSource(source, recipe.definition);
  const chapters = lessons[catalog.slug];
  if (
    Object.keys(chapters).length !== mapped.steps.length ||
    mapped.steps.some((step) => !chapters[step.id])
  )
    throw new Error(
      `Review the tutorial for ${slug}: its authored operations changed.`,
    );
  return {
    slug,
    ...recipe,
    variants:
      slug === "hierarchical-classification"
        ? { limit: hierarchyLimitFlow.definition }
        : {},
    source,
    sourceFile: `cookbooks/${slug}/flow.ts`,
    samples: Object.fromEntries(
      Object.entries(recipe.samples).map(([id, sample]) => [
        id,
        { label: sample.label, message: sample.message },
      ]),
    ),
    ...mapped,
    steps: mapped.steps.map((step) => ({
      ...step,
      originalChapter: chapters[step.id][0],
      explanation: chapters[step.id][1],
      comment: chapters[step.id][2],
    })),
    overview: overviews[catalog.slug],
    originalSource: catalog.source,
    sourceRevision:
      provenance.upstreamCommit ??
      provenance.upstream?.commit ??
      provenance.source?.match(/\/([a-f0-9]{40})\//)?.[1] ??
      "See the recipe provenance record",
    adaptation:
      typeof provenance.adaptation === "string"
        ? provenance.adaptation
        : `${provenance.transformation ?? "This adaptation uses fixed synthetic responses."} See the original cookbook and this recipe's provenance record for dataset and execution differences.`,
  };
}
