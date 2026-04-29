// src/journal.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function appendJournalEntry(journalPath: string, entry: string): void {
  if (!existsSync(journalPath)) {
    writeFileSync(journalPath, '# Development Notes\n\n' + entry + '\n', 'utf8');
    return;
  }
  const current = readFileSync(journalPath, 'utf8');
  // Idempotency: extract first line of entry as a fingerprint
  const fingerprint = entry.split('\n')[0];
  if (fingerprint) {
    const lines = current.split('\n');
    if (lines.includes(fingerprint)) {
      return;
    }
  }
  const trimmed = current.endsWith('\n') ? current : current + '\n';
  writeFileSync(journalPath, trimmed + '\n' + entry + (entry.endsWith('\n') ? '' : '\n'), 'utf8');
}
