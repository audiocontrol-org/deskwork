/**
 * deskwork customize — copy a plugin-default file into the project's
 * `.deskwork/<category>/<name>.ts` so the operator can edit it.
 *
 * Phase 23f. Categories:
 *   - templates  → copies `packages/studio/src/pages/<name>.ts`
 *   - doctor     → copies `packages/core/src/doctor/rules/<name>.ts`
 *   - prompts    → reserved (no default-source mapping yet)
 *
 * Usage (after the dispatcher injects projectRoot):
 *   deskwork customize <project-root> <category> <name>
 *
 * The command:
 *   1. Resolves the plugin-default source file via `import.meta.resolve`
 *      against the published package paths so it works in both
 *      workspace dev and marketplace install.
 *   2. Copies the source verbatim into
 *      `<projectRoot>/.deskwork/<category>/<name>.ts`, creating the
 *      directory tree as needed.
 *   3. Refuses if the destination file already exists — clobbering an
 *      operator's edits would be a bug-factory.
 *   4. Prints the destination path so the operator can edit.
 *
 * Errors:
 *   - Unknown category → exit 2 with the list of valid categories.
 *   - `prompts` for now → exit 2 with a "reserved for future use" note.
 *   - Plugin-default not found → exit 1 with the list of names that DO
 *     have defaults (best-effort).
 *   - Destination file already exists → exit 1, refuse to overwrite.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from '@deskwork/core/cli-args';

const VALID_CATEGORIES = ['templates', 'prompts', 'doctor'] as const;
type Category = (typeof VALID_CATEGORIES)[number];

function isCategory(value: string): value is Category {
  return (VALID_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Resolve a node module path via `import.meta.resolve`. Returns the
 * absolute file path the package's exports map points at, regardless
 * of whether we're running from the workspace tree or from a
 * marketplace-installed copy.
 *
 * Throws when the package can't be resolved at all (CLI installed in a
 * broken state). The caller surfaces the error to the operator.
 */
function resolvePackageFile(specifier: string): string {
  try {
    const url = import.meta.resolve(specifier);
    return fileURLToPath(url);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `cannot resolve ${specifier} (broken install?): ${reason}`,
    );
  }
}

/**
 * Resolve a package's root directory by anchoring on its `package.json`
 * subpath export. Both `@deskwork/core` and `@deskwork/studio` expose
 * `./package.json` implicitly through Node's package-exports machinery
 * (or via a dedicated entry — see each package's exports map).
 *
 * Returns the absolute directory containing the package.json. From there,
 * the customize anchor walks into `src/<...>` for the requested file.
 */
function resolvePackageRoot(packageName: string): string {
  const pkgJsonPath = resolvePackageFile(`${packageName}/package.json`);
  return dirname(pkgJsonPath);
}

/**
 * Find the source-of-truth file for a customize request. Returns an
 * absolute path or throws. The mapping per category:
 *
 *   templates → @deskwork/studio package root, then src/pages/<name>.ts.
 *   doctor    → @deskwork/core package root, then src/doctor/rules/<name>.ts.
 *   prompts   → throws (reserved).
 *
 * Note: this assumes the published package ships its `src/` tree.
 * Phase 26b's `files: ["dist", ...]` whitelist drops `src/`, so the
 * customize command currently works only against workspace-symlinked
 * packages (the dev path). A follow-up issue tracks shipping the
 * customize sources alongside dist or vendoring template snapshots.
 */
function resolveDefaultSource(category: Category, name: string): string {
  if (category === 'prompts') {
    throw new Error(
      'category "prompts" is reserved for future use — no default sources to copy yet',
    );
  }
  if (category === 'templates') {
    const studioRoot = resolvePackageRoot('@deskwork/studio');
    const candidate = resolve(studioRoot, 'src', 'pages', `${name}.ts`);
    if (!existsSync(candidate)) {
      throw new Error(
        `no built-in template named "${name}". Available templates: ${listAvailable(
          dirname(candidate),
        )}`,
      );
    }
    return candidate;
  }
  // doctor
  const coreRoot = resolvePackageRoot('@deskwork/core');
  const candidate = resolve(coreRoot, 'src', 'doctor', 'rules', `${name}.ts`);
  if (!existsSync(candidate)) {
    throw new Error(
      `no built-in doctor rule named "${name}". Available rules: ${listAvailable(
        dirname(candidate),
      )}`,
    );
  }
  return candidate;
}

/**
 * Best-effort listing of the available basenames in a directory. Used
 * to enrich error messages when the operator passes a name that
 * doesn't match a built-in default.
 */
function listAvailable(dir: string): string {
  if (!existsSync(dir)) return '(none — broken install)';
  const entries = readdirSync(dir)
    .filter((n) => n.endsWith('.ts'))
    .map((n) => n.slice(0, -'.ts'.length))
    .sort();
  return entries.join(', ');
}

/**
 * Add `@deskwork/studio/server.ts` resolution support. The studio
 * package's `package.json` lists `bin: { "deskwork-studio": "./src/server.ts" }`
 * but no top-level `exports.server.ts`. We work around that by
 * resolving the package root through `package.json#main` if available;
 * here we cheat and use the studio's own `import.meta` from the
 * compiled bundle. To keep this implementation simple, we resolve via
 * the studio package's `package.json` root and then join the source
 * tree path.
 *
 * (This doc-comment reserves the explanation; the actual logic above
 * uses `@deskwork/studio/server.ts`. Studio's package.json must list
 * an exports entry for that subpath. If it doesn't yet, resolveDefaultSource
 * will throw a clear error and the test will catch the omission.)
 */

export async function run(argv: string[]): Promise<void> {
  // Argv shape after dispatcher inject:
  //   [<project-root>, <category>, <name>]
  if (argv.length !== 3) {
    fail(
      'Usage: deskwork customize <project-root> <category> <name>\n' +
        `  category: ${VALID_CATEGORIES.join(' | ')}`,
      2,
    );
  }
  const [projectRootArg, categoryArg, name] = argv;
  if (!isCategory(categoryArg)) {
    fail(
      `unknown category "${categoryArg}". Valid: ${VALID_CATEGORIES.join(', ')}`,
      2,
    );
  }
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) {
    fail(
      `name "${name}" must be a plain basename (no slashes, no leading dots)`,
      2,
    );
  }

  const projectRoot = isAbsolute(projectRootArg)
    ? projectRootArg
    : resolve(process.cwd(), projectRootArg);

  if (!existsSync(projectRoot)) {
    fail(`project root does not exist: ${projectRoot}`, 1);
  }

  let source: string;
  try {
    source = resolveDefaultSource(categoryArg, name);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 1);
  }

  const destDir = join(projectRoot, '.deskwork', categoryArg);
  const destFile = join(destDir, `${name}.ts`);
  if (existsSync(destFile)) {
    fail(
      `destination already exists: ${destFile}\n` +
        '  Refusing to overwrite operator-edited overrides.\n' +
        '  Move or delete the existing file before re-running.',
      1,
    );
  }

  mkdirSync(destDir, { recursive: true });
  copyFileSync(source, destFile);

  process.stdout.write(`Customized ${categoryArg}/${name}\n`);
  process.stdout.write(`  source: ${source}\n`);
  process.stdout.write(`  dest:   ${destFile}\n`);
  process.stdout.write(
    '  Edit the destination file to customize behavior. The studio\n',
  );
  process.stdout.write(
    '  loads the override automatically on the next request.\n',
  );
}
