// 033 T010 — the tasks.md `[tier:]` parser (data-model TieredTask).
//
// Pure syntactic extraction: read each `- [ ] T### …` / `- [x] …` checkbox line into
// a TieredTask, reading the `[tier:<label>]` tag from the bracket-tag region. NON-task
// lines (phase headers, format bullets, prose, checkpoints) are ignored — they carry
// no meaning for tier resolution (scheduling is out of scope, FR-012). Parse errors
// are COLLECTED (no first-error abort) so the full set surfaces together (FR-006).
//
// A MISSING tier tag yields `tierLabel: undefined` (a RESOLUTION error, FR-004 — not a
// parse error); an EMPTY `[tier:]` tag IS a parse error (data-model). The distinction
// is deliberate: an absent tier is the operator forgetting to size the task; an empty
// tag is a malformed declaration.

/** One task parsed from tasks.md (data-model TieredTask). */
export interface TieredTask {
  readonly id: string;
  /** `[tier:<label>]` value; undefined when no tier tag is present (→ FR-004 error). */
  readonly tierLabel: string | undefined;
  /** Description text (the subagent brief), recognized bracket-tags stripped. */
  readonly body: string;
  /** True iff the checkbox is `[x]`/`[X]` (already complete — informs ledger/resume). */
  readonly done: boolean;
  /** 1-based source line, for error messages. */
  readonly lineNumber: number;
}

/** A collected parser-level validation error (data-model). */
export interface ParseError {
  readonly category: 'missing-id' | 'duplicate-id' | 'missing-body' | 'empty-tier';
  readonly message: string;
  readonly lineNumber: number;
}

export interface ParseResult {
  readonly tasks: readonly TieredTask[];
  readonly errors: readonly ParseError[];
}

/** A markdown task line: `- [ ] …` / `- [x] …` / `- [X] …`. Leading indentation tolerated. */
const TASK_LINE = /^\s*-\s+\[([ xX])\]\s+(.*)$/;
/** The leading task id (`T` + digits) at the start of the post-checkbox text. */
const ID_AT_START = /^(T\d+)\b\s*/;
/** The `[tier:<label>]` tag, anywhere in the bracket-tag region. */
const TIER_TAG = /\[tier:([^\]]*)\]/;
/** Recognized bracket tags stripped from the body: `[P]`, `[US\d+]`, `[tier:…]`. */
const STRIP_TAGS = /\[(?:P|US\d+|tier:[^\]]*)\]/g;

/** Parse tasks.md content into TieredTask[] + collected ParseError[]. Pure. */
export function parseTieredTasks(content: string): ParseResult {
  const tasks: TieredTask[] = [];
  const errors: ParseError[] = [];
  const seenIds = new Set<string>();

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    const lineNumber = i + 1;
    const lineMatch = TASK_LINE.exec(raw);
    if (lineMatch === null) continue; // not a task-checkbox line — ignored

    const done = lineMatch[1] !== ' ';
    const rest = lineMatch[2] ?? '';

    const idMatch = ID_AT_START.exec(rest);
    if (idMatch === null || idMatch[1] === undefined) {
      errors.push({ category: 'missing-id', message: `line ${lineNumber}: task checkbox has no T-id`, lineNumber });
      continue;
    }
    const id = idMatch[1];
    if (seenIds.has(id)) {
      errors.push({ category: 'duplicate-id', message: `duplicate task id ${id} (line ${lineNumber})`, lineNumber });
      continue;
    }
    seenIds.add(id);

    const afterId = rest.slice(idMatch[0].length);

    // Tier tag: present-but-empty is a parse error; present-with-value sets the label;
    // absent leaves tierLabel undefined (a resolution-time error, not a parse error).
    // An empty `[tier:]` is a MALFORMED declaration, so — like missing-id/missing-body —
    // the task is EXCLUDED from tasks[] (the `continue` below). Without it the task would
    // also generate a downstream `no-tier` resolution error: two errors for one problem
    // (AUDIT-20260629-01).
    let tierLabel: string | undefined;
    const tierMatch = TIER_TAG.exec(afterId);
    if (tierMatch !== null) {
      const value = (tierMatch[1] ?? '').trim();
      if (value.length === 0) {
        errors.push({ category: 'empty-tier', message: `task ${id} has an empty [tier:] tag (line ${lineNumber})`, lineNumber });
        continue;
      }
      tierLabel = value;
    }

    const body = afterId.replace(STRIP_TAGS, '').replace(/\s{2,}/g, ' ').trim();
    if (body.length === 0) {
      errors.push({ category: 'missing-body', message: `task ${id} has no body/description (line ${lineNumber})`, lineNumber });
      continue;
    }

    tasks.push({ id, tierLabel, body, done, lineNumber });
  }

  return { tasks, errors };
}
