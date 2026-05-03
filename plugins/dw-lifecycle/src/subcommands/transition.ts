import { loadConfig } from '../config.js';
import { repoRoot } from '../repo.js';
import { transitionFeature } from '../transitions.js';
import { isStage, type Stage } from '../docs.js';
import { validateSlug, validateTargetVersion } from '../slug.js';

export async function transition(args: string[]): Promise<void> {
  let slug: string | undefined;
  let from: Stage | undefined;
  let to: Stage | undefined;
  let targetVersion: string | undefined;
  let fromTargetVersion: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--from') {
      const v = args[++i];
      if (!isStage(v)) throw new Error(`Invalid --from stage: ${v}`);
      from = v;
    } else if (a === '--to') {
      const v = args[++i];
      if (!isStage(v)) throw new Error(`Invalid --to stage: ${v}`);
      to = v;
    } else if (a === '--target') {
      targetVersion = args[++i];
    } else if (a === '--from-target') {
      fromTargetVersion = args[++i];
    } else if (!slug && !a.startsWith('--')) {
      slug = a;
    }
  }

  if (!slug || !from || !to) {
    throw new Error(
      'Usage: dw-lifecycle transition <slug> --from <stage> --to <stage> [--target <version>] [--from-target <version>]'
    );
  }

  validateSlug(slug);
  if (targetVersion) {
    validateTargetVersion(targetVersion);
  }
  if (fromTargetVersion) {
    validateTargetVersion(fromTargetVersion);
  }

  const root = repoRoot();
  const cfg = loadConfig(root);
  const target = targetVersion ?? cfg.docs.defaultTargetVersion;

  transitionFeature(cfg, root, slug, { from, to, targetVersion: target, fromTargetVersion });
  console.log(JSON.stringify({ slug, from, to, fromTargetVersion, targetVersion: target, ok: true }));
}
