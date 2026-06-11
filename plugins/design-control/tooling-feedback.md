# Tooling Feedback


## session-end 2026-06-11
- govern.sh resolves the feature from the repo root only; a nested installation (plugins/design-control) needs --repo-root, and even then the backlog-store/slush resolution still resolves from cwd, not --repo-root (slush step exited 1 non-fatally: 'no stack-control installation found from <repo root>') — filed https://github.com/audiocontrol-org/deskwork/issues/460
- audit-barrage claude lane timed out at the plugin default 300s on a governed-diff payload (run 20260611T062218157Z fleet-floor refusal); nested installations do not inherit the repo-root audit-barrage-config override — had to seed .stack-control/audit-barrage-config.yaml per installation — filed https://github.com/audiocontrol-org/deskwork/issues/461
- stackctl govern folds untracked files into the audited diff with absolute a/Users/... path prefixes — filed https://github.com/audiocontrol-org/deskwork/issues/458
- stackctl govern audited diff includes .stack-control/audit-runs/** so each governance round recursively embeds prior rounds' PROMPT.md; payload compounds monotonically — filed https://github.com/audiocontrol-org/deskwork/issues/459
