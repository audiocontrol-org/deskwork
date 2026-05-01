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
 *
 * Pipeline-redesign vocabulary (Phase 6, Task 37): the longform skill
 * surface is the universal-verb set — `add`, `iterate`, `approve`,
 * `publish`, `block`, `cancel`, `induct`, `status`, `doctor`. The
 * stage-named skills of the prior model (`plan`, `outline`, `draft`,
 * `pause`, `resume`, `review-start`, `review-cancel`) are retired; the
 * same actions now flow through the universal verbs operating on the
 * entry's current stage. Shortform + distribution skills still use the
 * workflow-object model and keep their per-track names.
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
 * The editorial skills that ship with this repository, in the order
 * they appear in `.claude/skills/` (alphabetical). Voice skills belong
 * at the end of any UI listing — see `SKILLS_SORTED` below.
 *
 * `deskwork:iterate` and `deskwork:approve` cover both the entry
 * pipeline (longform, universal verbs) and shortform review
 * workflows; the specimen description names both cases so the
 * catalogue reflects what the operator actually sees on the surface.
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
    slug: 'deskwork:status',
    kind: 'readonly',
    desc: 'Calendar status in a compact form — entries grouped by stage, with the next move per row.',
    when: 'Between sessions. Quick roll-call of what is where.',
    changes: 'Nothing. Read-only.',
    flags: '--site <slug>',
  },
  {
    slug: 'deskwork:doctor',
    kind: 'readonly',
    desc: 'Run the calendar/sidecar consistency rules and report any drift between sidecar truth and the regenerated calendar.md.',
    when: 'Periodically, or after manual edits to entries on disk.',
    changes: 'Nothing. Read-only — reports drift; repairs are explicit.',
    flags: '--site <slug>',
  },
  {
    slug: 'deskwork:add',
    kind: 'mechanical',
    desc: 'Capture a new idea in the Ideas stage. Mints the entry sidecar (uuid + title + content type) and a stub idea.md.',
    when: 'The instant an idea is worth persisting. Pre-commit, not post-draft.',
    changes: 'Writes .deskwork/entries/<uuid>.json and the stage-1 idea.md; calendar.md is regenerated from sidecars.',
    flags: '--site <slug>',
  },
  {
    slug: 'deskwork:iterate',
    kind: 'cognitive',
    desc: "Advance the entry's current-stage artifact one revision (entry pipeline) or append a new shortform draft version (shortform review). For entries: reads operator margin notes and writes the next iteration of the stage file (idea.md, plan.md, outline.md, or index.md).",
    when: 'After the operator has left review feedback, or to continue work on the current stage.',
    changes: 'Entry pipeline: writes the next stage-file version, bumps iterationByStage[currentStage], stage unchanged. Shortform: writes a new DraftVersion to the workflow journal, flips iterating → in-review.',
    flags: '<uuid> | <workflow-id> | --site <slug> <slug>',
  },
  {
    slug: 'deskwork:approve',
    kind: 'mechanical',
    desc: "Graduate the entry by exactly one stage (entry pipeline) or apply the approved shortform copy (shortform). Entry pipeline has no “approve but stay” — approve advances Ideas → Planned → Outlining → Drafting → Final → Published.",
    when: 'When the current-stage artifact (or shortform draft) is ready to move on.',
    changes: 'Entry pipeline: updates sidecar stage + history; next-stage artifact is initialised from the just-approved file. Shortform: workflow becomes applied; calendar shortform record is updated.',
    flags: '<uuid> | <workflow-id>',
  },
  {
    slug: 'deskwork:publish',
    kind: 'mechanical',
    desc: 'Mark a Final entry as Published and stamp the publish date. Optionally writes the rendered file to the configured collection path.',
    when: 'After Final is approved and the operator has done the human commit/push for the destination collection.',
    changes: 'Sets stage to Published and stamps datePublished; calendar.md is regenerated.',
    flags: '--site <slug> <uuid>',
  },
  {
    slug: 'deskwork:block',
    kind: 'mechanical',
    desc: 'Move an entry off-pipeline as Blocked. Process flag — “resumable later, work paused.” Records priorStage so re-induct knows where to land it.',
    when: 'Work paused for an external reason (waiting on a source, decision, dependency).',
    changes: "Sets stage to Blocked; records priorStage and reason in the sidecar's stageHistory.",
    flags: '<uuid> [--reason <text>]',
  },
  {
    slug: 'deskwork:cancel',
    kind: 'mechanical',
    desc: 'Move an entry off-pipeline as Cancelled. Semantic flag — “intent: abandoned, rare resume.” Distinct from block; records priorStage for the rare re-induct case.',
    when: 'Decision: this entry will not ship. Preserves history without deleting the sidecar.',
    changes: 'Sets stage to Cancelled; records priorStage and reason.',
    flags: '<uuid> [--reason <text>]',
  },
  {
    slug: 'deskwork:induct',
    kind: 'mechanical',
    desc: "Re-admit an entry into the pipeline. Default destinations: Blocked/Cancelled → priorStage; Final → Drafting; any other pipeline stage requires explicit --to. Preserves iterationByStage so the operator picks up where they left off.",
    when: 'Resuming a Blocked/Cancelled entry, or re-opening a Final entry for revision.',
    changes: "Sets stage to the resolved destination; preserves iterationByStage; appends a re-induct event to the sidecar's history.",
    flags: '<uuid> [--to <stage>]',
  },
  {
    slug: 'deskwork:shortform-start',
    kind: 'cognitive',
    desc: 'Draft a social post (Reddit title+body, YouTube description, LinkedIn, newsletter) for a published entry, using the site voice. Enqueues a shortform review workflow.',
    when: 'After /deskwork:publish, once the post is live and worth amplifying.',
    changes: 'Creates a new review workflow with contentKind=shortform and the drafted copy as v1.',
    flags: '--site <slug> <slug> <platform> [channel]',
  },
  {
    slug: 'deskwork:distribute',
    kind: 'mechanical',
    desc: 'Record that a published post was shared to a social platform — URL, date, sub-channel.',
    when: 'After you actually hit post. Closes the loop with analytics.',
    changes: 'Appends a DistributionRecord to the calendar file.',
    flags: '--site <slug> <slug> <platform> <url>',
  },
  {
    slug: 'deskwork:customize',
    kind: 'mechanical',
    desc: 'Copy a built-in template, prompt, or doctor rule into <projectRoot>/.deskwork/<category>/<name>.ts so it can be customised in-project.',
    when: 'You want to override a default template, prompt, or doctor rule for this project only.',
    changes: 'Writes a new file under .deskwork/{templates,prompts,doctor}/. Subsequent runtime resolution prefers the project copy.',
    flags: '<category> <name>',
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
    desc: "Pull recent Reddit submissions via the API; upsert DistributionRecords for any that reference the site’s posts or videos.",
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
    changes: 'Prints suggestions. Does not write them — pair with /deskwork:add.',
    flags: '--site <slug>',
  },
  {
    slug: 'audiocontrol-voice',
    kind: 'voice',
    desc: 'Voice skill for audiocontrol.org — service-manual register, hardware-specific vocabulary, dated specs.',
    when: 'Called by /deskwork:iterate and /deskwork:shortform-start when site=audiocontrol. Not invoked directly by the operator.',
    changes: 'Nothing. Provides the register for the caller.',
  },
  {
    slug: 'editorialcontrol-voice',
    kind: 'voice',
    desc: 'Voice skill for editorialcontrol.org — publication register, argument-driven, magazine typography.',
    when: 'Called by /deskwork:iterate and /deskwork:shortform-start when site=editorialcontrol. Not invoked directly.',
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
