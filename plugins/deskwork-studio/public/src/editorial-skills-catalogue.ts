/**
 * Editorial skill catalogue — the source of truth for the specimen grid
 * on /dev/editorial-help and any future CLI or doc generator that needs
 * the same inventory.
 *
 * Each skill carries four fields: `slug`, `kind` (see below), `desc`,
 * `when`, `changes`, and an optional `flags` string. The `kind` drives
 * the corner stamp on the help-page specimen card:
 *
 *   - cognitive  → red pencil — Claude Code drafts/revises prose
 *   - mechanical → proof blue — state transition, disk write, no writing
 *   - readonly   → faded ink — reports, audits, listings
 *   - voice      → stamp purple — called by other skills, not directly
 */

export type SkillKind = 'cognitive' | 'mechanical' | 'readonly' | 'voice';

export interface Skill {
  slug: string;
  kind: SkillKind;
  desc: string;
  when: string;
  changes: string;
  flags?: string;
}

/** Display label per kind. Used by the help-page specimen stamps. */
export const KIND_LABEL: Readonly<Record<SkillKind, string>> = {
  cognitive: 'cognitive',
  mechanical: 'mechanical',
  readonly: 'read-only',
  voice: 'voice',
};

/**
 * The 22 editorial skills that ship with this repository, in the order
 * they appear in `.claude/skills/` (alphabetical). Voice skills belong
 * at the end of any UI listing — see `SKILLS_SORTED` below.
 */
export const SKILLS: readonly Skill[] = [
  {
    slug: 'editorial-help',
    kind: 'readonly',
    desc: 'Print the workflow overview and calendar status across every stage.',
    when: 'When you have forgotten the shape of the pipeline, or want a full situation report.',
    changes: 'Nothing. Read-only.',
    flags: '--site <slug>',
  },
  {
    slug: 'editorial-status',
    kind: 'readonly',
    desc: 'Calendar status in a compact form — just the stage columns, no prose.',
    when: 'Between sessions. Quick roll-call of what is where.',
    changes: 'Nothing. Read-only.',
    flags: '--site <slug>',
  },
  {
    slug: 'editorial-add',
    kind: 'mechanical',
    desc: 'Capture a new idea in the Ideas stage — title, optional description, content type.',
    when: 'The instant an idea is worth persisting. Pre-commit, not post-draft.',
    changes: 'Appends a row to the calendar under Ideas. No file scaffolded yet.',
    flags: '--site <slug>',
  },
  {
    slug: 'editorial-plan',
    kind: 'cognitive',
    desc: 'Promote Ideas → Planned; set target keywords and topic tags.',
    when: 'The idea has matured enough to point at a shape.',
    changes: 'Moves the calendar row; writes keywords onto the entry.',
    flags: '--site <slug> <slug>',
  },
  {
    slug: 'editorial-draft',
    kind: 'mechanical',
    desc: 'Scaffold the blog post directory + frontmatter from a Planned entry and advance to Drafting.',
    when: 'Ready to begin writing. Can also be triggered from the studio button.',
    changes: 'Creates src/sites/<site>/content/blog/<slug>.md with frontmatter (state: draft); calendar stage flips to Drafting.',
    flags: '--site <slug> <slug>',
  },
  {
    slug: 'editorial-draft-review',
    kind: 'mechanical',
    desc: 'Enqueue an existing blog draft into the editorial-review pipeline and print the /dev/editorial-review URL.',
    when: 'The draft is written and ready for annotation + iteration.',
    changes: 'Opens a review workflow in state open. No edit to the draft itself.',
    flags: '--site <slug> <slug>',
  },
  {
    slug: 'editorial-iterate',
    kind: 'cognitive',
    desc: 'Revise a draft based on margin-note comments using the site voice skill; appends a new DraftVersion.',
    when: 'After the operator clicks Iterate in the review page.',
    changes: 'Writes a new version to the review journal; workflow flips iterating → in-review.',
    flags: '<workflow-id> or --site <slug> <slug>',
  },
  {
    slug: 'editorial-approve',
    kind: 'mechanical',
    desc: 'Write the approved draft version to its destination (blog file for longform; shortform copy into the calendar) and transition to applied.',
    when: 'After the operator clicks Approve in the review page.',
    changes: 'Overwrites the destination file; workflow becomes applied; calendar untouched (publish is separate).',
    flags: '<workflow-id>',
  },
  {
    slug: 'editorial-review-cancel',
    kind: 'mechanical',
    desc: 'Cancel an active review workflow; leaves the source file untouched.',
    when: 'A draft has been abandoned or replaced; clean up the pipeline.',
    changes: 'Workflow transitions to cancelled terminal state. Source file not modified.',
    flags: '<workflow-id>',
  },
  {
    slug: 'editorial-review-help',
    kind: 'readonly',
    desc: 'Editorial-review pipeline state across all active workflows + next action per workflow.',
    when: 'Resuming review work across multiple drafts or sites.',
    changes: 'Nothing. Read-only.',
  },
  {
    slug: 'editorial-review-report',
    kind: 'readonly',
    desc: 'Aggregate comment-annotation categories across completed workflows — which voice-skill principles are drifting most.',
    when: 'Monthly-ish. Inputs for voice-skill revisions.',
    changes: 'Nothing. Read-only.',
    flags: '--site <slug>',
  },
  {
    slug: 'editorial-publish',
    kind: 'mechanical',
    desc: 'Flip a Drafting or Review entry to Published and stamp today’s date.',
    when: 'The blog file is live. Usually after /editorial-approve and a human commit.',
    changes: 'Sets datePublished on the entry; stage becomes Published. Does not commit.',
    flags: '--site <slug> <slug>',
  },
  {
    slug: 'editorial-shortform-draft',
    kind: 'cognitive',
    desc: 'Draft a social post (Reddit title+body, YouTube description, LinkedIn, newsletter) for a published entry, using the site voice. Enqueues a shortform review workflow.',
    when: 'After /editorial-publish, once the post is live and worth amplifying.',
    changes: 'Creates a new review workflow with contentKind=shortform and the drafted copy as v1.',
    flags: '--site <slug> <slug> <platform> [channel]',
  },
  {
    slug: 'editorial-distribute',
    kind: 'mechanical',
    desc: 'Record that a published post was shared to a social platform — URL, date, sub-channel.',
    when: 'After you actually hit post. Closes the loop with analytics.',
    changes: 'Appends a DistributionRecord to the calendar file.',
    flags: '--site <slug> <slug> <platform> <url>',
  },
  {
    slug: 'editorial-social-review',
    kind: 'readonly',
    desc: 'Matrix of published posts × social platforms showing which combinations have been shared.',
    when: 'Looking for cross-post holes.',
    changes: 'Nothing. Read-only.',
    flags: '--site <slug>',
  },
  {
    slug: 'editorial-reddit-sync',
    kind: 'mechanical',
    desc: 'Pull recent Reddit submissions via the API; upsert DistributionRecords for any that reference the site’s posts or videos.',
    when: 'Reconciling distribution state without re-entering by hand.',
    changes: 'Adds or updates DistributionRecord rows in the calendar.',
    flags: '--site <slug>',
  },
  {
    slug: 'editorial-reddit-opportunities',
    kind: 'cognitive',
    desc: 'For a published post, list relevant subreddits split into already-shared (skip) and unshared candidates with subscriber count and self-promo hints.',
    when: 'Planning a cross-post run.',
    changes: 'Nothing. Read-only.',
    flags: '--site <slug> <slug>',
  },
  {
    slug: 'editorial-cross-link-review',
    kind: 'readonly',
    desc: 'Audit bidirectional linking between blog posts and YouTube videos; flag missing reciprocal links.',
    when: 'Before shipping a YouTube entry, or as a periodic audit.',
    changes: 'Nothing. Read-only.',
    flags: '--site <slug>',
  },
  {
    slug: 'editorial-performance',
    kind: 'readonly',
    desc: 'Analytics metrics for published posts; flags underperformers that might warrant revision or a better cross-post.',
    when: 'Cadence review. Not for individual posts.',
    changes: 'Nothing. Read-only.',
    flags: '--site <slug>',
  },
  {
    slug: 'editorial-suggest',
    kind: 'cognitive',
    desc: 'Pull analytics and suggest new ideas for the Ideas stage based on observed queries and gaps.',
    when: 'When the Ideas column is thin.',
    changes: 'Prints suggestions. Does not write them — pair with /editorial-add.',
    flags: '--site <slug>',
  },
  {
    slug: 'audiocontrol-voice',
    kind: 'voice',
    desc: 'Voice skill for audiocontrol.org — service-manual register, hardware-specific vocabulary, dated specs.',
    when: 'Called by /editorial-iterate and /editorial-shortform-draft when site=audiocontrol. Not invoked directly by the operator.',
    changes: 'Nothing. Provides the register for the caller.',
  },
  {
    slug: 'editorialcontrol-voice',
    kind: 'voice',
    desc: 'Voice skill for editorialcontrol.org — publication register, argument-driven, magazine typography.',
    when: 'Called by /editorial-iterate and /editorial-shortform-draft when site=editorialcontrol. Not invoked directly.',
    changes: 'Nothing. Provides the register for the caller.',
  },
];

/**
 * Display order for UI listings: non-voice skills alphabetised first,
 * voice skills alphabetised at the end. Voice skills are infrastructure
 * for other skills, not directly invocable — putting them at the bottom
 * reflects that.
 */
const NON_VOICE = SKILLS.filter((s) => s.kind !== 'voice').slice().sort((a, b) => a.slug.localeCompare(b.slug));
const VOICE = SKILLS.filter((s) => s.kind === 'voice').slice().sort((a, b) => a.slug.localeCompare(b.slug));
export const SKILLS_SORTED: readonly Skill[] = [...NON_VOICE, ...VOICE];
