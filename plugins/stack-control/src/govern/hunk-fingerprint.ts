// Hunk-granularity, content-presence checkpoint fingerprinting (029 US7, FR-026/027/028,
// TASK-289).
//
// The per-phase checkpoint's freshness check runs WITHOUT knowing each phase's diff-base
// (so it cannot re-diff). Instead, at GOVERN-WRITE time — which DOES have the diff-base —
// we extract the phase's own changed line-blocks and store each block's content-hash +
// line-count. At FRESHNESS time we read the current governed files and check that every
// stored block still appears as CONSECUTIVE lines somewhere in the file (no git, no
// diff-base needed). A later edit to a DIFFERENT region leaves the blocks present → fresh;
// an edit that changes the phase's OWN lines makes a block absent → stale. This is robust
// to line-number shifts (blocks are matched by content, not position).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * One maximal run of consecutive ADDED (post-image) lines a phase introduced to a file.
 * `file` is an installation-relative path; `hash` is the sha256 of the block's lines
 * joined by '\n'; `lines` is the block's line count. The hash+count is enough to detect
 * the block's presence/absence in the file's current content WITHOUT a diff-base.
 */
export interface HunkBlock {
  readonly file: string;
  readonly hash: string;
  readonly lines: number;
}

function hashLines(lines: readonly string[]): string {
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * Parse a single file's unified `git diff` output into its maximal runs of consecutive
 * added (post-image) lines. A HUNK BLOCK is a maximal run of lines starting with `+`
 * (but NOT the `+++ ` file header), with the leading `+` stripped. Header/context/removed
 * lines and the `\ No newline at end of file` marker break (or are ignored within) a run.
 */
function parseAddedBlocks(file: string, diff: string): HunkBlock[] {
  const blocks: HunkBlock[] = [];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > 0) {
      blocks.push({ file, hash: hashLines(run), lines: run.length });
      run = [];
    }
  };
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++')) {
      // The post-image file header — NOT a content line. It also signals a fresh file
      // section; flush any run accumulated from a prior file in the same diff stream.
      flush();
      continue;
    }
    if (raw.startsWith('\\')) {
      // "\ No newline at end of file" — metadata, not content; does not break a run.
      continue;
    }
    if (raw.startsWith('+')) {
      run.push(raw.slice(1));
      continue;
    }
    // Any other line (context ' ', removed '-', hunk '@@', mode lines, blank EOF) ends
    // the current run of added lines.
    flush();
  }
  flush();
  return blocks;
}

/**
 * Extract every phase-owned hunk block across `files`, fingerprinted by post-image
 * content. For each file we run `git diff <diffBase> HEAD -- <file>` (committed state vs.
 * the phase's base — at govern-write time HEAD == the phase's tip, and govern writes the
 * checkpoint from committed state). A file with no diff yields no blocks; a binary file
 * (or any git failure) is skipped. Results are sorted deterministically (by file then
 * hash) so the stored fingerprint is stable.
 */
export function computePhaseHunkBlocks(
  installationRoot: string,
  files: readonly string[],
  diffBase: string,
): HunkBlock[] {
  const blocks: HunkBlock[] = [];
  for (const file of files) {
    let diff: string;
    try {
      // Files are installation-relative; cwd is installationRoot so we pass them as-is.
      diff = execFileSync('git', ['diff', diffBase, 'HEAD', '--', file], {
        cwd: installationRoot,
      }).toString('utf8');
    } catch {
      // No diff-base ref, binary file, or git unavailable → skip this file (graceful).
      continue;
    }
    if (diff.includes('Binary files') && !diff.includes('@@')) {
      // A pure binary-diff has no textual hunks to fingerprint.
      continue;
    }
    for (const block of parseAddedBlocks(file, diff)) {
      blocks.push(block);
    }
  }
  blocks.sort((a, b) => (a.file === b.file ? a.hash.localeCompare(b.hash) : a.file.localeCompare(b.file)));
  return blocks;
}

/**
 * Content-presence freshness for one stored block: does the block's `lines` consecutive
 * lines still appear, by content-hash, somewhere in the CURRENT content of its file? A
 * missing file → the block is absent → stale. Robust to line-number shifts (the window
 * slides over the whole file and matches on content, not position).
 */
function blockPresent(installationRoot: string, block: HunkBlock): boolean {
  const abs = join(installationRoot, block.file);
  if (!existsSync(abs)) {
    return false;
  }
  const content = readFileSync(abs, 'utf8');
  // Match the post-image lines exactly: a trailing newline produces a final '' element
  // that is not part of any added run, so a window over the real lines still hashes equal.
  const lines = content.split('\n');
  if (block.lines <= 0 || block.lines > lines.length) {
    return false;
  }
  for (let start = 0; start + block.lines <= lines.length; start++) {
    if (hashLines(lines.slice(start, start + block.lines)) === block.hash) {
      return true;
    }
  }
  return false;
}

/**
 * Content-presence freshness across a record's stored hunk blocks: fresh iff EVERY block
 * is still present in its file's current content. Callers gate this on `hunkBlocks` being
 * present and non-empty; an absent/empty set is the old-format path (see checkpoint-state).
 */
export function allHunkBlocksPresent(
  installationRoot: string,
  hunkBlocks: readonly HunkBlock[],
): boolean {
  return hunkBlocks.every((block) => blockPresent(installationRoot, block));
}
