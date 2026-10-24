/** Small authored taxonomies and scores; no official evaluation data is replayed. */
export type Tree = { [label: string]: Tree };
export const taxonomy: Tree = {
  Audio: { Speakers: {}, Headphones: {}, Receivers: {} },
  Cameras: { Mirrorless: { "Interchangeable lens": {} }, Compact: {} },
  Accessories: { "Camera straps": {} },
};
export const hierarchyCases = {
  recovery: {
    label: "Beam recovers an early wrong turn",
    message:
      "A compact interchangeable-lens camera with high-quality audio recording.",
    start: [] as string[],
    tree: taxonomy,
  },
  single: {
    label: "Single-child paths · no Jev calls",
    message: "An archived catalog record.",
    start: [] as string[],
    tree: { Catalog: { Archive: {} } } as Tree,
  },
  leaf: {
    label: "Already at a leaf · zero iterations",
    message: "A speaker record whose category is already selected.",
    start: ["Audio", "Speakers"],
    tree: taxonomy,
  },
  limit: {
    label: "Iteration limit · inspect an incomplete run",
    message:
      "A compact interchangeable-lens camera with high-quality audio recording.",
    start: [] as string[],
    tree: taxonomy,
  },
};
export type HierarchyCase = keyof typeof hierarchyCases;
export const isHierarchyCase = (value: unknown): value is HierarchyCase =>
  typeof value === "string" && Object.hasOwn(hierarchyCases, value);
