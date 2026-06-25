import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Hermetic git harness (TASK-116). Vitest setupFile: neutralizes the host's
 * GLOBAL and SYSTEM git config for the whole worker so every throwaway repo a
 * fixture creates is hermetic — no inherited `commit.gpgsign=true`, a
 * deterministic identity — regardless of the operator's machine or the CI
 * image. Fixtures that already set local config still work (local overrides
 * global); fixtures that forget identity now also work. New fixtures inherit
 * the property by default, so this is the root fix rather than a per-call-site
 * `git config commit.gpgsign false` sprinkled across each suite.
 *
 * `git` subprocesses spawned by fixtures inherit this process's environment, so
 * pointing GIT_CONFIG_GLOBAL / GIT_CONFIG_SYSTEM at the checked-in hermetic
 * config takes effect for every spawnSync('git', ...) call.
 */
const here = dirname(fileURLToPath(import.meta.url));
const hermetic = resolve(here, 'fixtures/hermetic.gitconfig');

process.env.GIT_CONFIG_GLOBAL = hermetic;
process.env.GIT_CONFIG_SYSTEM = hermetic;
