import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { sidecarsDir } from '../sidecar/paths.ts';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { renderCalendar } from './render.ts';

/**
 * Read all sidecars under `.deskwork/entries/` and write
 * `.deskwork/calendar.md` reflecting their current state. Idempotent;
 * if no sidecars exist, calendar.md is rewritten with empty stage
 * sections.
 *
 * Per Phase 4 (graphical-entries) the renderer is lane-template-aware:
 * `projectRoot` is now passed through to `renderCalendar` so the
 * render layer can read the lane configs and emit per-lane sections
 * for multi-lane projects. Legacy single-lane projects (no
 * `.deskwork/lanes/` directory) keep their existing render shape — a
 * single set of editorial stage sections.
 *
 * Used by:
 *   - the doctor's repair pass (canonical SSOT reconciliation),
 *   - every entry stage-transition helper (#148: keep calendar.md
 *     in sync after each approve/block/cancel/induct so adopters
 *     don't have to run `doctor --fix=all` to see their state).
 *
 * Error-tolerance contract (AUDIT-20260530-17):
 *
 *   Pre-fix, any throw from the underlying `renderCalendar` —
 *   including throws from `loadLaneConfig` / `loadPipelineTemplate`
 *   triggered by a single malformed `.deskwork/lanes/*.json` (or a
 *   lane pointing at a missing/invalid pipeline template) — propagated
 *   out of `regenerateCalendar` into every entry verb (approve / block
 *   / cancel / induct / publish / iterate). Each verb invokes
 *   `regenerateCalendar` as its FINAL step, AFTER the sidecar mutation
 *   and journal-event append have already landed. A single malformed
 *   lane file therefore broke EVERY stage transition for EVERY entry,
 *   AND the caller saw a verb failure even though the on-disk state
 *   had partially advanced (sidecar + journal landed, calendar did
 *   not). Blast radius: "this entry" → "the whole project, on any
 *   verb."
 *
 *   Post-fix, the `renderCalendar` + write pair is wrapped in a
 *   try/catch. On throw, the error is logged via `console.warn` (the
 *   project's standard non-fatal-warning channel; mirrors the
 *   `content-tree.ts:158` default) AND the function returns without
 *   writing `calendar.md`. The verb completes successfully; the
 *   sidecar + journal are durable; the calendar file is stale by
 *   exactly one transition. The operator runs `doctor --fix` to
 *   reconcile (this is the documented recovery path for calendar
 *   staleness, per the `#148` comment trail). The stderr warning
 *   surfaces the failure operator-visibly during the verb run, so
 *   the staleness is not silent.
 *
 *   The catch is intentionally broad (`unknown`) — every throw shape
 *   from this code path indicates a calendar-generation failure that
 *   should not block the underlying transition. Specific failure
 *   classes (malformed lane JSON, missing pipeline template, write
 *   failure on calendar.md) all share the same disposition: log,
 *   skip the write, let the doctor reconcile.
 */
export async function regenerateCalendar(projectRoot: string): Promise<void> {
  const dir = sidecarsDir(projectRoot);
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    // No entries dir: write an empty calendar.
  }

  const entries: Entry[] = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    let raw: string;
    try {
      raw = await readFile(join(dir, name), 'utf8');
    } catch {
      continue;
    }
    try {
      const parsed = EntrySchema.safeParse(JSON.parse(raw));
      if (parsed.success) entries.push(parsed.data);
    } catch {
      // skip malformed
    }
  }

  // Phase 4 Task 4.2.2: thread projectRoot into renderCalendar so the
  // lane-aware code path activates when `.deskwork/lanes/*.json` is
  // present. Single-lane projects fall back to the editorial shape
  // unchanged.
  //
  // AUDIT-20260530-17: render + write are wrapped in try/catch so a
  // lane/template misconfiguration (or any other render-time failure)
  // does NOT propagate into the caller. Verbs invoke us as their
  // final step after sidecar + journal land; propagating from here
  // would surface a verb failure to the caller while the on-disk
  // transition had already partially landed. The doctor reconciles
  // calendar.md from the sidecar SSOT — see docstring above.
  try {
    const md = renderCalendar(entries, projectRoot);
    const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
    await mkdir(dirname(calendarPath), { recursive: true });
    await writeFile(calendarPath, md);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      `regenerateCalendar: skipping calendar.md write — render or write failed (${detail}). ` +
        `On-disk sidecar state is unchanged; run \`doctor --fix\` to reconcile calendar.md.`,
    );
  }
}
