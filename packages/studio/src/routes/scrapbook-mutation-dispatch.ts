/**
 * Per-mode dispatch helpers for the studio scrapbook mutation routes.
 *
 * Each helper takes the parsed envelope + the mutation arguments and
 * dispatches to either the slug-template helper (slug mode) or the
 * `*AtDir` helper after resolving the entry-aware dir (entry mode). The
 * route handler stays thin — read JSON, parse envelope, validate route-
 * specific args, dispatch.
 *
 * Extracted from `scrapbook-mutations.ts` (#191) to keep the route file
 * under the project's 300–500 line cap.
 */

import {
  createScrapbookMarkdown,
  createScrapbookMarkdownAtDir,
  deleteScrapbookFile,
  deleteScrapbookFileAtDir,
  renameScrapbookFile,
  renameScrapbookFileAtDir,
  saveScrapbookFile,
  saveScrapbookFileAtDir,
  scrapbookFilePath,
  scrapbookFilePathAtDir,
  writeScrapbookUpload,
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
  if (env.mode === 'entry') {
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
  // Slug-template fallback path.
  const abs = scrapbookFilePath(
    ctx.projectRoot,
    ctx.config,
    env.site,
    env.slug,
    filename,
    { secret: env.secret },
  );
  if (!existsSync(abs)) {
    if (filename.endsWith('.md')) {
      return createScrapbookMarkdown(
        ctx.projectRoot,
        ctx.config,
        env.site,
        env.slug,
        filename,
        bodyText,
        { secret: env.secret },
      );
    }
    return writeScrapbookUpload(
      ctx.projectRoot,
      ctx.config,
      env.site,
      env.slug,
      filename,
      Buffer.from(bodyText, 'utf-8'),
      { secret: env.secret },
    );
  }
  return saveScrapbookFile(
    ctx.projectRoot,
    ctx.config,
    env.site,
    env.slug,
    filename,
    bodyText,
    { secret: env.secret },
  );
}

export async function renameInPlace(
  ctx: StudioContext,
  env: ParsedEnvelope,
  oldName: string,
  newName: string,
): Promise<ScrapbookItem> {
  if (env.mode === 'entry') {
    const dir = await resolveScrapbookDir(ctx, env);
    return renameScrapbookFileAtDir(dir, oldName, newName, {
      secret: env.secret,
    });
  }
  return renameScrapbookFile(
    ctx.projectRoot,
    ctx.config,
    env.site,
    env.slug,
    oldName,
    newName,
    { secret: env.secret },
  );
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
  if (env.mode === 'entry') {
    const dir = await resolveScrapbookDir(ctx, env);
    return {
      srcAbs: scrapbookFilePathAtDir(dir, oldName, { secret: env.secret }),
      dstAbs: scrapbookFilePathAtDir(dir, newName, { secret: toSecret }),
    };
  }
  return {
    srcAbs: scrapbookFilePath(
      ctx.projectRoot,
      ctx.config,
      env.site,
      env.slug,
      oldName,
      { secret: env.secret },
    ),
    dstAbs: scrapbookFilePath(
      ctx.projectRoot,
      ctx.config,
      env.site,
      env.slug,
      newName,
      { secret: toSecret },
    ),
  };
}

export async function deleteDispatch(
  ctx: StudioContext,
  env: ParsedEnvelope,
  filename: string,
): Promise<void> {
  if (env.mode === 'entry') {
    const dir = await resolveScrapbookDir(ctx, env);
    deleteScrapbookFileAtDir(dir, filename, { secret: env.secret });
    return;
  }
  deleteScrapbookFile(
    ctx.projectRoot,
    ctx.config,
    env.site,
    env.slug,
    filename,
    { secret: env.secret },
  );
}

export async function createDispatch(
  ctx: StudioContext,
  env: ParsedEnvelope,
  filename: string,
  bodyText: string,
): Promise<ScrapbookItem> {
  if (env.mode === 'entry') {
    const dir = await resolveScrapbookDir(ctx, env);
    return createScrapbookMarkdownAtDir(dir, filename, bodyText, {
      secret: env.secret,
    });
  }
  return createScrapbookMarkdown(
    ctx.projectRoot,
    ctx.config,
    env.site,
    env.slug,
    filename,
    bodyText,
    { secret: env.secret },
  );
}

export async function uploadDispatch(
  ctx: StudioContext,
  env: ParsedEnvelope,
  filename: string,
  buf: Buffer,
): Promise<ScrapbookItem> {
  if (env.mode === 'entry') {
    const dir = await resolveScrapbookDir(ctx, env);
    return writeScrapbookUploadAtDir(dir, filename, buf, {
      secret: env.secret,
    });
  }
  return writeScrapbookUpload(
    ctx.projectRoot,
    ctx.config,
    env.site,
    env.slug,
    filename,
    buf,
    { secret: env.secret },
  );
}
