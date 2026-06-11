# Data Model — Installation Isolation (specs/installation-isolation)

No new persistent stores. The feature changes WHERE existing state lands and HOW anchors resolve; the entities below are the contract-relevant records and the invariants each story enforces.

## Installation (existing — 009 `resolveInstallation` / `resolveCodebaseBoundary`)

- Identity: the directory carrying `.stack-control/config.yaml`; resolution = nearest-enclosing walk-up from a start point.
- **US1 invariant**: every state-writing verb resolves exactly ONE `Installation` at entry and derives every `.stack-control/*` path from `installation.root`. No downstream function re-derives placement from a path string (R1 — closes the split-brain class).
- **US2 invariant**: unresolvable installation + a write-needing verb ⇒ uniform loud refusal naming the start point + `stackctl setup`. No fallback location exists.
- **US4 invariant**: cwd's only role is the default start point of the walk-up; explicit `--at <dir>` overrides the start point; identical placement from any cwd (SC-003).
- Nested installations: nearest wins; explicit `--at` naming an outer one is honored and announced.

## External anchors (derived facts — never parameters)

- **Git toplevel**: derived via the git marker (`rev-parse --show-toplevel`) from the installation root. Used ONLY for: the legacy half-installation probe (US5) and anchoring the cross-tree feature fold (US3). Diffing/folding is invoked `git -C <installation.root>` with relative output.
- **Spec Kit root**: derived via the nearest-`.specify` walk-up (upstream behavior). After US6, equals the installation root for this repo.
- **Invariant**: the retired `--repo-root` parameter exists on NO state-writing verb; a legacy invocation hits the existing unknown-flag usage error (exit 2).

## Feature anchor (existing — `resolveFeatureRoot`)

- The resolved feature artifact root (spec dir or grandfathered legacy docs dir); the designated write target for the feature's protocol artifacts (audit-log, lift, evidence, manifests).
- **US3/R4 invariant**: writes to the feature anchor are legitimate wherever it lives; when it lies OUTSIDE the installation subtree, the verb announces the cross-tree anchor once on stderr, and the governed payload folds the feature root in as a labeled second diff arm — a payload missing in-range feature artifacts is a loud failure, never silent.
- **US6 rule (this repo)**: the resolver looks under `<installation>/specs` first (exact slug + grandfathered `NNN-slug` names), legacy locations remain read-resolvable.

## Governed payload (existing — `assembleImplementPayload`)

- Composition: installation-subtree committed diff (relative paths) + installation-scoped untracked fold + labeled cross-tree feature arm (when applicable) + context blocks.
- **Invariants carried forward from audit-protocol-reliability**: self-reference exclusions (feature audit-log both arms; other feature roots; bookkeeping store) unchanged — now anchored on the installation record instead of caller strings.

## Legacy half-installation (new observable state class — US5)

- Definition: a `.stack-control/` directory WITHOUT `config.yaml`, sitting at the derived git toplevel when the toplevel ≠ the resolved installation root.
- States: `absent` (no notice — no cry-wolf) | `present` (three-part notice at the decision site: what was found and ignored, what is actually read/written, safe migration advice that never targets existing tuned files destructively).
- **Invariant**: never a write target; reads of legacy state during the transition window occur only behind the notice.

## Isolation probe (new test contract — FR-008/SC-001..003)

- Fixture: outer git repo ⊃ inner installation; snapshot = recursive (path, size, mtime) listing of the outer tree EXCLUDING the installation subtree.
- Verb table: the R2 retired-flag set + backlog capture/import + install-scope-discovery.
- Exemptions (exhaustive): OS tmpdirs; the resolved feature anchor; explicitly announced operator overrides.
- **Invariant**: snapshot before ≡ snapshot after, per verb, per story SC-001; the full governance loop satisfies SC-002; three-cwd invariance satisfies SC-003.
