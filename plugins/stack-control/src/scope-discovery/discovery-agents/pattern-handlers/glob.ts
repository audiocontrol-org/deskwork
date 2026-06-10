/**
 * plugins/stack-control/src/scope-discovery/discovery-agents/pattern-handlers/glob.ts
 *
 * Tiny in-process glob-to-regex compiler used by the new the orchestrator loop
 * handlers (negative-space, coverage, outlier, semantic). The pattern
 * catalog YAML carries glob strings (e.g.,
 * `modules/*-editor/src/**\/*Summary.tsx`); each handler needs a fast
 * predicate over repo-relative file paths.
 *
 * Design choice: we DON'T pull in `minimatch` or `micromatch`. The
 * handlers need a focused subset (POSIX-style paths from
 * `walkSourceFiles`, three patterns: `*`, `**`, and character literals)
 * and the dispatch frequency is per-handler-per-scan-fileset, not
 * per-line. A 40-line compile-once-test-many helper is the right cost.
 *
 * Supported:
 *   *      matches any run of non-`/` characters
 *   **     matches any run of any character (incl. `/`)
 *   ?      matches any single non-`/` character
 *   .      matches a literal `.` (regex escape applied)
 *   /      matches a literal `/` (path separator)
 *   other  matched literally
 *
 * Not supported: brace expansion, character classes, negation. Adopters
 * needing those write a project-specific override.
 */

/**
 * Compile a glob to a RegExp that matches a POSIX-style relative path
 * end-to-end (anchored).
 */
export function compileGlob(glob: string): RegExp {
  let out = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*') {
      const next = glob[i + 1];
      if (next === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch === '/') {
      out += '/';
    } else if (ch === '.') {
      out += '\\.';
    } else if (ch === '+' || ch === '(' || ch === ')' || ch === '|' || ch === '^' || ch === '$' || ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === '\\') {
      out += `\\${ch}`;
    } else if (ch !== undefined) {
      out += ch;
    }
  }
  out += '$';
  return new RegExp(out);
}

/** Predicate: does a file path match the glob? */
export function matchesGlob(filePath: string, glob: string): boolean {
  return compileGlob(glob).test(filePath);
}
