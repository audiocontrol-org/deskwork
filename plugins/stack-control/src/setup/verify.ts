// Per-key well-formedness verification (009 T012) — the validity oracle is the
// consuming parser itself (D6): a roadmap/inbox is loaded through the document
// model; the config through the installation loader; the backlog store by its
// `config.yml` marker; the program audit log by its header. A malformed item
// fails loud, named — never overwritten (FR-009/FR-010). US5 (T029) extends the
// drift/unresolvable-location handling.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocument, type LoadOptions } from '../document-model/document.js';
import { loadInstallationConfig } from '../config/config-loader.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import type { ResolvedPaths, WorkingFileKey } from '../config/types.js';

export interface VerifyOutcome {
  readonly ok: boolean;
  readonly detail?: string;
}

/** Verify one managed item against its consuming parser. Never throws. */
export function verifyKey(
  key: WorkingFileKey,
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
