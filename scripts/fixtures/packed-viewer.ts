import { createElement } from "react";
import {
  JevFlowViewer,
  useJevInspection,
  type JevFlowViewerProps,
  type FlowDefinition,
} from "jev-devtools/viewer";
const definition: FlowDefinition = {
  version: 1,
  id: "example",
  name: "Example",
  nodes: [],
};
export const props: JevFlowViewerProps = {
  definition,
  visibleNodeIds: ["first"],
  highlightedNodeIds: ["first"],
  nodeAccents: { first: "#abcdef" },
  onNodeSelect(id) {
    id.toUpperCase();
  },
};
export const element = createElement(JevFlowViewer, props);
export function Consumer() {
  const snapshot = useJevInspection({
    enabled: false,
    endpoint: "/api/jev-devtools",
  });
  snapshot.connection.toUpperCase();
  return createElement(JevFlowViewer, {
    definition,
    run: snapshot.flows.runs[0],
    traces: snapshot.traces,
  });
}
// @ts-expect-error a definition is required; the viewer does not execute flows
const missing: JevFlowViewerProps = {};
// @ts-expect-error presentation IDs are strings
const invalid: JevFlowViewerProps = { definition, visibleNodeIds: [1] };
void missing;
void invalid;
