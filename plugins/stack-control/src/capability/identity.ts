// 026 T006 (+ Phase-2 audit HIGH/MED hardening, rounds 1–2) — identity matching for
// the interceptor adapters (research D4). The Bash surface resolves the normalized
// argv[0] of EVERY simple command in a (possibly compound, possibly multi-line)
// command line; the Skill surface is exact-name membership. We look ONLY at argv[0]
// of each command, never arguments / paths / comments, so a backend name in those
// positions never triggers a false refusal (SC-003). Mirrors isWrappedSkill's
// precise-membership discipline.
//
// Covers the ordinary command forms: direct, compound (`;`/`&&`/`||`/`|`/newline),
// backslash-newline line continuations, leading shell reserved words (`if`/`while`/`!`/…),
// loop/case headers (`for X in …`), transparent wrappers (with flag-arity + `--` +
// positionals), subshell/group parens (incl. single-token `(backlog)`), and redirections.
// Lookup-only `command -v X` is correctly NOT an invocation (no false refusal, SC-003).
//
// Accepted limitation (FR-017 honest boundary; cross-model audit rounds): shell
// INDIRECTION hides the backend inside an argument/substitution string or a variable,
// unreachable by argv[0] inspection alone — `bash -c '<cmd>'` / `sh -c` / `zsh -c`,
// `eval <cmd>`, command substitution `$(...)`, backticks `` `...` ``, process substitution
// `<(...)` / `>(...)`, `env -S "<cmd>"`, variable-expanded command names (`X=backlog; $X …`),
// a backend named inside a function-definition BODY (`foo() { …; backlog; }`) or a `case`
// pattern body (`case x in *) backlog;; esac`), and stacked heredocs (`cat <<A <<B`). These
// are under-matched (the parser treats `$(...)`/backticks opaquely — quote-aware so a
// `)` inside a quote does not close early — and does not resolve a variable/eval'd name).
// The US3 graduate-gate backstop (bypassed work cannot graduate; FR-015) is the real
// guarantee for them. The interceptor is best-effort for indirection by design and covers
// the ordinary non-indirection command forms above. This limit set is explicitly NOT
// claimed complete against all of shell grammar — a new indirection form joins it (pinned
// by a test) rather than being chased into the parser (spec-audit-diminishing-returns).

import { findCapabilityByIdentity, type Capability, type CapabilityRegistry, type Surface } from './registry.js';

/** A transparent command prefix: its own flags/value-flags/positionals are consumed,
 *  then the wrapped executable follows (research D4 + audit claude-03 cheap wins). */
interface WrapperSpec {
  /** Short/long flags that consume a SEPARATE following token as their value. */
  readonly valueFlags: ReadonlySet<string>;
  /** Bare positional args the wrapper consumes before the command (e.g. timeout's duration). */
  readonly positionals: number;
  /** Flags that make this a LOOKUP, not an invocation (e.g. `command -v X`) → no match. */
  readonly lookupFlags?: ReadonlySet<string>;
}

// NOTE: `env -S "<cmd>"` is intentionally NOT a value-flag — its argument is a
// split-string command line (shell indirection, like `bash -c`), so it joins the
// OPAQUE under-match limit class (the backend inside it is unreachable by argv[0]).
const WRAPPERS: ReadonlyMap<string, WrapperSpec> = new Map<string, WrapperSpec>([
  ['env', { valueFlags: new Set(['-u', '-C', '-P']), positionals: 0 }],
  ['sudo', { valueFlags: new Set(['-u', '-g', '-p', '-C', '-U', '-r', '-t', '-h', '-R']), positionals: 0 }],
  ['nice', { valueFlags: new Set(['-n']), positionals: 0 }],
  ['timeout', { valueFlags: new Set(['-s', '-k', '--signal', '--kill-after']), positionals: 1 }],
  ['xargs', { valueFlags: new Set(['-I', '-n', '-P', '-s', '-L', '-d', '-E', '-a']), positionals: 0 }],
  ['stdbuf', { valueFlags: new Set(['-i', '-o', '-e']), positionals: 0 }],
  ['nohup', { valueFlags: new Set(), positionals: 0 }],
  ['setsid', { valueFlags: new Set(), positionals: 0 }],
  ['command', { valueFlags: new Set(), positionals: 0, lookupFlags: new Set(['-v', '-V']) }],
  ['exec', { valueFlags: new Set(), positionals: 0 }],
  ['builtin', { valueFlags: new Set(), positionals: 0 }],
  ['time', { valueFlags: new Set(), positionals: 0 }],
]);

/** Shell reserved words / control-flow keywords. The command-introducing ones (`if`,
 *  `while`, `!`, …) are skipped as transparent leading prefixes so `if backlog …` is
 *  still seen; the terminators (`fi`, `done`, …) are harmless to skip (never a backend). */
// COMMAND-INTRODUCING reserved words: a command follows, so they are transparent
// (skipped) — `if backlog …` / `! backlog …` still resolve `backlog`. NOTE: `function`
// is intentionally absent — `function backlog { … }` is a DEFINITION, not an invocation;
// left un-skipped, `function` becomes argv[0] (no false refusal). The POSIX form
// `backlog() { … }` already self-excludes (the `()` suffix makes the basename `backlog()`).
const COMMAND_INTRODUCING: ReadonlySet<string> = new Set([
  'if', 'then', 'elif', 'else', 'while', 'until', 'do', '!',
]);

// HEADER reserved words: the token that FOLLOWS them is a loop variable / case operand /
// terminator — DATA, not a command. So a segment led by one of these has no invocation to
// resolve (codex-02): `for backlog in *.md` must NOT refuse (backlog is the loop var). The
// real loop-body command lands in a later `;`-split segment after `do`/`)`, where the
// command-introducing `do` is skipped and the body's argv[0] IS checked.
const HEADER_WORDS: ReadonlySet<string> = new Set([
  'for', 'case', 'select', 'in', 'fi', 'done', 'esac', 'coproc',
]);

/** A leading shell redirection token (`>f`, `2>f`, `>>`, `<`, `2>&1`, …) — skipped
 *  (with its target) when seeking argv[0], so `>out backlog` resolves to `backlog`. */
const REDIRECTION = /^[0-9]*(&>>?|>>|<<<|<>|>&|<&|>|<)/;

/** A leading `VAR=VAL` shell assignment (precedes the command; not the command). */
function isAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/** The basename of a path-or-name token (the part after the last `/`). */
function basename(token: string): string {
  const slash = token.lastIndexOf('/');
  return slash >= 0 ? token.slice(slash + 1) : token;
}

/** Read a heredoc opener at `command[i]` (`i` points at the first `<`). Returns the
 *  delimiter word, the index just past the opener, and whether `<<-` (tab-stripping) was
 *  used, or null if it isn't a heredoc. */
function readHeredocOpener(
  command: string,
  i: number,
): { delim: string; next: number; stripTabs: boolean } | null {
  if (command[i] !== '<' || command[i + 1] !== '<') return null;
  let j = i + 2;
  if (command[j] === '<') return null; // `<<<` is a here-STRING, not a heredoc body
  let stripTabs = false;
  if (command[j] === '-') {
    stripTabs = true; // `<<-` ignores LEADING TABS on the delimiter line; plain `<<` does not
    j++;
  }
  while (command[j] === ' ' || command[j] === '\t') j++;
  let quote = '';
  if (command[j] === '"' || command[j] === "'") {
    quote = command[j]!;
    j++;
  }
  let delim = '';
  while (j < command.length) {
    const c = command[j]!;
    if (quote !== '') {
      if (c === quote) { j++; break; }
      delim += c;
      j++;
    } else if (!/[\s;|&<>()]/.test(c)) {
      // an unquoted heredoc delimiter is a full shell word (`END-1`, `EOF.txt`), ending
      // only at whitespace or a shell metacharacter (codex-03) — not just `\w`.
      delim += c;
      j++;
    } else break;
  }
  return delim.length > 0 ? { delim, next: j, stripTabs } : null;
}

/** Skip a heredoc body starting at `start` (just after the opener line's newline) until
 *  a line equal to `delim`. Leading tabs are stripped from the candidate line ONLY for a
 *  `<<-` opener (`stripTabs`); a plain `<<` requires an exact-column match (codex-01). */
function skipHeredocBody(command: string, start: number, delim: string, stripTabs: boolean): number {
  let i = start;
  while (i < command.length) {
    let lineEnd = command.indexOf('\n', i);
    if (lineEnd === -1) lineEnd = command.length;
    const raw = command.slice(i, lineEnd);
    const line = stripTabs ? raw.replace(/^\t+/, '') : raw;
    i = lineEnd + 1;
    if (line === delim) break;
  }
  return i;
}

/**
 * Parse a (possibly compound, possibly multi-line) command line into a list of SIMPLE
 * commands, each a token list. Quote-aware. Splits on unquoted `;` `|` `&` and
 * newlines (so `&&`, `||`, pipelines, lists, and script lines all separate). An
 * unquoted `#` at a word boundary comments to end-of-LINE (not end of parse). Command
 * substitution `$(...)` and backticks are consumed OPAQUELY into the enclosing token
 * (the backend inside them is under-matched — the documented indirection limit — but
 * separators around them never mis-split). A heredoc body (`<<WORD … WORD`) is data,
 * not commands, so it is skipped entirely (else a backend NAME in the body would be a
 * false refusal — claude-01). A backslash escapes the next char (`\`+newline joins lines).
 */
function parseCommands(command: string): string[][] {
  const commands: string[][] = [];
  let tokens: string[] = [];
  let cur = '';
  let started = false;
  let inSingle = false;
  let inDouble = false;
  let substDepth = 0; // `$( ... )` nesting depth (opaque)
  let substInSingle = false; // single-quote state INSIDE a `$( … )` body
  let substInDouble = false; // double-quote state INSIDE a `$( … )` body
  let inBacktick = false;
  let pendingHeredoc: string | null = null; // delimiter of an open heredoc on this line
  let pendingHeredocStrip = false; // whether the open heredoc is `<<-` (strip leading tabs)

  const flushTok = (): void => {
    if (started) {
      tokens.push(cur);
      cur = '';
      started = false;
    }
  };
  const flushCmd = (): void => {
    flushTok();
    if (tokens.length > 0) commands.push(tokens);
    tokens = [];
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;

    if (substDepth > 0) {
      // Opaque command-substitution body: accumulate literally, tracking ( ) nesting —
      // but a paren INSIDE a quote does not count (claude-03: `$(grep ')' f)`).
      cur += ch;
      started = true;
      if (substInSingle) {
        if (ch === "'") substInSingle = false;
      } else if (substInDouble) {
        if (ch === '"') substInDouble = false;
      } else if (ch === "'") {
        substInSingle = true;
      } else if (ch === '"') {
        substInDouble = true;
      } else if (ch === '(') {
        substDepth++;
      } else if (ch === ')') {
        substDepth--;
        if (substDepth === 0) {
          substInSingle = false;
          substInDouble = false;
        }
      }
      continue;
    }
    if (inBacktick) {
      cur += ch;
      started = true;
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      else cur += ch;
      started = true;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      else if (ch === '\\' && command[i + 1] === '\n') i++; // line continuation: drop both
      else if (ch === '\\' && i + 1 < command.length) cur += command[++i];
      else if (ch === '$' && command[i + 1] === '(') {
        cur += '$(';
        i++;
        substDepth = 1;
      } else if (ch === '`') {
        cur += '`';
        inBacktick = true;
      } else cur += ch;
      started = true;
      continue;
    }

    // Unquoted.
    if (ch === '<' && command[i + 1] === '<' && command[i + 2] === '<') {
      // here-STRING `<<< word` is a redirection, NOT a heredoc — accumulate the whole
      // operator so neither embedded `<<` re-triggers heredoc detection (claude-01).
      cur += '<<<';
      i += 2;
      started = true;
      continue;
    }
    if (ch === '<' && command[i + 1] === '<') {
      const opener = readHeredocOpener(command, i);
      if (opener !== null) {
        flushTok(); // the `<<DELIM` redirection token is not part of argv[0]
        pendingHeredoc = opener.delim;
        pendingHeredocStrip = opener.stripTabs;
        i = opener.next - 1;
        continue;
      }
    }
    if (ch === '$' && command[i + 1] === '(') {
      cur += '$(';
      i++;
      substDepth = 1;
      started = true;
      continue;
    }
    if (ch === '`') {
      cur += '`';
      inBacktick = true;
      started = true;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      started = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      started = true;
      continue;
    }
    if (ch === '\\' && command[i + 1] === '\n') {
      i++; // line continuation: the backslash + newline are removed (lines join)
      continue;
    }
    if (ch === '\\' && i + 1 < command.length) {
      cur += command[++i];
      started = true;
      continue;
    }
    if (ch === '#' && !started) {
      // Comment to end of LINE — skip its body; the newline (next iter) flushes the
      // command. Do NOT terminate the whole parse (a later line may invoke a backend).
      while (i + 1 < command.length && command[i + 1] !== '\n') i++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      flushTok();
      if (ch === '\n') {
        flushCmd();
        if (pendingHeredoc !== null) {
          i = skipHeredocBody(command, i + 1, pendingHeredoc, pendingHeredocStrip) - 1;
          pendingHeredoc = null;
          pendingHeredocStrip = false;
        }
      }
      continue;
    }
    if (ch === '&') {
      const prev = cur.length > 0 ? cur[cur.length - 1] : '';
      if (prev === '>' || prev === '<' || command[i + 1] === '>') {
        // part of a redirection operator (`>&`, `<&`, `&>`) — NOT a list separator,
        // so it must not fragment the redirection (`2>&1`) or promote its target.
        cur += ch;
        started = true;
        continue;
      }
      flushCmd(); // `&` background / `&&` list separator
      continue;
    }
    if (ch === ';' || ch === '|') {
      flushCmd();
      continue;
    }
    cur += ch;
    started = true;
  }
  flushCmd();
  return commands;
}

/** Resolve one simple command's normalized argv[0]: strip a leading subshell/group
 *  paren, skip leading assignments and transparent wrappers (with flag-arity, `--`
 *  end-of-options, and positionals), then basename the executable. */
function argv0OfTokens(tokens: readonly string[]): string | null {
  let i = 0;
  for (;;) {
    let tok = tokens[i];
    if (tok === undefined) return null;
    if (tok === '(' || tok === '{') {
      i++; // a bare subshell/group opener is transparent
      continue;
    }
    if (tok.startsWith('(') || tok.startsWith('{')) {
      // strip a subshell/group opener AND its matching trailing closer so a single-token
      // group `(backlog)` resolves to `backlog` (claude-01). `backlog()` (function def)
      // keeps its `(` and so still does NOT match (only the trailing `)` is stripped).
      tok = tok.replace(/^[({]+/, '').replace(/[)}]+$/, '');
    }
    if (tok === '') {
      i++;
      continue;
    }
    if (REDIRECTION.test(tok)) {
      const op = tok.match(REDIRECTION)![0];
      i++;
      if (tok === op) i++; // a BARE operator (`>`, `2>`) — its target is the next token
      continue;
    }
    if (HEADER_WORDS.has(tok)) {
      // `for`/`case`/`select`/`in`/terminators: the operand is DATA, not a command —
      // this segment has no invocation to resolve (the body lands in a later segment).
      return null;
    }
    if (COMMAND_INTRODUCING.has(tok)) {
      i++; // a command-introducing reserved word (`if`/`while`/`!`/…) — the command follows
      continue;
    }
    if (isAssignment(tok)) {
      i++;
      continue;
    }
    const spec = WRAPPERS.get(tok);
    if (spec !== undefined) {
      i++;
      while (tokens[i] !== undefined && tokens[i]!.startsWith('-')) {
        const flag = tokens[i]!;
        i++;
        if (flag === '--') break; // end of options; the next token is the command
        // A lookup flag (e.g. `command -v X`) means "does X exist", NOT an invocation.
        if (spec.lookupFlags?.has(flag) === true) return null;
        // A separate-value flag consumes the next token; an attached form
        // (`-oL`, `--kill-after=5`) carries its own value, so consume nothing.
        if (spec.valueFlags.has(flag) && !flag.includes('=')) i++;
      }
      for (let p = 0; p < spec.positionals && tokens[i] !== undefined; p++) i++;
      continue; // a wrapper may be followed by another wrapper (e.g. `sudo nice …`)
    }
    return basename(tok) || null;
  }
}

/**
 * The normalized argv[0] of the FIRST simple command, or `null` for an empty /
 * comment-only command. (Per-command primitive; `argv0sOf` covers compound lines.)
 */
export function normalizeArgv0(command: string): string | null {
  return argv0OfTokens(parseCommands(command)[0] ?? []);
}

/** The normalized argv[0] of EVERY simple command in a (compound/multi-line) command
 *  line, in order. A backend invoked in ANY position is therefore visible (HIGH-1). */
export function argv0sOf(command: string): string[] {
  const out: string[] = [];
  for (const cmd of parseCommands(command)) {
    const argv0 = argv0OfTokens(cmd);
    if (argv0 !== null) out.push(argv0);
  }
  return out;
}

/** Normalize a Skill-tool skill name (exact membership; just trims). */
export function normalizeSkillName(name: string): string {
  return name.trim();
}

/**
 * The capability that owns the raw intercepted identity on `surface`, or `null`
 * when it is not a fronted backend (→ permit). For `bash`, every simple command's
 * argv[0] is checked (compound commands cannot reach around — HIGH-1); for `skill`,
 * exact membership of the trimmed name. Defers to the registry's exact membership.
 */
export function matchCapability(
  registry: CapabilityRegistry,
  surface: Surface,
  raw: string,
): Capability | null {
  if (surface === 'skill') {
    return findCapabilityByIdentity(registry, 'skill', normalizeSkillName(raw));
  }
  for (const identity of argv0sOf(raw)) {
    const cap = findCapabilityByIdentity(registry, 'bash', identity);
    if (cap !== null) return cap;
  }
  return null;
}
