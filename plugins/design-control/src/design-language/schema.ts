/**
 * Markdown schema parser/validator for the design-language spec convention
 * (Phase 2, axis A — pure text → structure; NO filesystem, NO engine).
 *
 * Convention (hand-authorable):
 *   - a rule is declared by an ATX heading whose text is `rule: <id>`
 *     (any heading level); the rule's section runs to the next heading;
 *   - fields are single-line bullets `- <key>: <value>` with the CLOSED key set
 *     `kind` / `css` / `example` / `do` / `don't`;
 *   - `css: <path> <selector>` — first token is the file path, the remainder is
 *     the selector (descendant selectors allowed);
 *   - other prose (paragraphs, capitalised-key bullets) is inert.
 *
 * Validation per rule: kind from the closed vocabulary; ≥1 css link; ≥1
 * example (structural presence only — example truthfulness is the
 * named-deferred `spec-truthfulness`); ≥1 do/don't guidance line. A lowercase
 * single-word bullet key outside the closed set is an `unknown-field` finding
 * (typo guard) — silently dropping a misspelled `example:` would otherwise
 * fabricate a missing-example rejection with no visible cause.
 */

import {
  RULE_KINDS,
  type CssLink,
  type DesignRuleKind,
  type DesignSpecFinding,
  type DesignSpecParseResult,
  type DesignSpecRule,
} from '@/design-language/types';

const HEADING_RE = /^#{1,6}\s+(.*)$/;
const RULE_HEADING_RE = /^rule:\s*(.*)$/;
/** A field bullet: lowercase single-word key (apostrophe allowed: `don't`). */
const FIELD_BULLET_RE = /^[-*]\s+([a-z][a-z']*)\s*:\s*(.*)$/;

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
      section.cssLinks.push({
        path: value.slice(0, spaceAt),
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
 */
export function parseDesignSpec(markdown: string): DesignSpecParseResult {
  const findings: DesignSpecFinding[] = [];
  const sections: RawRuleSection[] = [];
  const seenIds = new Set<string>();
  let current: RawRuleSection | undefined;

  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trimEnd();
    const lineNo = i + 1;
    const heading = HEADING_RE.exec(line.trim());
    if (heading !== null) {
      current = undefined;
      const ruleHeading = RULE_HEADING_RE.exec(heading[1].trim());
      if (ruleHeading === null) {
        continue;
      }
      const id = ruleHeading[1].trim();
      if (id === '') {
        findings.push({
          rule: 'malformed-rule-heading',
          message: `Rule heading at line ${lineNo} has no id — expected "rule: <id>".`,
          line: lineNo,
        });
        continue;
      }
      if (seenIds.has(id)) {
        findings.push({
          rule: 'duplicate-rule-id',
          message: `Rule id "${id}" is declared more than once.`,
          ruleId: id,
          line: lineNo,
        });
        continue;
      }
      seenIds.add(id);
      current = { id, headingLine: lineNo, cssLinks: [], examples: [], dos: [], donts: [] };
      sections.push(current);
      continue;
    }
    if (current === undefined) {
      continue;
    }
    const bullet = FIELD_BULLET_RE.exec(line.trim());
    if (bullet === null) {
      continue;
    }
    const key = bullet[1];
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

  const rules = sections
    .map((section) => validateSection(section, findings))
    .filter((rule): rule is DesignSpecRule => rule !== undefined);

  return { ok: findings.length === 0, spec: { rules }, findings };
}
