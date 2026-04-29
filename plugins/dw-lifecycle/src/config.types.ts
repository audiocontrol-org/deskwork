import { z } from 'zod';

export const ConfigSchema = z.object({
  version: z.literal(1),
  docs: z
    .object({
      root: z.string().default('docs'),
      byVersion: z.boolean().default(true),
      defaultTargetVersion: z.string().default('1.0'),
      knownVersions: z.array(z.string()).default([]),
      statusDirs: z
        .object({
          inProgress: z.string().default('001-IN-PROGRESS'),
          waiting: z.string().default('002-WAITING'),
          complete: z.string().default('003-COMPLETE'),
        })
        .default({
          inProgress: '001-IN-PROGRESS',
          waiting: '002-WAITING',
          complete: '003-COMPLETE',
        }),
    })
    .default({
      root: 'docs',
      byVersion: true,
      defaultTargetVersion: '1.0',
      knownVersions: [],
      statusDirs: {
        inProgress: '001-IN-PROGRESS',
        waiting: '002-WAITING',
        complete: '003-COMPLETE',
      },
    }),
  branches: z
    .object({
      prefix: z.string().default('feature/'),
    })
    .default({ prefix: 'feature/' }),
  worktrees: z
    .object({
      naming: z.string().default('<repo>-<slug>'),
    })
    .default({ naming: '<repo>-<slug>' }),
  journal: z
    .object({
      path: z.string().default('DEVELOPMENT-NOTES.md'),
      enabled: z.boolean().default(true),
    })
    .default({ path: 'DEVELOPMENT-NOTES.md', enabled: true }),
  tracking: z
    .object({
      platform: z.enum(['github']).default('github'),
      parentLabels: z.array(z.string()).default(['enhancement']),
      phaseLabels: z.array(z.string()).default(['enhancement']),
    })
    .default({
      platform: 'github',
      parentLabels: ['enhancement'],
      phaseLabels: ['enhancement'],
    }),
  session: z
    .object({
      start: z.object({ preamble: z.string().default('') }).default({ preamble: '' }),
      end: z.object({ preamble: z.string().default('') }).default({ preamble: '' }),
    })
    .default({ start: { preamble: '' }, end: { preamble: '' } }),
});

export type Config = z.infer<typeof ConfigSchema>;
