import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { loadArchiveEntry } from '@/archive/store';
import { checkDesignSpecFile, type CliIo } from '@/design-language/check-spec-file';
import {
  checkDerivedAcceptance,
  loadProvenance,
  verifyDrivingWireframe,
} from '@/provenance/derived';
import {
  collectionRelativePathSchema,
  sha256HexSchema,
  viewportSchema,
} from '@/manifests/manifest-fields';

const STATUS_MANIFEST_VERSION = 1;

const sha256Hex = (content: string): string => createHash('sha256').update(content).digest('hex');

const pathSchema = collectionRelativePathSchema;

const sourceFileSchema = z.object({
  path: pathSchema,
  sha256: sha256HexSchema,
});

const staleSurfaceSchema = z.union([
  z.object({
    mode: z.literal('mapped'),
    sourceFiles: z.array(sourceFileSchema).min(1),
  }),
  z.object({
    mode: z.literal('operator-approved-descope'),
    rationale: z.string().min(1),
  }),
]);

const surfaceStatusManifestSchema = z
  .object({
    version: z.literal(STATUS_MANIFEST_VERSION),
    surfaceId: z.string().min(1),
    changeIntentBrief: z.string().min(1),
    routeState: z.string().min(1),
    viewports: z.array(viewportSchema).min(1),
    wireframe: z.object({
      path: pathSchema,
      sha256: sha256HexSchema,
    }),
    designSpec: z.object({
      path: pathSchema,
      version: z.string().min(1),
      sha256: sha256HexSchema,
    }),
    archive: z.object({
      path: pathSchema,
    }),
    implementationCommit: z.string().min(1),
    staleSurface: staleSurfaceSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasDesktop = value.viewports.some((viewport) => viewport.width >= 1280);
    const hasPhone = value.viewports.some((viewport) => viewport.width <= 390);
    if (!hasDesktop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viewports'],
        message: 'viewports must include at least one desktop viewport with width >= 1280',
      });
    }
    if (!hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viewports'],
        message: 'viewports must include at least one phone viewport with width <= 390',
      });
    }
  });

export type SurfaceStatusManifest = z.infer<typeof surfaceStatusManifestSchema>;

export type DesignControlStatusRule =
  | 'malformed-manifest'
  | 'missing-wireframe'
  | 'missing-design-spec'
  | 'missing-wireframe-provenance'
  | 'unaccepted-decision'
  | 'invalid-design-spec'
  | 'dead-link-spec'
  | 'unchecked-link-spec'
  | 'derived-unedited'
  | 'stale-surface'
  | 'stale-surface-unmapped';

export interface DesignControlStatusFinding {
  readonly rule: DesignControlStatusRule;
  readonly message: string;
}

export interface DesignControlStatusResult {
  readonly complete: boolean;
  readonly nextAction: string;
  readonly findings: readonly DesignControlStatusFinding[];
}

function finding(rule: DesignControlStatusRule, message: string): DesignControlStatusFinding {
  return { rule, message };
}

function firstNextAction(rule: DesignControlStatusRule): string {
  switch (rule) {
    case 'malformed-manifest':
      return 'Fix the surface status manifest so required artifact paths and hashes parse cleanly.';
    case 'missing-wireframe':
      return 'Author or restore the accepted wireframe artifact and keep its manifest hash in sync.';
    case 'missing-design-spec':
      return 'Author or restore the design-language spec artifact and keep its manifest hash in sync.';
    case 'missing-wireframe-provenance':
      return 'Record wireframe provenance so status can distinguish driving vs derived artifacts.';
    case 'unaccepted-decision':
      return 'Record an accepted wireframe decision in the exploration archive.';
    case 'invalid-design-spec':
      return 'Fix the design-language spec so the spec gate passes before calling the surface complete.';
    case 'dead-link-spec':
      return 'Fix the design-language spec so all CSS links resolve live and the spec goes green.';
    case 'unchecked-link-spec':
      return 'Add at least one validated author-written .css link per rule before calling the spec complete.';
    case 'derived-unedited':
      return 'Edit the derived wireframe before acceptance, or replace it with a driving wireframe.';
    case 'stale-surface':
      return 'Refresh the surface mapping or review the source drift before calling the surface complete.';
    case 'stale-surface-unmapped':
      return 'Add a stale-surface mapping or record an operator-approved descope before completion.';
  }
}

function resolveAgainstManifest(manifestPath: string, target: string): string {
  return resolve(dirname(resolve(manifestPath)), target);
}

// Resolve symlinks on the deepest existing prefix of `absoluteTarget`, then
// re-append the not-yet-existing remainder. This lets a not-yet-authored
// artifact validate (its existing ancestors are realpath'd) while a symlink at
// any existing level that escapes the collection root is followed and caught.
function realpathOfExistingPrefix(absoluteTarget: string): string {
  let current = absoluteTarget;
  const trailing: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      return absoluteTarget;
    }
    trailing.unshift(basename(current));
    current = parent;
  }
  const realBase = realpathSync(current);
  return trailing.length === 0 ? realBase : join(realBase, ...trailing);
}

function assertWithinCollection(manifestPath: string, field: string, target: string): void {
  // realpath the root too, so a collection living under a symlinked parent is
  // compared on the same (resolved) basis as the realpath'd target.
  const collectionRoot = realpathOfExistingPrefix(dirname(resolve(manifestPath)));
  const absolute = realpathOfExistingPrefix(resolveAgainstManifest(manifestPath, target));
  const rel = relative(collectionRoot, absolute);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return;
  }
  throw new Error(`${field} must stay within the collection root; got ${JSON.stringify(target)}`);
}

type HashCheck = { readonly ok: true; readonly matches: boolean } | { readonly ok: false; readonly error: string };

// Read-and-hash that never throws on an unreadable / concurrently-changed
// artifact: a file that passes existsSync but fails to read (EISDIR, EACCES,
// raced unlink) becomes a structured result, not an unhandled crash.
function checkFileHash(path: string, expectedSha256: string): HashCheck {
  try {
    return { ok: true, matches: sha256Hex(readFileSync(path, 'utf8')) === expectedSha256 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function loadSurfaceStatusManifest(manifestPath: string): SurfaceStatusManifest {
  const absolute = resolve(manifestPath);
  const parsed = surfaceStatusManifestSchema.parse(JSON.parse(readFileSync(absolute, 'utf8')) as unknown);
  assertWithinCollection(absolute, 'wireframe.path', parsed.wireframe.path);
  assertWithinCollection(absolute, 'designSpec.path', parsed.designSpec.path);
  assertWithinCollection(absolute, 'archive.path', parsed.archive.path);
  if (parsed.staleSurface?.mode === 'mapped') {
    for (const [index, source] of parsed.staleSurface.sourceFiles.entries()) {
      assertWithinCollection(absolute, `staleSurface.sourceFiles[${index}].path`, source.path);
    }
  }
  return parsed;
}

export function getSurfaceStatus(manifestPath: string): DesignControlStatusResult {
  let manifest: SurfaceStatusManifest;
  try {
    manifest = loadSurfaceStatusManifest(manifestPath);
  } catch (error) {
    return {
      complete: false,
      nextAction: firstNextAction('malformed-manifest'),
      findings: [finding('malformed-manifest', error instanceof Error ? error.message : String(error))],
    };
  }

  const findings: DesignControlStatusFinding[] = [];
  const wireframePath = resolveAgainstManifest(manifestPath, manifest.wireframe.path);
  let wireframeArtifactOk = false;
  if (!existsSync(wireframePath)) {
    findings.push(
      finding(
        'missing-wireframe',
        `Accepted wireframe artifact missing at ${wireframePath}. Status cannot call the surface complete without it.`,
      ),
    );
  } else {
    const wireframeHash = checkFileHash(wireframePath, manifest.wireframe.sha256);
    if (!wireframeHash.ok) {
      findings.push(
        finding(
          'missing-wireframe',
          `Accepted wireframe at ${wireframePath} could not be read: ${wireframeHash.error}`,
        ),
      );
    } else if (!wireframeHash.matches) {
      findings.push(
        finding(
          'missing-wireframe',
          `Accepted wireframe at ${wireframePath} no longer matches the manifest sha256; refresh the artifact or manifest.`,
        ),
      );
    } else {
      wireframeArtifactOk = true;
    }
  }

  const specPath = resolveAgainstManifest(manifestPath, manifest.designSpec.path);
  const specHash = existsSync(specPath) ? checkFileHash(specPath, manifest.designSpec.sha256) : null;
  let specResult: ReturnType<typeof checkDesignSpecFile> | null = null;
  if (!existsSync(specPath)) {
    findings.push(
      finding(
        'missing-design-spec',
        `Design-language spec missing at ${specPath}. Status cannot call the surface complete without it.`,
      ),
    );
  } else if (specHash && !specHash.ok) {
    findings.push(
      finding(
        'missing-design-spec',
        `Design-language spec at ${specPath} could not be read: ${specHash.error}`,
      ),
    );
  } else if (specHash && !specHash.matches) {
    findings.push(
      finding(
        'missing-design-spec',
        `Design-language spec at ${specPath} no longer matches the manifest sha256; refresh the artifact or manifest.`,
      ),
    );
  } else {
    try {
      specResult = checkDesignSpecFile(specPath);
    } catch (error) {
      findings.push(
        finding(
          'invalid-design-spec',
          `Design-language spec at ${specPath} could not be analyzed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
  if (specResult) {
    for (const specFinding of specResult.findings) {
      if (specFinding.rule === 'dead-link-file' || specFinding.rule === 'dead-link-selector') {
        findings.push(
          finding(
            'dead-link-spec',
            `${specFinding.rule}${specFinding.ruleId ? ` (${specFinding.ruleId})` : ''}: ${specFinding.message}`,
          ),
        );
      } else {
        findings.push(
          finding(
            'invalid-design-spec',
            `${specFinding.rule}${specFinding.ruleId ? ` (${specFinding.ruleId})` : ''}: ${specFinding.message}`,
          ),
        );
      }
    }
    for (const skipped of specResult.skipped) {
      findings.push(
        finding(
          'unchecked-link-spec',
          `rule "${skipped.ruleId}" has unchecked non-CSS link "${skipped.link.path} ${skipped.link.selector}"; status cannot call the surface complete without a validated author-written .css anchor.`,
        ),
      );
    }
  }

  const archivePath = resolveAgainstManifest(manifestPath, manifest.archive.path);
  try {
    const archive = loadArchiveEntry(archivePath);
    if (!archive.accepted) {
      findings.push(
        finding(
          'unaccepted-decision',
          `Archive entry ${archivePath} has no accepted wireframe decision for surface "${manifest.surfaceId}".`,
        ),
      );
    } else if (archive.surfaceId !== manifest.surfaceId) {
      findings.push(
        finding(
          'unaccepted-decision',
          `Archive entry ${archivePath} is for surface "${archive.surfaceId}", not manifest surface "${manifest.surfaceId}".`,
        ),
      );
    } else if (!archive.accepted.implementationCommit) {
      findings.push(
        finding(
          'unaccepted-decision',
          `Archive entry ${archivePath} has no accepted implementation commit for surface "${manifest.surfaceId}".`,
        ),
      );
    } else if (archive.accepted.implementationCommit !== manifest.implementationCommit) {
      findings.push(
        finding(
          'unaccepted-decision',
          `Archive entry ${archivePath} records implementation commit ${archive.accepted.implementationCommit}, which does not match manifest implementation commit ${manifest.implementationCommit}.`,
        ),
      );
    } else if (resolveAgainstManifest(manifestPath, archive.accepted.wireframePath) !== wireframePath) {
      findings.push(
        finding(
          'unaccepted-decision',
          `Archive entry ${archivePath} accepts wireframe ${archive.accepted.wireframePath}, which does not match manifest wireframe ${manifest.wireframe.path}.`,
        ),
      );
    }
  } catch (error) {
    findings.push(
      finding(
        'unaccepted-decision',
        `Archive entry at ${archivePath} could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  try {
    if (wireframeArtifactOk) {
      const provenance = loadProvenance(dirname(wireframePath), manifest.surfaceId);
      if (provenance.mode === 'derived') {
        const acceptance = checkDerivedAcceptance(
          dirname(wireframePath),
          manifest.surfaceId,
          readFileSync(wireframePath, 'utf8'),
        );
        if (!acceptance.ok) {
          findings.push(...acceptance.findings.map((item) => finding('derived-unedited', item.message)));
        }
      } else {
        verifyDrivingWireframe(dirname(wireframePath), manifest.surfaceId);
      }
    }
  } catch (error) {
    findings.push(
      finding(
        'missing-wireframe-provenance',
        error instanceof Error ? error.message : String(error),
      ),
    );
  }

  if (!manifest.staleSurface) {
    findings.push(
      finding(
        'stale-surface-unmapped',
        `No stale-surface mapping is present for surface "${manifest.surfaceId}". Add one or record an operator-approved descope before completion.`,
      ),
    );
  } else if (manifest.staleSurface.mode === 'mapped') {
    for (const source of manifest.staleSurface.sourceFiles) {
      const sourcePath = resolveAgainstManifest(manifestPath, source.path);
      if (!existsSync(sourcePath)) {
        findings.push(
          finding(
            'stale-surface',
            `Mapped source file missing at ${sourcePath}; the surface mapping is stale or incomplete.`,
          ),
        );
        continue;
      }
      const sourceHash = checkFileHash(sourcePath, source.sha256);
      if (!sourceHash.ok) {
        findings.push(
          finding(
            'stale-surface',
            `Mapped source ${sourcePath} could not be read: ${sourceHash.error}`,
          ),
        );
      } else if (!sourceHash.matches) {
        findings.push(
          finding(
            'stale-surface',
            `Mapped source ${sourcePath} drifted from the recorded sha256; review the surface before calling it complete.`,
          ),
        );
      }
    }
  }

  if (findings.length === 0) {
    return {
      complete: true,
      nextAction: 'Surface is complete for scaffold-mode status.',
      findings,
    };
  }
  return {
    complete: false,
    nextAction: firstNextAction(findings[0].rule),
    findings,
  };
}

const USAGE = 'usage: design-control-status <surface-manifest.json>';

export function runDesignControlStatus(argv: readonly string[], io: CliIo): number {
  if (argv.length !== 1) {
    io.err(USAGE);
    return 2;
  }
  const result = getSurfaceStatus(argv[0]);
  if (result.complete) {
    io.out(`${argv[0]}: complete — no blocking scaffold-mode findings`);
    return 0;
  }
  for (const item of result.findings) {
    io.err(`${item.rule}: ${item.message}`);
  }
  io.err(`next-action: ${result.nextAction}`);
  return 1;
}
