// 026 T005 — RED tests for identity matching (research D4). The Bash surface
// normalizes argv[0] (basename, strip env/sudo wrappers + leading assignments);
// the Skill surface is exact-name membership. The SC-003 false-positive collision
// set (a backend name in a path / arg / comment) must NOT match — we only ever
// look at argv[0], never the rest of the command line.

import { describe, expect, it } from 'vitest';
import {
  argv0sOf,
  matchCapability,
  normalizeArgv0,
  normalizeSkillName,
} from '../../capability/identity.js';
import { CAPABILITY_REGISTRY } from '../../capability/registry.js';

describe('normalizeArgv0 (026 T005)', () => {
  it('returns the bare executable for a direct invocation', () => {
    expect(normalizeArgv0('backlog list')).toBe('backlog');
  });

  it('basenames an absolute path', () => {
    expect(normalizeArgv0('/usr/local/bin/backlog capture x')).toBe('backlog');
    expect(normalizeArgv0('./bin/backlog')).toBe('backlog');
  });

  it('strips an env wrapper and its VAR=VAL assignments', () => {
    expect(normalizeArgv0('env FOO=bar backlog list')).toBe('backlog');
    expect(normalizeArgv0('env backlog')).toBe('backlog');
  });

  it('strips a sudo wrapper', () => {
    expect(normalizeArgv0('sudo backlog')).toBe('backlog');
  });

  it('strips leading inline VAR=VAL assignments (no env wrapper)', () => {
    expect(normalizeArgv0('FOO=bar BAZ=qux backlog list')).toBe('backlog');
  });

  it('strips surrounding quotes on argv[0]', () => {
    expect(normalizeArgv0('"backlog" list')).toBe('backlog');
    expect(normalizeArgv0("'backlog'")).toBe('backlog');
  });

  it('returns null for an empty or comment-only command', () => {
    expect(normalizeArgv0('   ')).toBeNull();
    expect(normalizeArgv0('# backlog later')).toBeNull();
    expect(normalizeArgv0('')).toBeNull();
  });

  // SC-003: the backend name appears in a path / arg / comment but is NOT argv[0].
  it('does NOT treat a backend name in an argument position as argv[0]', () => {
    expect(normalizeArgv0('cat backlog.md')).toBe('cat');
    expect(normalizeArgv0('grep backlog file.txt')).toBe('grep');
    expect(normalizeArgv0('echo "run backlog later"')).toBe('echo');
    expect(normalizeArgv0('ls /opt/backlog/bin')).toBe('ls');
  });
});

describe('normalizeSkillName (026 T005)', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeSkillName('  speckit-implement  ')).toBe('speckit-implement');
  });
  it('leaves a clean name unchanged', () => {
    expect(normalizeSkillName('speckit-implement')).toBe('speckit-implement');
  });
});

describe('matchCapability — identity normalization → registry membership (026 T005)', () => {
  const reg = CAPABILITY_REGISTRY;

  it('matches a fronted CLI by normalized argv[0]', () => {
    expect(matchCapability(reg, 'bash', 'backlog list')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', '/usr/bin/backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'env X=1 backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'sudo backlog')?.id).toBe('backlog');
  });

  it('does NOT match the SC-003 false-positive collision set', () => {
    expect(matchCapability(reg, 'bash', 'cat backlog.md')).toBeNull();
    expect(matchCapability(reg, 'bash', 'echo "backlog"')).toBeNull();
    expect(matchCapability(reg, 'bash', 'grep backlog f')).toBeNull();
    expect(matchCapability(reg, 'bash', '# backlog')).toBeNull();
  });

  it('matches a fronted skill by exact name (after trim)', () => {
    expect(matchCapability(reg, 'skill', 'speckit-implement')?.id).toBe('spec-execution');
    expect(matchCapability(reg, 'skill', '  speckit-specify ')?.id).toBe('spec-definition');
  });

  it('does NOT match a near-miss skill name (no substring/prefix match)', () => {
    expect(matchCapability(reg, 'skill', 'speckit-implementx')).toBeNull();
    expect(matchCapability(reg, 'skill', 'speckit')).toBeNull();
  });

  it('does NOT cross surfaces (a cli identity is not a skill identity)', () => {
    expect(matchCapability(reg, 'skill', 'backlog')).toBeNull();
    expect(matchCapability(reg, 'bash', 'speckit-implement')).toBeNull();
  });
});

// AUDIT-BARRAGE-codex-01 / claude-01 (HIGH): a backend invoked in a NON-leading
// position of a compound command must still be matched — checking only the first
// simple command is a mediation bypass reachable with ordinary shell syntax.
describe('compound commands — every simple command is checked (026 P2 audit HIGH-1)', () => {
  const reg = CAPABILITY_REGISTRY;

  it('matches a backend after &&, ;, or | (not just the first command)', () => {
    expect(matchCapability(reg, 'bash', 'true && backlog list')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'git status; backlog capture y')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'echo hi | backlog add')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', ': && backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'cd repo || backlog list')?.id).toBe('backlog');
  });

  it('still matches a backend in the LEADING position', () => {
    expect(matchCapability(reg, 'bash', 'backlog list && echo done')?.id).toBe('backlog');
  });

  it('preserves SC-003: a separator INSIDE quotes does NOT split (no false positive)', () => {
    expect(matchCapability(reg, 'bash', 'echo "a && backlog"')).toBeNull();
    expect(matchCapability(reg, 'bash', "echo 'x; backlog'")).toBeNull();
  });

  it('argv0sOf returns every simple command’s normalized argv[0]', () => {
    expect(argv0sOf('true && backlog list')).toEqual(['true', 'backlog']);
    expect(argv0sOf('a; b | c')).toEqual(['a', 'b', 'c']);
    expect(argv0sOf('echo "a && b"')).toEqual(['echo']);
  });
});

// AUDIT-BARRAGE-codex-02 / claude-02 (HIGH): a wrapper option that takes a SEPARATE
// value must not be mistaken for the executable — `sudo -u root backlog` resolves to
// `root` without arity awareness, bypassing mediation.
describe('wrapper option-arguments — value flags do not hide the executable (026 P2 audit HIGH-2)', () => {
  const reg = CAPABILITY_REGISTRY;

  it('handles sudo/nice/env value-flags', () => {
    expect(matchCapability(reg, 'bash', 'sudo -u root backlog list')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'nice -n 10 backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'env -u PATH backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'env -C /tmp backlog')?.id).toBe('backlog');
  });

  it('handles attached-value flags (-oL) and chained wrappers', () => {
    expect(matchCapability(reg, 'bash', 'stdbuf -oL backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'sudo nice -n 5 backlog')?.id).toBe('backlog');
  });
});

// AUDIT-BARRAGE-claude-03 (MEDIUM): extend the transparent-wrapper set for the cheap
// wins; the structurally-unsolvable shell-indirection forms remain an accepted v1
// limitation backed by the US3 graduate-gate backstop (FR-015/FR-017) — asserted here
// so the gap is VISIBLE-by-test, not silently locked in.
describe('transparent wrappers — cheap wins covered; indirection is a documented limit (026 P2 audit MED)', () => {
  const reg = CAPABILITY_REGISTRY;

  it('covers nohup / timeout / setsid / xargs / command', () => {
    expect(matchCapability(reg, 'bash', 'nohup backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'timeout 30 backlog list')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'setsid backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'xargs backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'command backlog')?.id).toBe('backlog');
  });

  it('does NOT resolve through shell indirection (accepted v1 limit; US3 backstop covers)', () => {
    // bash -c '<cmd>' and command substitution put the backend inside an argument
    // string — unreachable by argv[0] inspection alone (claude-03). The US3 backstop
    // (bypassed work cannot graduate) is the real guarantee for these.
    expect(matchCapability(reg, 'bash', "bash -c 'backlog list'")).toBeNull();
    expect(matchCapability(reg, 'bash', 'foo $(backlog z)')).toBeNull();
  });
});

// Phase-2 audit ROUND 2: parser-robustness findings from the fixes themselves
// (fix-induced surface growth). The genuine common-case bugs are fixed; shell
// INDIRECTION ($()/backticks) is made a CONSISTENT, documented under-match class.
describe('parser robustness — convergence round 2 (026 P2 audit R2)', () => {
  const reg = CAPABILITY_REGISTRY;

  // claude-01 (HIGH): a `#` comment must end only its LINE, not the whole parse.
  it('a leading comment line does not hide a later command', () => {
    expect(argv0sOf('# run the thing\nbacklog list')).toEqual(['backlog']);
    expect(matchCapability(reg, 'bash', '# comment\nbacklog list')?.id).toBe('backlog');
  });

  it('a multi-line script checks every line; a trailing comment is stripped', () => {
    expect(argv0sOf('echo a\nbacklog list\necho b')).toEqual(['echo', 'backlog', 'echo']);
    expect(argv0sOf('backlog list # inline comment')).toEqual(['backlog']);
  });

  // claude-02 (MED): a leading subshell/group paren must not swallow the executable.
  it('strips a leading subshell/group paren', () => {
    expect(matchCapability(reg, 'bash', '(backlog list)')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', '{ backlog list; }')?.id).toBe('backlog');
  });

  // codex-01 (HIGH): `--` ends a wrapper's option list; the next token is the command.
  it('handles -- end-of-options in a wrapper', () => {
    expect(matchCapability(reg, 'bash', 'env -- backlog')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'sudo -- backlog list')?.id).toBe('backlog');
  });

  // codex-02 (HIGH): command substitution is OPAQUE — under-matched (documented limit
  // + US3 backstop), and crucially it does NOT mis-tokenize separators around it.
  it('treats command substitution opaquely without mis-splitting around it', () => {
    expect(matchCapability(reg, 'bash', 'echo $(backlog z)')).toBeNull();
    expect(matchCapability(reg, 'bash', 'true && echo $(backlog z)')).toBeNull();
    expect(matchCapability(reg, 'bash', 'echo `backlog`')).toBeNull();
    // a real backend OUTSIDE the substitution on the same line is still caught:
    expect(matchCapability(reg, 'bash', 'echo $(date) && backlog list')?.id).toBe('backlog');
  });
});

// Phase-2 audit ROUND 3: the remaining COMMON-case shell forms are fixed; the
// exotic shell-indirection forms are pinned as the bounded, tested FR-017 limit
// class (backed by the US3 backstop) so the parser's contract is complete + stable.
describe('parser robustness — convergence round 3 (026 P2 audit R3)', () => {
  const reg = CAPABILITY_REGISTRY;

  // claude-01 (HIGH): `\`+newline is a line continuation (both removed), not a literal.
  it('does not let a backslash-newline line continuation hide the backend', () => {
    expect(matchCapability(reg, 'bash', 'cd /repo && \\\nbacklog capture "x"')?.id).toBe('backlog');
    expect(argv0sOf('x && \\\nbacklog list')).toEqual(['x', 'backlog']);
  });

  // codex-01 (HIGH): a leading shell reserved word is transparent (the command follows).
  it('sees a backend after a leading shell reserved word', () => {
    expect(matchCapability(reg, 'bash', 'if backlog list; then echo ok; fi')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', '! backlog list')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', 'while backlog poll; do :; done')?.id).toBe('backlog');
  });

  // claude-02 (MED, SC-003): `command -v`/`-V` is a lookup, NOT an invocation.
  it('does not falsely refuse a lookup-only `command -v`/`-V`', () => {
    expect(matchCapability(reg, 'bash', 'command -v backlog')).toBeNull();
    expect(matchCapability(reg, 'bash', 'command -V backlog')).toBeNull();
    // but `command backlog` (run, bypassing functions/aliases) still matches:
    expect(matchCapability(reg, 'bash', 'command backlog list')?.id).toBe('backlog');
  });

  // claude-03 (LOW) + codex-02 (MED): process substitution and `env -S` join the OPAQUE
  // indirection limit (under-matched; US3 backstop) — pinned so the limit set is complete.
  it('treats process substitution and `env -S` split-strings as opaque indirection', () => {
    expect(matchCapability(reg, 'bash', 'diff <(backlog x) file')).toBeNull();
    expect(matchCapability(reg, 'bash', 'env -S "backlog list"')).toBeNull();
  });
});

// Phase-2 audit ROUND 4: the two remaining FALSE-REFUSAL (over-match) forms are the
// worst direction — over-matching has no backstop and blocks legitimate work — plus a
// bounded leading-redirection under-match. All ordinary shell forms are now covered.
describe('parser robustness — convergence round 4 (026 P2 audit R4)', () => {
  const reg = CAPABILITY_REGISTRY;

  // claude-01 (HIGH, over-match): a heredoc BODY is data, not commands.
  it('does not refuse a backend name inside a heredoc body', () => {
    expect(matchCapability(reg, 'bash', 'cat <<EOF > notes.md\nbacklog list is the old way\nEOF')).toBeNull();
    expect(argv0sOf('cat <<EOF\nbacklog list\nEOF\necho done')).toEqual(['cat', 'echo']);
    expect(matchCapability(reg, 'bash', "cat <<-'END'\n\tbacklog x\n\tEND")).toBeNull();
  });

  // codex-02 (MED, over-match): a function DEFINITION named like a backend is not an invocation.
  it('does not refuse a function definition named like a backend', () => {
    expect(matchCapability(reg, 'bash', 'function backlog { :; }')).toBeNull();
    expect(matchCapability(reg, 'bash', 'backlog() { echo hi; }')).toBeNull();
  });

  // codex-01 (HIGH, under-match): leading redirections precede the real command.
  it('sees a backend after leading redirections', () => {
    expect(matchCapability(reg, 'bash', '>out backlog list')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', '> out backlog list')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', '2>/tmp/err backlog capture x')?.id).toBe('backlog');
  });
});

// Phase-2 audit ROUND 5: `&`-adjacent redirection (both failure directions), loop/case
// header operands (false refusal), full-word heredoc delimiters, and the eval/sh -c
// indirection forms. After this the false-refusal classes are enumerated and closed.
describe('parser robustness — convergence round 5 (026 P2 audit R5)', () => {
  const reg = CAPABILITY_REGISTRY;

  // codex-01/claude-01: `&` in a redirection operator is NOT a list separator.
  it('does not let `&`-adjacent redirections cause under- or over-match', () => {
    // under-match direction: `2>&1 backlog` must still resolve backlog
    expect(matchCapability(reg, 'bash', '2>&1 backlog list')?.id).toBe('backlog');
    // over-match direction: a redirection TARGET named like a backend is not an invocation
    expect(matchCapability(reg, 'bash', 'mycmd >& backlog')).toBeNull();
    expect(matchCapability(reg, 'bash', 'mycmd >&backlog')).toBeNull();
    // a genuine background `&` / `&&` still separates and is still scanned
    expect(matchCapability(reg, 'bash', 'sleep 1 & backlog list')?.id).toBe('backlog');
  });

  // codex-02 (over-match): `for NAME in …` / `case WORD in` — the operand is a variable.
  it('does not refuse a loop/case header whose operand is named like a backend', () => {
    expect(matchCapability(reg, 'bash', 'for backlog in *.md; do echo "$backlog"; done')).toBeNull();
    expect(matchCapability(reg, 'bash', 'case backlog in *) echo x;; esac')).toBeNull();
    // but the loop BODY still catches a real invocation:
    expect(matchCapability(reg, 'bash', 'for f in *.md; do backlog list; done')?.id).toBe('backlog');
  });

  // codex-03 (over-consume): a non-word heredoc delimiter must terminate correctly.
  it('terminates a heredoc with a non-word delimiter and still scans later commands', () => {
    expect(argv0sOf('cat <<END-1\nbody text\nEND-1\nbacklog list')).toEqual(['cat', 'backlog']);
  });

  // claude-02 (LOW): eval / sh -c / zsh -c join the documented OPAQUE indirection limit.
  it('treats eval and sh -c / zsh -c as opaque indirection (under-matched; US3 backstop)', () => {
    expect(matchCapability(reg, 'bash', 'eval backlog list')).toBeNull();
    expect(matchCapability(reg, 'bash', "sh -c 'backlog list'")).toBeNull();
    expect(matchCapability(reg, 'bash', "zsh -c 'backlog list'")).toBeNull();
  });
});

// Phase-2 audit ROUND 6: heredoc tab-strip is `<<-`-only (over-match fix), single-token
// subshell `(backlog)` (under-match fix), quote-aware `$()` depth, and variable expansion
// pinned as a documented under-match. (Function-DEFINITION-body over-match is a recorded
// residual — see TASK below; the def NAME forms are covered above in round 4.)
describe('parser robustness — convergence round 6 (026 P2 audit R6)', () => {
  const reg = CAPABILITY_REGISTRY;

  // codex-01 (over-match): a plain `<<` requires an exact-column delimiter; a tab-indented
  // delimiter-looking body line must NOT terminate it early (only `<<-` strips tabs).
  it('does not terminate a plain heredoc early on a tab-indented delimiter line', () => {
    expect(matchCapability(reg, 'bash', 'cat <<END\n\tEND\nbacklog list\nEND')).toBeNull();
    // `<<-` DOES strip tabs, so a tab-indented delimiter terminates it:
    expect(argv0sOf('cat <<-END\n\tbody\n\tEND\nbacklog list')).toEqual(['cat', 'backlog']);
  });

  // claude-01 (under-match): a single-token subshell `(backlog)` resolves to backlog.
  it('resolves a single-token subshell invocation', () => {
    expect(matchCapability(reg, 'bash', '(backlog)')?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', '(backlog capture x)')?.id).toBe('backlog');
    // `backlog()` is a function DEFINITION, not an invocation → still null:
    expect(matchCapability(reg, 'bash', 'backlog() { :; }')).toBeNull();
  });

  // claude-03 (LOW): a `)` inside a quote within `$( … )` does not close it early.
  it('keeps command substitution opaque even with a quoted close-paren inside', () => {
    expect(matchCapability(reg, 'bash', "echo $(grep ')' f) && backlog list")?.id).toBe('backlog');
    expect(matchCapability(reg, 'bash', "echo $(grep ')' f)")).toBeNull();
  });

  // claude-02 (LOW): variable-expanded command names are an OPAQUE under-match (US3 backstop).
  it('does not resolve a variable-expanded command name (documented under-match)', () => {
    expect(matchCapability(reg, 'bash', 'BL=backlog; $BL list')).toBeNull();
    expect(matchCapability(reg, 'bash', 'X=backlog ${X} capture y')).toBeNull();
  });

  // claude-01 (HIGH, round 7): `<<<` is a here-STRING, not a heredoc — it must not swallow
  // the rest of a multi-line script (which would hide a real later backend invocation).
  it('treats `<<<` as a here-string and still scans later commands', () => {
    expect(argv0sOf('cat <<< x\nbacklog list')).toEqual(['cat', 'backlog']);
    expect(matchCapability(reg, 'bash', 'read v <<< data\nbacklog capture y')?.id).toBe('backlog');
  });
});
