---
slug: 026-capability-interface-mediation
targetVersion: ""
---

# Audit log — 026-capability-interface-mediation

## 2026-06-18 — audit-barrage lift (20260618T010756127Z-026-capability-interface-mediation-phase-1)

### AUDIT-20260618-01 — Audited file is untracked and not part of the named commit range

Finding-ID: AUDIT-20260618-01
Status: migrated-to-backlog TASK-156
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/__tests__/fixtures/capability-fixtures.ts (whole file) vs. audited commit range

The only commit subject in the audited range is `f68a6aa1 docs(session): compose 2026-06-18 026-spec-authoring narrative + correct quantitative` — a docs/session commit — yet the diff contents are a new TypeScript fixture. The session git-status shows `?? src/__tests__/fixtures/capability-fixtures.ts`, i.e. the file is untracked. So the barrage is reviewing a working-tree file that is *not* in the committed `HEAD~1..HEAD` range it claims to diff.

Blast-radius: none to the code itself; this is a provenance note for the operator triaging the barrage. The implication is that this fixture has not yet been committed, so whatever governance/CI runs against `HEAD` will not see it. Reasonable resolution: confirm T001's fixture is committed before it's treated as landed. No code change implied.

### AUDIT-20260618-02 — Fixture has no importers in this diff — unexercised until later tasks land

Finding-ID: AUDIT-20260618-02
Status: migrated-to-backlog TASK-157
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/capability-fixtures.ts:39 (`makeCapabilityFixture`), :13 (`FRONT_DOOR_STATE_REL`)

The fixture's header documents it as the anchor for "the marker, mediate-check, and front-door tests" (T008+), but none of those consumers exist in this diff. `makeCapabilityFixture`, `sessionMarkerPath`, `commitAll`, etc. are therefore currently dead — nothing imports or runs them, so a latent bug in the fixture (e.g. the git-helper or marker-path logic) would not surface until the dependent test tasks land.

Blast-radius: low and expected for a TDD-first T001 fixture-scaffold task — the fixture legitimately precedes its consumers. Flagging only so the operator knows this file is unverified-by-use at this point; the verification arrives when T008's marker tests import it. No fix needed beyond ensuring those consumers actually arrive (per AUDIT-BARRAGE-claude-01, ensure they're not silently dropped).

### AUDIT-20260618-03 — `git` helper swallows spawn-failure detail (`r.error`), yielding an unhelpful message when git is missing

Finding-ID: AUDIT-20260618-03
Status: migrated-to-backlog TASK-158
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/capability-fixtures.ts:55-59

```ts
const git = (args: readonly string[]): string => {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr ?? ''}`);
  return r.stdout ?? '';
};
```

When `spawnSync` fails to launch the binary entirely (e.g. `git` not on PATH → `ENOENT`), `r.status` is `null`, `r.stderr` is `null`/empty, and the actual cause lives in `r.error`. The guard `r.status !== 0` correctly throws (`null !== 0`), but the message becomes `git init -q failed:` with an empty tail — the operator sees no reason. Including `r.error?.message` (and the signal, if `r.signal` is set) in the thrown message would make a CI-environment git-absence failure self-explanatory.

Blast-radius: low — this is test-harness code in a controlled environment where git is normally present; the cost is only debugging time on the rare environment where git is missing or killed by signal. A one-line message improvement closes it.

### AUDIT-20260618-04 — `sessionMarkerPath` does not guard against path separators in `session`

Finding-ID: AUDIT-20260618-04
Status: migrated-to-backlog TASK-159
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/__tests__/fixtures/capability-fixtures.ts:73 (`sessionMarkerPath`)

`sessionMarkerPath: (session) => join(frontDoorDir, \`${session}.json\`)` interpolates the caller-supplied `session` directly into the path. A `session` value containing `..` or a separator would resolve outside `frontDoorDir`. This is test-fixture code fed controlled session identifiers, so it is not a real vulnerability — but if the front-door marker writer (T008) under test derives session IDs from anything operator-influenced, a test asserting against this helper would silently mirror the same unguarded join and could mask a traversal bug in the production writer rather than catch it.

Blast-radius: informational for the fixture itself (controlled input). Worth a one-line note so that when T008's real marker-path logic lands, its session-sanitization is tested against adversarial session IDs rather than assumed safe because the fixture helper accepted them.

---

Net assessment: substantially clean. I checked the import surface (all `node:` builtins; the `@/` convention doesn't apply), error handling (`read`/`git` fail loud as documented — no silent fallbacks or mock-data traps), the config seed (`version: 1`), path construction (`FRONT_DOOR_STATE_REL` ↔ `frontDoorDir` are consistent), and file size (86 lines, well under the cap). The four items above are all low/informational — provenance, TDD-ordering, and two hardening nits in test-only code — none blocking.
