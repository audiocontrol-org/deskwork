# Tooling Feedback


## session-end 2026-06-11
- govern.sh resolves the feature from the repo root only; a nested installation (plugins/design-control) needs --repo-root, and even then the backlog-store/slush resolution still resolves from cwd, not --repo-root (slush step exited 1 non-fatally: 'no stack-control installation found from <repo root>') — filed https://github.com/audiocontrol-org/deskwork/issues/460
- audit-barrage claude lane timed out at the plugin default 300s on a governed-diff payload (run 20260611T062218157Z fleet-floor refusal); nested installations do not inherit the repo-root audit-barrage-config override — had to seed .stack-control/audit-barrage-config.yaml per installation — filed https://github.com/audiocontrol-org/deskwork/issues/461
- stackctl govern folds untracked files into the audited diff with absolute a/Users/... path prefixes — filed https://github.com/audiocontrol-org/deskwork/issues/458
- stackctl govern audited diff includes .stack-control/audit-runs/** so each governance round recursively embeds prior rounds' PROMPT.md; payload compounds monotonically — filed https://github.com/audiocontrol-org/deskwork/issues/459

## session-end 2026-06-14
- govern dampener migrates non-HIGH findings to the backlog while they are being fixed in the same convergence loop, creating stale already-fixed tasks (TASK-30..35); backlog verb also has no done/close subaction. Filed: audiocontrol-org/deskwork#471
- stackctl roadmap has no advance/set-status subaction (only next|blocked|add); completed phases stay 'planned' and ROADMAP.md forbids hand-editing, so there is no sanctioned way to advance status. Filed: audiocontrol-org/deskwork#472
- speckit-implement check-prerequisites.sh rejects the deskwork branch convention (feature/<slug>); it demands Spec Kit's 001-feature-name form. stackctl execute-check already returned 'runnable', so this native prereq check is a redundant gate that mismatches the project's branch naming.
