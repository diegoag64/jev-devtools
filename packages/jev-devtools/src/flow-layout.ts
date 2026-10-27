import type { FlowDefinition, FlowRun } from "./flow-protocol.js";
import type { Trace } from "./protocol.js";
import type { ConditionInput } from "./condition-inputs.js";

export type Bounds = { x: number; y: number; width: number; height: number };
export type Size = Pick<Bounds, "width" | "height">;
export type CollectionView = { index: number; open: boolean };

// Omit redundant transitive edges so a reference does not draw through an
// intervening condition. Execution ordering still includes every dependency.
export function flowDisplayLinks(definition: FlowDefinition) {
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const ancestors = (id: string) => {
    const seen = new Set<string>(),
      pending = [...(byId.get(id)?.dependencies ?? [])];
    while (pending.length) {
      const next = pending.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      pending.push(...(byId.get(next)?.dependencies ?? []));
    }
    return seen;
  };
  const parents = new Map(
    definition.nodes.map((node) => [node.id, ancestors(node.id)]),
  );
  return new Map(
    definition.nodes.map((node) => [
      node.id,
      node.dependencies.filter(
        (id) =>
          node.kind === "merge" ||
          !node.dependencies.some(
            (other) => other !== id && parents.get(other)?.has(id),
          ),
      ),
    ]),
  );
}

/** Place cards and collection previews using the viewer's current measurements. */
export function layoutFlow({
  definition,
  steps,
  tracesById,
  heights,
  links,
  inputsByStep,
  collectionViews,
  itemSizes,
}: {
  definition: FlowDefinition;
  steps: FlowRun["steps"];
  tracesById: ReadonlyMap<string, Trace>;
  heights: Readonly<Record<string, number>>;
  links: ReadonlyMap<string, readonly string[]>;
  inputsByStep: ReadonlyMap<string, readonly ConditionInput[]>;
  collectionViews: Readonly<Record<string, CollectionView>>;
  itemSizes: Readonly<Record<string, Size>>;
}) {
  const columns = new Map<string, number>();
  let remaining = [...definition.nodes];
  while (remaining.length) {
    const ready = remaining.filter((node) =>
      node.dependencies.every((id) => columns.has(id)),
    );
    if (!ready.length) break;
    for (const node of ready)
      columns.set(
        node.id,
        node.dependencies.length
          ? Math.max(...node.dependencies.map((id) => columns.get(id)!)) + 1
          : 0,
      );
    const ids = new Set(ready.map((node) => node.id));
    remaining = remaining.filter((node) => !ids.has(node.id));
  }
  const points = new Map<string, Bounds>();
  const expansions = new Map<string, Bounds>();
  let x = 40;
  for (let column = 0; column <= Math.max(0, ...columns.values()); column++) {
    const nodes = definition.nodes.filter(
      (node) => columns.get(node.id) === column,
    );
    let bottom = 40,
      width = 280;
    for (const node of nodes) {
      const captured =
        node.kind === "jev" && tracesById.has(steps[node.id]?.traceId ?? "");
      const w = captured ? 1120 : 360,
        h =
          heights[node.id] ??
          (captured
            ? 640
            : node.kind === "parallel"
              ? 190 +
                (node.description ? 64 : 0) +
                Math.min(4, (node.lanes ?? node.dependencies).length) * 32
              : (node.description ? 244 : 172) +
                (node.kind === "branch" || node.kind === "if"
                  ? 110 +
                    Math.min(3, inputsByStep.get(node.id)?.length ?? 0) * 24
                  : node.kind === "task" || node.kind === "merge"
                    ? 130
                    : 0));
      const parents = (links.get(node.id) ?? [])
        .map((id) => points.get(id)!)
        .filter(Boolean);
      const center = parents.length
        ? parents.reduce((sum, p) => sum + p.y + p.height / 2, 0) /
          parents.length
        : h / 2 + 40;
      const y = Math.max(bottom, center - h / 2);
      points.set(node.id, { x, y, width: w, height: h });
      bottom = y + h + 100;
      width = Math.max(width, w);
    }
    x += width + 160;
  }
  // Collection previews occupy a separate row below the original graph.
  // Their dimensions must never participate in its column or lane spacing.
  const expansionY =
    Math.max(...[...points.values()].map((p) => p.y + p.height), 40) + 96;
  for (const node of definition.nodes) {
    if (
      !collectionViews[node.id]?.open ||
      !node.itemDefinition ||
      !steps[node.id]?.collection?.total
    )
      continue;
    const card = points.get(node.id);
    if (!card) continue;
    const size = itemSizes[node.id] ?? { width: 2400, height: 800 };
    const left = card.x + card.width / 2 - size.width / 2;
    let top = expansionY;
    // Center each preview on its collection. Stack overlapping previews
    // vertically, leaving the original graph and all its coordinates alone.
    for (const area of expansions.values()) {
      if (
        left - 80 < area.x + area.width + 80 &&
        left + size.width + 80 > area.x - 80
      )
        top = Math.max(top, area.y + area.height + 96);
    }
    expansions.set(node.id, { x: left, y: top, ...size });
  }
  // External arrows and centered previews can extend left of canvas zero.
  const left = Math.min(0, ...[...expansions.values()].map((p) => p.x - 80));
  const right = Math.max(
    700,
    x - 120,
    ...[...expansions.values()].map((p) => p.x + p.width + 80),
  );
  return {
    points,
    expansions,
    left,
    width: right - left,
    height: Math.max(
      400,
      ...[...points.values(), ...expansions.values()].map(
        (p) => p.y + p.height + 40,
      ),
    ),
  };
}
