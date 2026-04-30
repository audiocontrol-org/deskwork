export type Stage =
  | 'Ideas' | 'Planned' | 'Outlining' | 'Drafting' | 'Final' | 'Published'
  | 'Blocked' | 'Cancelled';

export type ReviewState = 'in-review' | 'iterating' | 'approved';

const LINEAR_PIPELINE: readonly Stage[] = ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'] as const;
const OFF_PIPELINE: readonly Stage[] = ['Blocked', 'Cancelled'] as const;

export function isLinearPipelineStage(s: Stage): boolean {
  return LINEAR_PIPELINE.includes(s);
}

export function isOffPipelineStage(s: Stage): boolean {
  return OFF_PIPELINE.includes(s);
}

const SUCCESSOR: Record<Stage, Stage | null> = {
  Ideas: 'Planned',
  Planned: 'Outlining',
  Outlining: 'Drafting',
  Drafting: 'Final',
  Final: null,        // publish, not approve
  Published: null,
  Blocked: null,
  Cancelled: null,
};

export function nextStage(s: Stage): Stage | null {
  return SUCCESSOR[s];
}
