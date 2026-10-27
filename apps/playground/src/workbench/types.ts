import type { FlowDefinition } from "jev-devtools/viewer";
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
export type CookbookDetail = {
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
  originalSource: string;
  sourceRevision: string;
  adaptation: string;
};
