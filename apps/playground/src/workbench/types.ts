import type { Trace } from "jev-devtools";
import type { FlowDefinition, FlowRun } from "jev-devtools/viewer";
export type SourceRange = { start: number; end: number };
export type TutorialStep = {
  id: string;
  title: string;
  explanation: string;
  comment: string;
  api: string;
  nodeIds: string[];
  ranges: SourceRange[];
  originalChapter?: string;
};
export type CookbookPreview = {
  sampleId: string;
  definition: FlowDefinition;
  run: FlowRun;
  traces: Trace[];
};
export type CookbookDetail = {
  preview: CookbookPreview;
  slug: string;
  definition: FlowDefinition;
  variants: Record<string, FlowDefinition>;
  source: string;
  sourceFile: string;
  sourceRanges: Record<string, SourceRange>;
  steps: TutorialStep[];
  scenario: string;
  caseField: string;
  samples: Record<string, { label: string; message: string }>;
  overview: { purpose: string; flow: string };
  originalSource: string;
  sourceRevision: string;
  adaptation: string;
};
