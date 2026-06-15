/**
 * Markdown schema parser/validator for the design-language spec convention
 * (Phase 2, axis A — pure text → structure; NO filesystem, NO engine).
 *
 * Convention (hand-authorable):
 *   - a rule is declared by an ATX heading whose text is `rule: <id>`
 *     (any heading level; a CommonMark closing hash sequence —
 *     `### rule: <id> ###` — is stripped before the id is read); the rule's
 *     section runs to the next heading;
 *   - fields are single-line bullets `- <key>: <value>` (any CommonMark
 *     bullet marker: `-` / `*` / `+`) with the CLOSED key set
 *     `kind` / `css` / `example` / `do` / `don't` (a curly apostrophe U+2019 in
 *     the key is normalized to ASCII `'`, so smart-quoted `don’t:` is accepted);
 *   - `css: <path> <selector>` — first token is the file path (relative to the
 *     spec file; machine-rooted paths are rejected, `../` traversal is allowed
 *     — see {@link isNonPortableCssPath}), the remainder is the selector
 *     (descendant selectors allowed);
 *   - other prose (paragraphs, capitalised-key bullets) is inert;
 *   - code blocks are inert (AUDIT round-3 claude-02): a fenced block
 *     (``` or ~~~, ≥3 markers, info string allowed; the closer is a line of
 *     ONLY the same marker repeated at least the opener's length — pragmatic
 *     CommonMark, indented/nested-in-list fences not modeled) suspends ALL
 *     parsing, so a documentation example containing `### rule: phantom`
 *     never becomes a live rule. Likewise a ≥4-space-indented (or
 *     tab-indented) NON-bullet line is indented code and skipped; indented
 *     FIELD BULLETS still record, so nested-list authoring keeps working.
 *
 * Validation per rule: kind from the closed vocabulary; ≥1 css link; ≥1
 * example (structural presence only — this validator does not establish
 * example truthfulness; that is the separate `spec-truthfulness` axis,
 * scope decision recorded in specs/001-design-control/spec.md); ≥1
 * do/don't guidance line. A lowercase
 * single-word bullet key outside the closed set is an `unknown-field` finding
 * (typo guard) — silently dropping a misspelled `example:` would otherwise
 * fabricate a missing-example rejection with no visible cause. The same
 * philosophy applies to rule DECLARATIONS: an attempted `rule: <id>` that
 * misses the strict form — wrong case (`Rule: x`), spaced colon (`rule : x`),
 * missing colon (`rule x`), setext heading, or bare paragraph line — is a
 * `malformed-rule-heading` finding — never silently demoted to inert
 * structure, which would drop the whole intended rule with zero findings
 * (or merge its bullets into the preceding rule). The attempt classifiers
 * live in `@/design-language/rule-attempt`.
 */

import { classifyHeadingAttempt, classifyLineAttempt } from '@/design-language/rule-attempt';
import {
  RULE_KINDS,
  type CssLink,
  type DesignRuleKind,
  type DesignSpecFinding,
  type DesignSpecParseResult,
  type DesignSpecRule,
  type RuleScopedCssLink,
} from '@/design-language/types';

const HEADING_RE = /^#{1,6}\s+(.*)$/;
const RULE_HEADING_RE = /^rule:\s*(.*)$/;

/**
 * Strip a valid ATX closing sequence from heading text (CommonMark): a
 * trailing run of `#` preceded by a space (`rule: ink ###` → `rule: ink`),
 * or a text of ONLY hashes (`### ###` has empty text). A `#` glued to text
 * (`rule: a#b`) is content, not a closing sequence. Runs BEFORE all rule /
 * near-miss classification, so the spelling never leaks into a rule id —
 * `### rule: ink ###` and `### rule: ink` name the SAME id and the
 * duplicate-id guard sees them collide (AUDIT-round4-codex-01).
 */
function stripAtxClosingSequence(text: string): string {
  if (/^#+$/.test(text)) {
    return '';
  }
  return text.replace(/\s+#+$/, '');
}

/**
 * A field bullet: lowercase single-word key (apostrophe allowed: `don't`).
 * U+2019 (’) is also admitted — smart-quote editors substitute it in prose —
 * and normalized to ASCII `'` before the known-key check, so `don’t:` records
 * like `don't:` and a misspelled curly key still hits the typo guard.
 * All three CommonMark bullet markers (`-` / `*` / `+`) are admitted — a
 * `+`-bulleted rule must parse like a `-`-bulleted one, never drop its fields
 * as inert prose (AUDIT-round4-claude-03).
 */
const FIELD_BULLET_RE = /^[-*+]\s+([a-z][a-z'’]*)\s*:\s*(.*)$/;

/**
 * `css:` paths are RELATIVE TO THE SPEC FILE — the portability contract
 * (AUDIT-round2-codex-02). A machine-rooted path (POSIX `/...`, Windows
 * `C:\...` / `C:/...` or drive-RELATIVE `C:styles.css` (resolves against the
 * drive's current directory on Windows, as a literal filename on POSIX — a
 * css path has no legitimate single-letter-colon prefix), UNC `\\...` or
 * root-relative `\...`, `~`-expanded home) goes green on its author's
 * machine — `resolve(baseDir, path)` IGNORES baseDir for an absolute path —
 * while the spec it lives in is collection content that travels; everywhere
 * else the link misleads or breaks. Such a path is rejected at the SCHEMA
 * level as `malformed-css-link` (a structurally-rejected token, like the
 * missing-selector case — it never enters cssLinks/auxiliaryCssLinks).
 * Parent traversal (`../`) is DELIBERATELY accepted: a spec legitimately
 * references author CSS elsewhere in the repository tree — the portability
 * boundary is the repository/collection, not the spec's own directory.
 */
const NON_PORTABLE_CSS_PATH_RE = /^(?:[/\\]|~|[a-zA-Z]:)/;

/** True iff `path` is machine-rooted (see {@link NON_PORTABLE_CSS_PATH_RE}). */
export function isNonPortableCssPath(path: string): boolean {
  return NON_PORTABLE_CSS_PATH_RE.test(path);
}

/** Opening/closing run of a code fence: ≥3 backticks or ≥3 tildes. */
const FENCE_RUN_RE = /^(`{3,}|~{3,})/;
/** ≥4-space (or tab) indentation: CommonMark indented code. */
const INDENTED_CODE_RE = /^(?: {4}|\t)/;
/** Any bullet shape (`-` / `*` / `+`) — indented bullets are list nesting, not indented code. */
const BULLET_SHAPE_RE = /^[-*+]\s/;

/** An open fenced code block: marker char + opener run length. */
interface OpenFence {
  readonly char: string;
  readonly length: number;
}

/**
 * Classify `trimmed` as a fence opener. Pragmatic CommonMark: any run of ≥3
 * backticks/tildes opens a fence; trailing text is the info string (the
 * CommonMark no-backticks-in-backtick-info-string rule is not modeled).
 */
function openingFence(trimmed: string): OpenFence | undefined {
  const run = FENCE_RUN_RE.exec(trimmed);
  if (run === null) {
    return undefined;
  }
  return { char: run[1][0], length: run[1].length };
}

/**
 * True iff `trimmed` closes `fence`: a line of ONLY the same marker char,
 * repeated at least the opener's length (CommonMark: closers carry no info
 * string and must be at least as long as the opener).
 */
function closesFence(fence: OpenFence, trimmed: string): boolean {
  const run = FENCE_RUN_RE.exec(trimmed);
  return run !== null && run[1] === trimmed && run[1][0] === fence.char && run[1].length >= fence.length;
}

const KNOWN_KEYS = ['kind', 'css', 'example', 'do', "don't"] as const;
type FieldKey = (typeof KNOWN_KEYS)[number];

function isKnownKey(key: string): key is FieldKey {
  return (KNOWN_KEYS as readonly string[]).includes(key);
}

function isRuleKind(value: string): value is DesignRuleKind {
  return (RULE_KINDS as readonly string[]).includes(value);
}

/** A rule section under one `rule:` heading, before validation. */
interface RawRuleSection {
  readonly id: string;
  readonly headingLine: number;
  kind?: string;
  readonly cssLinks: CssLink[];
  readonly examples: string[];
  readonly dos: string[];
  readonly donts: string[];
}

function newSection(id: string, headingLine: number): RawRuleSection {
  return { id, headingLine, cssLinks: [], examples: [], dos: [], donts: [] };
}

interface FieldSink {
  readonly section: RawRuleSection;
  readonly findings: DesignSpecFinding[];
}

function recordField(sink: FieldSink, key: FieldKey, value: string, line: number): void {
  const { section, findings } = sink;
  if (value === '') {
    findings.push({
      rule: 'empty-field',
      message: `Field "${key}:" has an empty value.`,
      ruleId: section.id,
      line,
    });
    return;
  }
  switch (key) {
    case 'kind':
      section.kind = value;
      return;
    case 'css': {
      const spaceAt = value.search(/\s/);
      if (spaceAt === -1) {
        findings.push({
          rule: 'malformed-css-link',
          message: `css link "${value}" names a file but no selector — expected "css: <path> <selector>".`,
          ruleId: section.id,
          line,
        });
        return;
      }
      const path = value.slice(0, spaceAt);
      if (isNonPortableCssPath(path)) {
        findings.push({
          rule: 'malformed-css-link',
          message:
            `css link path "${path}" is machine-rooted — paths are relative to the spec file, ` +
            `so the spec stays portable with its collection; an absolute, drive-prefixed, or ` +
            `~-prefixed path resolves only on its author's machine. Use a spec-relative path ` +
            `("../" traversal within the repository is allowed).`,
          ruleId: section.id,
          line,
        });
        return;
      }
      section.cssLinks.push({
        path,
        selector: value.slice(spaceAt).trim(),
      });
      return;
    }
    case 'example':
      section.examples.push(value);
      return;
    case 'do':
      section.dos.push(value);
      return;
    case "don't":
      section.donts.push(value);
      return;
  }
}

function validateSection(section: RawRuleSection, findings: DesignSpecFinding[]): DesignSpecRule | undefined {
  const problems: DesignSpecFinding[] = [];
  const at = { ruleId: section.id, line: section.headingLine };
  if (section.kind === undefined) {
    problems.push({ rule: 'missing-kind', message: `Rule "${section.id}" has no "kind:" field.`, ...at });
  } else if (!isRuleKind(section.kind)) {
    problems.push({
      rule: 'unknown-kind',
      message: `Rule "${section.id}" has kind "${section.kind}" — expected one of: ${RULE_KINDS.join(', ')}.`,
      ...at,
    });
  }
  if (section.cssLinks.length === 0) {
    problems.push({
      rule: 'missing-css-link',
      message: `Rule "${section.id}" links to no live CSS — every rule needs ≥1 "css: <path> <selector>".`,
      ...at,
    });
  }
  if (section.examples.length === 0) {
    problems.push({
      rule: 'missing-example',
      message: `Rule "${section.id}" carries zero example references — every rule needs ≥1 "example:".`,
      ...at,
    });
  }
  if (section.dos.length === 0 && section.donts.length === 0) {
    problems.push({
      rule: 'missing-guidance',
      message: `Rule "${section.id}" has neither a "do:" nor a "don't:" guidance line.`,
      ...at,
    });
  }
  findings.push(...problems);
  if (problems.length > 0 || section.kind === undefined || !isRuleKind(section.kind)) {
    return undefined;
  }
  return {
    id: section.id,
    kind: section.kind,
    cssLinks: section.cssLinks,
    examples: section.examples,
    dos: section.dos,
    donts: section.donts,
  };
}

/**
 * Parse + structurally validate a design-language spec. Pure: text in,
 * structure + findings out. `spec.rules` carries only the structurally-valid
 * rules; every defect is a finding (never a silent drop).
 *
 * Single-pass surfacing (no finding waves): a section excluded from
 * `spec.rules` is still INSPECTED, never skipped —
 *   - every excluded-section kind (duplicate-id, malformed-rule-heading
 *     near-miss, setext/paragraph declaration attempt) is parsed into a
 *     throwaway section so its field-level defects (unknown-field /
 *     empty-field / malformed-css-link) surface alongside the section-level
 *     finding. Per-rule validation (missing-kind / missing-example / …)
 *     deliberately does NOT fire for these — they are not rules;
 *   - syntactically-usable css links of invalid, duplicate, and attempt
 *     sections are returned as `auxiliaryCssLinks` so the liveness axis can
 *     check them in the same run.
 */
export function parseDesignSpec(markdown: string): DesignSpecParseResult {
  const findings: DesignSpecFinding[] = [];
  const sections: RawRuleSection[] = [];
  // Throwaway sections (duplicates + declaration attempts): inspected for
  // field-level defects + auxiliary css links, excluded from `spec.rules`.
  const throwawaySections: RawRuleSection[] = [];
  const seenIds = new Set<string>();
  let current: RawRuleSection | undefined;
  let fence: OpenFence | undefined;

  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trimEnd();
    const lineNo = i + 1;
    const trimmed = line.trim();
    // Code blocks are inert (see module doc): inside a fence, every line —
    // headings, bullets, attempt shapes, setext lookahead — is skipped.
    if (fence !== undefined) {
      if (closesFence(fence, trimmed)) {
        fence = undefined;
      }
      continue;
    }
    // A ≥4-space-indented non-bullet line is indented code, also inert
    // (field bullets are column-0 by convention; indented BULLETS still
    // parse so nested-list authoring keeps working). Checked before the
    // fence opener so an indented ``` is code content, not a fence.
    if (INDENTED_CODE_RE.test(line) && !BULLET_SHAPE_RE.test(trimmed)) {
      continue;
    }
    const opened = openingFence(trimmed);
    if (opened !== undefined) {
      fence = opened;
      continue;
    }
    const heading = HEADING_RE.exec(trimmed);
    if (heading !== null) {
      current = undefined;
      const headingText = stripAtxClosingSequence(heading[1].trim());
      const ruleHeading = RULE_HEADING_RE.exec(headingText);
      if (ruleHeading === null) {
        const attempt = classifyHeadingAttempt(headingText);
        if (attempt !== undefined) {
          findings.push({ rule: 'malformed-rule-heading', message: attempt.message, line: lineNo });
          // Inspect the attempt's body too (mirrors the duplicate branch).
          current = newSection(attempt.attemptedId, lineNo);
          throwawaySections.push(current);
        }
        continue;
      }
      const id = ruleHeading[1].trim();
      if (id === '') {
        findings.push({
          rule: 'malformed-rule-heading',
          message: `Rule heading at line ${lineNo} has no id — expected "rule: <id>".`,
          line: lineNo,
        });
        // Best-effort attribution: the heading text is all the id there is.
        current = newSection(headingText, lineNo);
        throwawaySections.push(current);
        continue;
      }
      if (seenIds.has(id)) {
        findings.push({
          rule: 'duplicate-rule-id',
          message: `Rule id "${id}" is declared more than once.`,
          ruleId: id,
          line: lineNo,
        });
        // Parse the duplicate into a throwaway section (NOT pushed to
        // `sections`, no `seenIds` effect) so its field bullets are still
        // inspected — field-level findings + auxiliary css links surface in
        // this pass instead of after the author renames the id and reruns.
        current = newSection(id, lineNo);
        throwawaySections.push(current);
        continue;
      }
      seenIds.add(id);
      current = newSection(id, lineNo);
      sections.push(current);
      continue;
    }
    const lineAttempt = classifyLineAttempt(trimmed, lines[i + 1]);
    if (lineAttempt !== undefined) {
      // A declaration in the wrong syntax (setext heading / bare paragraph):
      // flag it AND start a throwaway section so its bullets are inspected
      // instead of silently merging into the preceding rule's section.
      findings.push({ rule: 'malformed-rule-heading', message: lineAttempt.message, line: lineNo });
      current = newSection(lineAttempt.attemptedId, lineNo);
      throwawaySections.push(current);
      continue;
    }
    if (current === undefined) {
      continue;
    }
    const bullet = FIELD_BULLET_RE.exec(trimmed);
    if (bullet === null) {
      continue;
    }
    const key = bullet[1].replace(/’/g, "'");
    if (!isKnownKey(key)) {
      findings.push({
        rule: 'unknown-field',
        message: `Unknown field "${key}:" — known fields are: ${KNOWN_KEYS.join(', ')}.`,
        ruleId: current.id,
        line: lineNo,
      });
      continue;
    }
    recordField({ section: current, findings }, key, bullet[2].trim(), lineNo);
  }

  if (sections.length === 0) {
    findings.push({
      rule: 'no-rules',
      message: 'The spec declares no rules — expected ≥1 "rule: <id>" heading.',
    });
  }

  const rules: DesignSpecRule[] = [];
  const auxiliaryCssLinks: RuleScopedCssLink[] = [];
  for (const section of sections) {
    const rule = validateSection(section, findings);
    if (rule !== undefined) {
      rules.push(rule);
      continue;
    }
    // Invalid housing, usable links: the liveness axis still checks them.
    auxiliaryCssLinks.push(...section.cssLinks.map((link) => ({ ruleId: section.id, link })));
  }
  for (const section of throwawaySections) {
    auxiliaryCssLinks.push(...section.cssLinks.map((link) => ({ ruleId: section.id, link })));
  }

  return { ok: findings.length === 0, spec: { rules }, findings, auxiliaryCssLinks };
}
