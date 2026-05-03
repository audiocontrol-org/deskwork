/**
 * doctor — legacy-schema migration gate (Phase 29).
 *
 * Detects pre-redesign calendar shape (Review/Paused sections, OR no
 * `.deskwork/entries/` sidecar dir) and routes to migrateCalendar()
 * before the rule loop runs. Extracted from doctor.ts to keep the
 * command file under the 500-line house limit.
 *
 * Outcome contract (consumed by run() in doctor.ts):
 *
 *   handled === true   → caller exits immediately with `exitCode`.
 *                        Hit when:
 *                          - --check produced a dry-run preview
 *                          - audit-only (no --fix) detected legacy
 *                            and refused to proceed; printed how-to-
 *                            fix hint; caller exits 1.
 *
 *   handled === false  → caller continues into the existing rule loop.
 *                        Hit when:
 *                          - schema is already entry-centric (no-op),
 *                          - --fix mode just applied a successful
 *                            migration; the rule loop runs against
 *                            the freshly-migrated tree.
 */

import {
  detectLegacySchema,
  migrateCalendar,
} from '@deskwork/core/doctor/migrate';

export interface MigrateOutcome {
  readonly handled: boolean;
  readonly exitCode: number;
}

export async function maybeMigrate(
  projectRoot: string,
  repairMode: boolean,
  check: boolean,
): Promise<MigrateOutcome> {
  const isLegacy = await detectLegacySchema(projectRoot);
  if (!isLegacy) return { handled: false, exitCode: 0 };

  if (check) {
    const result = await migrateCalendar(projectRoot, { dryRun: true });
    process.stdout.write(
      `Doctor: legacy schema detected — would migrate ${result.entriesMigrated} entries (dry run)\n`,
    );
    if (result.unmigratable.length > 0) {
      process.stdout.write(
        `  ${result.unmigratable.length} entries cannot be migrated automatically:\n`,
      );
      for (const reason of result.unmigratable) {
        process.stdout.write(`    - ${reason}\n`);
      }
    }
    return { handled: true, exitCode: 1 };
  }

  if (!repairMode) {
    process.stderr.write(
      `\nDoctor: calendar uses pre-redesign schema (Review/Paused sections OR no .deskwork/entries/ dir).\n` +
        `Run 'deskwork doctor <root> --fix=all' to migrate, or 'deskwork doctor <root> --check' for a dry-run preview.\n`,
    );
    return { handled: true, exitCode: 1 };
  }

  const result = await migrateCalendar(projectRoot, { dryRun: false });
  process.stdout.write(
    `Doctor: migrated ${result.entriesMigrated} entries to entry-centric schema\n`,
  );
  if (result.unmigratable.length > 0) {
    process.stdout.write(
      `  ${result.unmigratable.length} entries could not be migrated:\n`,
    );
    for (const reason of result.unmigratable) {
      process.stdout.write(`    - ${reason}\n`);
    }
  }
  // After a successful migration, fall through so the existing rule
  // loop runs against the freshly-migrated tree.
  return { handled: false, exitCode: 0 };
}
