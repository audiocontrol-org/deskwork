import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { repoRoot } from '../repo.js';
import { appendJournalEntry } from '../journal.js';

export async function journalAppend(args: string[]): Promise<void> {
  let entryFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') entryFile = args[++i];
  }
  if (!entryFile) throw new Error('Usage: dw-lifecycle journal-append --file <entry.md>');

  const root = repoRoot();
  const cfg = loadConfig(root);
  if (!cfg.journal.enabled) {
    console.log(JSON.stringify({ skipped: true, reason: 'journal.enabled=false' }));
    return;
  }

  const journalPath = join(root, cfg.journal.path);
  const entry = readFileSync(entryFile, 'utf8');
  appendJournalEntry(journalPath, entry);
  console.log(JSON.stringify({ journalPath, appended: true }));
}
