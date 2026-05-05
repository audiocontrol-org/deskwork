/**
 * Per-mode dispatch helpers for the studio scrapbook mutation routes.
 *
 * Post-#192: both modes (`entry` and `slug`) route through the entry-
 * aware `*AtDir` family after `resolveScrapbookDir` produces an absolute
 * scrapbook directory. The slug-mode resolution still goes through
 * `scrapbookDirForEntry` — passing `{ slug }` without an id triggers
 * the internal slug-template fallback inside the resolver — but the
 * public CRUD surface is unified on the `*AtDir` helpers. The route
 * handler stays thin: read JSON, parse envelope, validate route-
 * specific args, dispatch.
 *
 * Extracted from `scrapbook-mutations.ts` (#191) to keep the route file
 * under the project's 300–500 line cap.
 */

import {
  createScrapbookMarkdownAtDir,
  deleteScrapbookFileAtDir,
  renameScrapbookFileAtDir,
  saveScrapbookFileAtDir,
  scrapbookFilePathAtDir,
  writeScrapbookUploadAtDir,
  type ScrapbookItem,
} from '@deskwork/core/scrapbook';
import { existsSync } from 'node:fs';
import type { StudioContext } from './api.ts';
import {
  resolveScrapbookDir,
  type ParsedEnvelope,
} from './scrapbook-mutation-envelope.ts';

export async function saveDispatch(
  ctx: StudioContext,
  env: ParsedEnvelope,
  filename: string,
  bodyText: string,
): Promise<ScrapbookItem> {
  const dir = await resolveScrapbookDir(ctx, env);
  const abs = scrapbookFilePathAtDir(dir, filename, { secret: env.secret });
  if (!existsSync(abs)) {
    if (filename.endsWith('.md')) {
      return createScrapbookMarkdownAtDir(dir, filename, bodyText, {
        secret: env.secret,
      });
    }
    return writeScrapbookUploadAtDir(
      dir,
      filename,
      Buffer.from(bodyText, 'utf-8'),
      { secret: env.secret },
    );
  }
  return saveScrapbookFileAtDir(dir, filename, bodyText, {
    secret: env.secret,
  });
}

export async function renameInPlace(
  ctx: StudioContext,
  env: ParsedEnvelope,
  oldName: string,
  newName: string,
): Promise<ScrapbookItem> {
  const dir = await resolveScrapbookDir(ctx, env);
  return renameScrapbookFileAtDir(dir, oldName, newName, {
    secret: env.secret,
  });
}

export interface CrossSectionPaths {
  srcAbs: string;
  dstAbs: string;
}

export async function resolveCrossSectionPaths(
  ctx: StudioContext,
  env: ParsedEnvelope,
  oldName: string,
  newName: string,
  toSecret: boolean,
): Promise<CrossSectionPaths> {
  const dir = await resolveScrapbookDir(ctx, env);
  return {
    srcAbs: scrapbookFilePathAtDir(dir, oldName, { secret: env.secret }),
    dstAbs: scrapbookFilePathAtDir(dir, newName, { secret: toSecret }),
  };
}

export async function deleteDispatch(
  ctx: StudioContext,
  env: ParsedEnvelope,
  filename: string,
): Promise<void> {
  const dir = await resolveScrapbookDir(ctx, env);
  deleteScrapbookFileAtDir(dir, filename, { secret: env.secret });
}

export async function createDispatch(
  ctx: StudioContext,
  env: ParsedEnvelope,
  filename: string,
  bodyText: string,
): Promise<ScrapbookItem> {
  const dir = await resolveScrapbookDir(ctx, env);
  return createScrapbookMarkdownAtDir(dir, filename, bodyText, {
    secret: env.secret,
  });
}

export async function uploadDispatch(
  ctx: StudioContext,
  env: ParsedEnvelope,
  filename: string,
  buf: Buffer,
): Promise<ScrapbookItem> {
  const dir = await resolveScrapbookDir(ctx, env);
  return writeScrapbookUploadAtDir(dir, filename, buf, {
    secret: env.secret,
  });
}
