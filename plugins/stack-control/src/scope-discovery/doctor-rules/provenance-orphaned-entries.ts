/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/provenance-orphaned-entries.ts
 *
 * Doctor rule: surface broken cross-references
 * between catalog entries and audit-log findings.
 *
 * # The two failure modes this rule catches
 *
 *   1. FORWARD-orphaned catalog entry — a catalog entry carries
 *      `provenance.context: audit-finding-<id>` (the `withdrawn`
 *      reversibility-primitive contract, or other audit-driven
 *      provenance) BUT the audit-log has no `<id>` entry. This is the
 *      "the auditor's finding was renamed / deleted / never landed"
 *      class of drift.
 *
 *   2. BACKWARD-orphaned catalog entry — a catalog entry's
 *      `audit_history:` list names a Finding-ID that doesn't exist
 *      in the audit-log. Same drift class, surfaced from the catalog
 *      side.
 *
 *   3. UNMATCHED audit-log `Affects:` citation — an audit-log entry
 *      promises to affect `<registry>#<entry-id>` BUT the catalog
 *      entry doesn't exist (typo, registry rename, or entry deleted
 *      after the auditor wrote the finding).
 *
 * # Scope of catalog registries inspected
 *
 *   - .stack-control/scope-discovery/anti-patterns.yaml
 *   - .stack-control/scope-discovery/adopter-manifests.yaml
 *   - .stack-control/scope-discovery/clones.yaml
 *   - .stack-control/scope-discovery/pattern-matrix-patterns.yaml
 *     (project override)
 *
 * The deprecation-queue.yaml is intentionally NOT inspected — its
 * entries are discovered from source markers (not hand-authored), so
 * forward provenance references aren't part of the operator's edit
 * surface yet. The pattern-matrix BUILTIN_PATTERNS are also skipped —
 * the override catalog is the only one that can hold operator-authored
 * provenance.
 *
 * # Audit-log discovery
 *
 * The rule walks every feature root's `audit-log.md` across both
 * layouts — `specs/<NNN>-<slug>/` (speckit) and the legacy versioned
 * docs layout — via the shared `discoverFeatureRoots` enumerator
 * (specs/014 US7); each audit-log is parsed independently. Citations resolved across multiple audit-logs union
 * by Finding-ID. (A given Finding-ID is namespaced per-feature; the
 * rule treats the union as the lookup surface because feature-cross
 * references shouldn't be common but are not invalid.)
 *
 * # Finding shape
 *
 * Each broken cross-reference produces one warning finding. The
 * message names the offending side + the broken reference + the
 * actionable remediation path (edit the catalog OR file an audit-log
 * follow-up entry).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { discoverFeatureRoots } from '../util/feature-root.js';
import {
  auditFindingIdSet,
  citationEntryId,
  citationRegistry,
  parseAuditLogText,
  type ParsedAuditEntry,
} from '../util/audit-log-parser.js';
import { errorMessage, isPlainObject } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'provenance-orphaned-entries';
const CONFIG_DIR_REL = '.stack-control/scope-discovery';
const AUDIT_LOG_FILENAME = 'audit-log.md';

const AUDIT_FINDING_PREFIX = 'audit-finding-';

/**
 * One catalog registry the rule inspects. `entryListKey` is the top-
 * level YAML key whose value is the entry list (mirrors the runtime
 * parsers' contract); `registryFile` is the filename adopters see
 * (used to disambiguate citations like `anti-patterns.yaml#foo-id`).
 */
interface InspectedRegistry {
  readonly file: string;
  readonly entryListKey: string;
  readonly registryFile: string;
}

const INSPECTED_REGISTRIES: ReadonlyArray<InspectedRegistry> = [
  { file: 'anti-patterns.yaml', entryListKey: 'anti_patterns', registryFile: 'anti-patterns.yaml' },
  {
    file: 'adopter-manifests.yaml',
    entryListKey: 'adopter_manifests',
    registryFile: 'adopter-manifests.yaml',
  },
  { file: 'clones.yaml', entryListKey: 'clones', registryFile: 'clones.yaml' },
  {
    file: 'pattern-matrix-patterns.yaml',
    entryListKey: 'patterns',
    registryFile: 'pattern-matrix-patterns.yaml',
  },
];

/**
 * One catalog entry surfaced from a registry — the rule needs the id,
 * the optional forward provenance ref, and the optional reverse
 * `audit_history` list.
 */
interface CatalogEntryView {
  readonly registryFile: string;
  readonly id: string;
  /** `provenance.context` value if it starts with `audit-finding-`. */
  readonly forwardAuditId: string | null;
  /** `audit_history:` array (empty when absent). */
  readonly auditHistory: readonly string[];
}

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const configDir = join(opts.repoRoot, CONFIG_DIR_REL);
  if (!existsSync(configDir)) {
    // No scope-discovery installed; the config-missing rule covers this case.
    return [];
  }
  const findings: ScopeDoctorFinding[] = [];

  // Collect the catalog entries from each registry.
  const catalogEntries: CatalogEntryView[] = [];
  for (const reg of INSPECTED_REGISTRIES) {
    const path = join(configDir, reg.file);
    if (!existsSync(path)) continue;
    const collected = collectCatalogEntries(path, reg, findings);
    for (const entry of collected) catalogEntries.push(entry);
  }

  // Walk every feature's audit-log across BOTH layouts (specs/014 US7
  // — the enumeration routes through the shared layout-aware resolver
  // module; this rule no longer constructs the legacy path itself).
  const auditLogs = await discoverAuditLogs(opts.repoRoot);
  const allEntries: ParsedAuditEntry[] = [];
  for (const logPath of auditLogs) {
    let text: string;
    try {
      text = readFileSync(logPath, 'utf8');
    } catch (err) {
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message: `${logPath}: failed to read audit-log (${errorMessage(err)}).`,
      });
      continue;
    }
    const entries = parseAuditLogText(text);
    for (const entry of entries) allEntries.push(entry);
  }
  const auditFindingSet = auditFindingIdSet({ sourcePath: '', entries: allEntries });

  // (1) + (2) — catalog entries with provenance / audit_history pointing
  // at non-existent audit findings.
  for (const entry of catalogEntries) {
    if (entry.forwardAuditId !== null && !auditFindingSet.has(entry.forwardAuditId)) {
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message:
          `${entry.registryFile}#${entry.id}: \`provenance.context: ${AUDIT_FINDING_PREFIX}` +
          `${entry.forwardAuditId}\` points at an audit-log Finding-ID that does not exist. ` +
          `Either correct the provenance.context (the Finding-ID may have been renamed) ` +
          `or add the missing finding to the relevant audit-log. ` +
          `Audit-log lookup unioned across ${auditLogs.length} in-progress feature(s).`,
      });
    }
    for (const historyId of entry.auditHistory) {
      if (!auditFindingSet.has(historyId)) {
        findings.push({
          rule: RULE_ID,
          severity: 'warning',
          message:
            `${entry.registryFile}#${entry.id}: \`audit_history\` references "${historyId}" ` +
            `which does not exist in any in-progress feature's audit-log. ` +
            `Either correct the entry-id or remove the stale reference. ` +
            `Audit-log lookup unioned across ${auditLogs.length} in-progress feature(s).`,
        });
      }
    }
  }

  // (3) — audit-log `Affects:` citations that don't resolve to a
  // catalog entry. Build a (registry-file, entry-id) lookup AND a
  // bare-id lookup for citation forms.
  const byRegistry = new Map<string, Set<string>>();
  const allIds = new Set<string>();
  for (const entry of catalogEntries) {
    let set = byRegistry.get(entry.registryFile);
    if (set === undefined) {
      set = new Set<string>();
      byRegistry.set(entry.registryFile, set);
    }
    set.add(entry.id);
    allIds.add(entry.id);
  }
  for (const auditEntry of allEntries) {
    for (const citation of auditEntry.affects) {
      const id = citationEntryId(citation);
      const registry = citationRegistry(citation);
      if (registry !== null) {
        const set = byRegistry.get(registry);
        if (set === undefined || !set.has(id)) {
          findings.push({
            rule: RULE_ID,
            severity: 'warning',
            message:
              `audit-log entry ${auditEntry.findingId}: \`Affects: ${citation}\` does not resolve ` +
              `to any catalog entry in ${CONFIG_DIR_REL}/. ` +
              `Either correct the citation (typo / registry rename) or add the catalog entry ` +
              `back into the relevant registry.`,
          });
        }
        continue;
      }
      // Bare-id citation — search across every registry.
      if (!allIds.has(id)) {
        findings.push({
          rule: RULE_ID,
          severity: 'warning',
          message:
            `audit-log entry ${auditEntry.findingId}: \`Affects: ${citation}\` (bare id) ` +
            `does not resolve to any catalog entry in ${CONFIG_DIR_REL}/. ` +
            `Either correct the citation or add the catalog entry back into the relevant registry.`,
        });
      }
    }
  }
  return findings;
};

/**
 * Parse one registry YAML + project a `CatalogEntryView` per entry.
 * Shape errors are forwarded as findings (so a malformed file
 * surfaces here AS WELL AS via the dedicated schema-violation rules
 * — the rule operator wants to know the orphan check ran).
 */
function collectCatalogEntries(
  path: string,
  reg: InspectedRegistry,
  findings: ScopeDoctorFinding[],
): readonly CatalogEntryView[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    findings.push({
      rule: RULE_ID,
      severity: 'warning',
      message: `${path}: failed to read for provenance check (${errorMessage(err)}).`,
    });
    return [];
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch {
    // Shape errors handled by the schema-violation rules; we don't
    // double-report here. Without a parsed body we cannot check
    // provenance, so we silently skip.
    return [];
  }
  if (!isPlainObject(parsed)) return [];
  const rawEntries = parsed[reg.entryListKey];
  if (!Array.isArray(rawEntries)) return [];
  const out: CatalogEntryView[] = [];
  rawEntries.forEach((raw: unknown) => {
    if (!isPlainObject(raw)) return;
    const id = raw['id'];
    if (typeof id !== 'string' || id.length === 0) return;
    out.push({
      registryFile: reg.registryFile,
      id,
      forwardAuditId: extractForwardAuditId(raw['provenance']),
      auditHistory: extractAuditHistory(raw['audit_history']),
    });
  });
  return out;
}

/**
 * Extract the audit Finding-ID from a `provenance` block when its
 * `context:` field starts with `audit-finding-`. Returns null
 * otherwise. The prefix-stripped id is the lookup key against the
 * audit-log's `Finding-ID:` field.
 */
function extractForwardAuditId(raw: unknown): string | null {
  if (!isPlainObject(raw)) return null;
  const context = raw['context'];
  if (typeof context !== 'string' || !context.startsWith(AUDIT_FINDING_PREFIX)) {
    return null;
  }
  const id = context.substring(AUDIT_FINDING_PREFIX.length);
  return id.length > 0 ? id : null;
}

/**
 * Extract the `audit_history:` list from a raw entry. Returns an
 * empty array when absent, non-array, OR non-string elements (the
 * runtime parsers throw on those shapes; the doctor rule is lenient
 * because the schema-violation rules surface the shape errors).
 */
function extractAuditHistory(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value === 'string' && value.length > 0) out.push(value);
  }
  return out;
}

/**
 * Walk every feature root's `audit-log.md` across both physical
 * layouts (specs/014 US7): `specs/<dir>/` and the legacy versioned
 * docs layout — enumerated by the shared `discoverFeatureRoots`
 * resolver, so the layout literals stay in one module (FR-010).
 */
async function discoverAuditLogs(repoRoot: string): Promise<readonly string[]> {
  const roots = await discoverFeatureRoots(repoRoot);
  // Deterministic order — discoverFeatureRoots sorts; keep the sort
  // after filtering so doctor output is stable across runs.
  return roots
    .map((root) => join(root, AUDIT_LOG_FILENAME))
    .filter((logPath) => existsSync(logPath))
    .sort();
}
