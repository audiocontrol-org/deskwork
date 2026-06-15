// Per-key well-formedness verification (009 T012). Where a strict consuming
// parser exists, IT is the validity oracle (D6): the config is loaded through
// the installation loader; a roadmap/inbox through the document model. The
// backlog store has no parser here — it is verified structurally by its
// `config.yml` marker. The program audit log likewise has no strict parser
// (audit logs are regex-read, not parsed), so its oracle is a structural
// `# Audit Log` header check, not a D6 parser round-trip. A malformed item
// fails loud, named — never overwritten (FR-009/FR-010). US5 (T029) extends the
// drift/unresolvable-location handling.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocument, type LoadOptions } from '../document-model/document.js';
import { loadInstallationConfig } from '../config/config-loader.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import type { ResolvedPaths, ScaffoldedKey } from '../config/types.js';

export interface VerifyOutcome {
  readonly ok: boolean;
  readonly detail?: string;
}

/** Verify one managed item against its consuming parser. Never throws. */
export function verifyKey(
  key: ScaffoldedKey,
  resolved: ResolvedPaths,
  grammarOpts: LoadOptions,
): VerifyOutcome {
  try {
    switch (key) {
      case 'config':
        loadInstallationConfig(resolved.config);
        return { ok: true };
      case 'roadmap':
        loadDocument(resolved.roadmap, grammarOpts);
        return { ok: true };
      case 'inbox':
        loadDocument(resolved.inbox, grammarOpts);
        return { ok: true };
      case 'backlog':
        return verifyBacklog(resolved.backlog);
      case 'auditLog':
        return verifyAuditLog(resolved.auditLog);
      case 'fleetKnowledge':
        return verifyFleetKnowledge(resolved.fleetKnowledge);
    }
  } catch (err) {
    return { ok: false, detail: errorMessage(err) };
  }
}

function verifyBacklog(storeDir: string): VerifyOutcome {
  const cfg = join(storeDir, 'config.yml');
  if (!existsSync(cfg)) {
    return { ok: false, detail: `backlog store config missing: ${cfg}` };
  }
  return { ok: true };
}

function verifyAuditLog(path: string): VerifyOutcome {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return { ok: false, detail: errorMessage(err) };
  }
  const firstNonEmpty = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '') ?? '';
  if (!firstNonEmpty.startsWith('# Audit Log')) {
    return { ok: false, detail: `audit log missing the '# Audit Log' header: ${path}` };
  }
  return { ok: true };
}

function verifyFleetKnowledge(path: string): VerifyOutcome {
  if (!existsSync(path)) {
    return { ok: false, detail: `fleet knowledge missing: ${path}` };
  }
  const text = readFileSync(path, 'utf8');
  if (!text.includes('lanes:')) {
    return { ok: false, detail: `fleet knowledge missing 'lanes:' root: ${path}` };
  }
  return { ok: true };
}
