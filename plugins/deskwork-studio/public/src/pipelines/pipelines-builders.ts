/**
 * Pure slash-command builders for `/dev/pipelines` (Phase 6 Task 6.4).
 *
 * Extracted from `pipelines-page.ts` to keep the controller module
 * under the project's 500-line file cap. Each `buildXxxCommand`
 * function reads from a DOM form and returns the assembled slash
 * command + an optional validity error. The controller wires the
 * results to the live preview + the Copy button's enabled state.
 *
 * Why a `BuildResult` instead of just a string:
 *
 *   `command` is always populated so the live preview can render the
 *   placeholder shape ("…<name>") while the operator fills in fields
 *   — useful feedback during typing. `error` is non-null when one or
 *   more required fields are empty (or a set-stage operation has no
 *   selections, which the CLI's `splitStageList` refuses). When set,
 *   the Copy button is disabled and the inline notice surfaces the
 *   message. This pairs preview-shows-shape (helpful) with
 *   copy-emits-broken-command (the hard stop) — the operator sees the
 *   placeholder but can't paste a CLI-error-prone shape into Claude
 *   Code.
 */

import { quoteValue } from '../copy-builder.ts';

/**
 * The set of operations the Edit panel exposes — one per CLI flag on
 * `deskwork pipeline update`. The CLI rejects multiple operations per
 * invocation; the controller's single-open accordion matches that
 * contract on the UI side.
 */
export type UpdateOp =
  | 'add'
  | 'rename'
  | 'remove'
  | 'set-locked'
  | 'set-off-pipeline';

export const UPDATE_OPS: readonly UpdateOp[] = [
  'add',
  'rename',
  'remove',
  'set-locked',
  'set-off-pipeline',
];

export interface BuildResult {
  readonly command: string;
  readonly error: string | null;
}

/**
 * Read a field's trimmed value from a form. Returns empty string when
 * the field is absent so callers can treat "missing" and "blank" as
 * equivalent for the preview-rebuild path.
 */
function readField(form: HTMLElement, name: string): string {
  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-pipelines-field="${name}"]`,
  );
  return el?.value.trim() ?? '';
}

/**
 * Read a set of checkbox values (used by the set-locked sub-operation).
 * Returns the values of every checked input in document order.
 */
function readCheckedValues(form: HTMLElement, name: string): string[] {
  const els = Array.from(
    form.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][data-pipelines-field="${name}"]`,
    ),
  );
  return els.filter((el) => el.checked).map((el) => el.value);
}

function missingFieldsError(missing: readonly string[]): string | null {
  if (missing.length === 0) return null;
  const noun = missing.length === 1 ? 'field' : 'fields';
  return `Fill required ${noun}: ${missing.join(', ')}.`;
}

/** Build the `/deskwork:pipeline create` command from the New form. */
export function buildCreateCommand(form: HTMLElement): BuildResult {
  const id = readField(form, 'new-id');
  const shape = readField(form, 'new-shape');
  const name = readField(form, 'new-name');
  const description = readField(form, 'new-description');

  const idArg = id.length > 0 ? quoteValue(id) : '<id>';
  const shapeArg = shape.length > 0 ? quoteValue(shape) : '<stages>';
  const nameFragment = name.length > 0 ? ` --name ${quoteValue(name)}` : '';
  const descFragment =
    description.length > 0 ? ` --description ${quoteValue(description)}` : '';
  const command = `/deskwork:pipeline create ${idArg} --shape ${shapeArg}${nameFragment}${descFragment}`;

  const missing: string[] = [];
  if (id.length === 0) missing.push('id');
  if (shape.length === 0) missing.push('shape');
  return { command, error: missingFieldsError(missing) };
}

/** Build the `/deskwork:pipeline update <id> --add-stage ...` command. */
export function buildAddCommand(form: HTMLElement, pipelineId: string): BuildResult {
  const name = readField(form, 'add-name');
  const position = readField(form, 'add-position');
  const idArg = quoteValue(pipelineId);
  const nameArg = name.length > 0 ? quoteValue(name) : '<name>';
  const positionFragment =
    position.length > 0 ? ` --position ${position}` : '';
  const command = `/deskwork:pipeline update ${idArg} --add-stage ${nameArg}${positionFragment}`;
  const error = name.length === 0 ? 'Fill required field: stage name.' : null;
  return { command, error };
}

/** Build the `--rename-stage <from> --to-stage <to>` command. */
export function buildRenameCommand(
  form: HTMLElement,
  pipelineId: string,
): BuildResult {
  const from = readField(form, 'rename-from');
  const to = readField(form, 'rename-to');
  const idArg = quoteValue(pipelineId);
  const fromArg = from.length > 0 ? quoteValue(from) : '<from>';
  const toArg = to.length > 0 ? quoteValue(to) : '<to>';
  const command = `/deskwork:pipeline update ${idArg} --rename-stage ${fromArg} --to-stage ${toArg}`;

  const missing: string[] = [];
  if (from.length === 0) missing.push('from');
  if (to.length === 0) missing.push('to');
  return { command, error: missingFieldsError(missing) };
}

/** Build the `--remove-stage <name>` command. */
export function buildRemoveCommand(
  form: HTMLElement,
  pipelineId: string,
): BuildResult {
  const name = readField(form, 'remove-name');
  const idArg = quoteValue(pipelineId);
  const nameArg = name.length > 0 ? quoteValue(name) : '<name>';
  const command = `/deskwork:pipeline update ${idArg} --remove-stage ${nameArg}`;
  const error = name.length === 0 ? 'Pick a stage to remove.' : null;
  return { command, error };
}

/** Build the `--set-locked "s1,s2,..."` command. */
export function buildSetLockedCommand(
  form: HTMLElement,
  pipelineId: string,
): BuildResult {
  const checked = readCheckedValues(form, 'set-locked');
  const idArg = quoteValue(pipelineId);
  const csv = checked.join(',');
  const command = `/deskwork:pipeline update ${idArg} --set-locked ${quoteValue(csv)}`;
  // The CLI's `splitStageList` rejects an empty comma-separated list
  // (exit 2). Surface the gate here so the operator who unchecks every
  // box doesn't stumble into a broken paste; the inline notice names
  // the lane-config / direct-edit escape hatch for "clear all locks."
  const error =
    checked.length === 0
      ? 'Cannot clear all locks via --set-locked (the CLI rejects an empty list). '
        + 'To remove individual locks, use Rename / Remove operations on the lane '
        + 'configs, or edit .deskwork/pipelines/<id>.json directly.'
      : null;
  return { command, error };
}

/** Build the `--set-off-pipeline "s1,s2,..."` command. */
export function buildSetOffCommand(
  form: HTMLElement,
  pipelineId: string,
): BuildResult {
  const csv = readField(form, 'set-off-pipeline');
  const idArg = quoteValue(pipelineId);
  const command = `/deskwork:pipeline update ${idArg} --set-off-pipeline ${quoteValue(csv)}`;
  // Same CLI gate as set-locked: an empty value reaches `splitStageList`
  // which rejects it (exit 2). Surface the gate symmetrically.
  const error =
    csv.length === 0
      ? 'Cannot clear all off-pipeline stages via --set-off-pipeline (the CLI '
        + 'rejects an empty list). To remove individual stages, edit '
        + '.deskwork/pipelines/<id>.json directly.'
      : null;
  return { command, error };
}

/**
 * Dispatch to the matching builder for an Edit-panel sub-operation.
 * The switch is exhaustive; TypeScript's narrowing on `UpdateOp` makes
 * a missing case a compile error.
 */
export function buildEditCommand(
  form: HTMLElement,
  op: UpdateOp,
  pipelineId: string,
): BuildResult {
  switch (op) {
    case 'add':
      return buildAddCommand(form, pipelineId);
    case 'rename':
      return buildRenameCommand(form, pipelineId);
    case 'remove':
      return buildRemoveCommand(form, pipelineId);
    case 'set-locked':
      return buildSetLockedCommand(form, pipelineId);
    case 'set-off-pipeline':
      return buildSetOffCommand(form, pipelineId);
  }
}
