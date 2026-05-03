import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JournalEventSchema, type JournalEvent } from '../schema/journal-events.ts';

export async function appendJournalEvent(projectRoot: string, event: JournalEvent): Promise<string> {
  const result = JournalEventSchema.safeParse(event);
  if (!result.success) {
    throw new Error(`appendJournalEvent refused: schema invalid: ${result.error.message}`);
  }
  const dir = join(projectRoot, '.deskwork', 'review-journal', 'history');
  await mkdir(dir, { recursive: true });
  const eventId = randomUUID();
  const tsKey = event.at.replace(/[:.]/g, '-');
  const path = join(dir, `${tsKey}-${eventId}.json`);
  await writeFile(path, JSON.stringify(event, null, 2));
  return path;
}
