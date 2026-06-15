import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const ARCHIVE_VERSION = 1;

const portablePathSchema = z.string().min(1).refine((value) => !value.startsWith('~'), {
  message: 'paths must be project-relative or absolute repository paths; "~" paths are not portable',
});

const surfaceIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'surfaceId must be a portable filename token');

const supersedesSchema = z.object({
  archivePath: portablePathSchema,
  reason: z.string().min(1),
});

const archiveEntrySchema = z
  .object({
    version: z.literal(ARCHIVE_VERSION),
    surfaceId: surfaceIdSchema,
    brief: z.string().min(1),
    proposal: z.object({
      wireframePath: portablePathSchema,
      recordedAt: z.string().datetime(),
    }),
    accepted: z
      .object({
        wireframePath: portablePathSchema,
        acceptedAt: z.string().datetime(),
        implementationCommit: z.string().min(1).optional(),
      })
      .optional(),
    rejected: z
      .object({
        rationale: z.string().min(1),
        rejectedAt: z.string().datetime(),
      })
      .optional(),
    supersedes: supersedesSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.accepted?.implementationCommit && !value.accepted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'implementationCommit requires an accepted decision',
        path: ['accepted', 'implementationCommit'],
      });
    }
  });

export type ArchiveSupersedes = z.infer<typeof supersedesSchema>;
export type DesignArchiveEntry = z.infer<typeof archiveEntrySchema>;

export function createArchiveEntry(input: {
  surfaceId: string;
  brief: string;
  proposalWireframePath: string;
  proposalRecordedAt?: Date;
  acceptedWireframePath?: string;
  acceptedAt?: Date;
  implementationCommit?: string;
  rejectedRationale?: string;
  rejectedAt?: Date;
  supersedes?: ArchiveSupersedes;
}): DesignArchiveEntry {
  return archiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    surfaceId: input.surfaceId,
    brief: input.brief,
    proposal: {
      wireframePath: input.proposalWireframePath,
      recordedAt: (input.proposalRecordedAt ?? new Date()).toISOString(),
    },
    accepted: input.acceptedWireframePath
      ? {
          wireframePath: input.acceptedWireframePath,
          acceptedAt: (input.acceptedAt ?? new Date()).toISOString(),
          implementationCommit: input.implementationCommit,
        }
      : undefined,
    rejected: input.rejectedRationale
      ? {
          rationale: input.rejectedRationale,
          rejectedAt: (input.rejectedAt ?? new Date()).toISOString(),
        }
      : undefined,
    supersedes: input.supersedes,
  });
}

export function writeArchiveEntry(filePath: string, entry: DesignArchiveEntry): void {
  const absolute = resolve(filePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(archiveEntrySchema.parse(entry), null, 2) + '\n');
}

export function loadArchiveEntry(filePath: string): DesignArchiveEntry {
  const absolute = resolve(filePath);
  return archiveEntrySchema.parse(JSON.parse(readFileSync(absolute, 'utf8')) as unknown);
}
