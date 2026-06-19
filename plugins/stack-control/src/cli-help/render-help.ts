// Generic help renderer (028 US1, T011; FR-001/002). Turns ANY CommandDescriptor
// into a usage body, so every verb's `--help` renders from the single descriptor
// source (command-surface.ts) rather than a per-verb hand-written string —
// generalizing the bespoke `roadmap-help.ts` layout to the whole surface.
//
// `roadmap-help.ts` keeps the roadmap-SPECIFIC vocabulary surfacing (the status
// vocabulary on `advance --to` / `add --status`); the STRUCTURE (usage line,
// sub-action list, flag table) comes from here.

import type { CommandDescriptor, FlagDescriptor, SubActionDescriptor } from './command-surface.js';

/** The left-column token for a flag: `-d, --depends-on <value>` / `--apply`. */
export function flagToken(flag: FlagDescriptor): string {
  const lead = flag.shortFlag ? `-${flag.shortFlag}, --${flag.name}` : `--${flag.name}`;
  return flag.arg ? `${lead} ${flag.arg}` : lead;
}

/** Render a left-aligned two-column table (token → description). */
function table(rows: readonly { left: string; right: string }[]): string[] {
  if (rows.length === 0) return [];
  const col = Math.max(...rows.map((r) => r.left.length));
  return rows.map((r) => `  ${r.left.padEnd(col)}  ${r.right}`.trimEnd());
}

/** Flags shared by EVERY sub-action of a multi-action verb (e.g. roadmap's
 * universal `--doc`), surfaced once at the verb level rather than repeated. */
function universalFlags(subActions: readonly SubActionDescriptor[]): readonly FlagDescriptor[] {
  if (subActions.length === 0) return [];
  const first = subActions[0];
  // Not dead code: under `noUncheckedIndexedAccess`, `subActions[0]` is typed
  // `... | undefined` and TS does not narrow index access from the length check
  // above — this guard is the compile-time-safe accessor (AUDIT-BARRAGE-claude-05).
  if (first === undefined) return [];
  return first.flags.filter((f) => subActions.every((s) => s.flags.some((g) => g.name === f.name)));
}

/** `stackctl <verb> --help`: the verb's description + (multi) its sub-actions +
 * universal flags, or (single) its flags. Renders from the descriptor alone. */
export function renderVerbHelp(descriptor: CommandDescriptor): string {
  const lines: string[] = [];
  const isMulti = descriptor.subActions.length > 0;
  // `[flags]` only when the verb actually accepts business-logic flags — a
  // single-action verb with none would otherwise advertise flags it has no
  // section for (AUDIT-BARRAGE-claude-04, Phase 2).
  const flagsToken = isMulti || descriptor.flags.length > 0 ? ' [flags]' : '';
  lines.push(
    isMulti
      ? `Usage: stackctl ${descriptor.verb} <subaction>${flagsToken}`
      : `Usage: stackctl ${descriptor.verb}${flagsToken}`,
  );
  lines.push('');
  lines.push(descriptor.description);
  if (descriptor.deprecatedAliasOf) {
    lines.push('');
    lines.push(`(deprecated alias of \`${descriptor.deprecatedAliasOf}\`)`);
  }
  lines.push('');
  if (isMulti) {
    lines.push('Subactions:');
    lines.push(
      ...table(descriptor.subActions.map((s) => ({ left: s.name, right: s.description }))),
    );
    const universal = universalFlags(descriptor.subActions);
    if (universal.length > 0) {
      lines.push('');
      lines.push('Universal flags (accepted on every subaction):');
      lines.push(...table(universal.map((f) => ({ left: flagToken(f), right: f.description }))));
    }
  } else if (descriptor.flags.length > 0) {
    lines.push('Flags:');
    lines.push(...table(descriptor.flags.map((f) => ({ left: flagToken(f), right: f.description }))));
  }
  lines.push('');
  return lines.join('\n');
}

/** `stackctl <verb> <sub> --help`: the sub-action usage line, description, and
 * flag table. Fails loud for an unknown sub-action (no empty body). */
export function renderSubActionHelp(descriptor: CommandDescriptor, subName: string): string {
  const sub = descriptor.subActions.find((s) => s.name === subName);
  if (sub === undefined) {
    throw new Error(
      `render-help: '${descriptor.verb}' has no sub-action '${subName}' (known: ${descriptor.subActions
        .map((s) => s.name)
        .join(', ')})`,
    );
  }
  const lines: string[] = [];
  const positionals = sub.positionals.length > 0 ? ` ${sub.positionals.join(' ')}` : '';
  lines.push(`Usage: stackctl ${descriptor.verb} ${sub.name}${positionals} [flags]`);
  lines.push('');
  lines.push(sub.description);
  lines.push('');
  if (sub.flags.length > 0) {
    lines.push('Flags:');
    lines.push(...table(sub.flags.map((f) => ({ left: flagToken(f), right: f.description }))));
    lines.push('');
  }
  return lines.join('\n');
}
