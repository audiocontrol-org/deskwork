# File Handling Rules

## Never use bare `/tmp/<name>` paths

Do not use shared un-namespaced temp paths like `/tmp/commit-msg.txt` or `/tmp/feature-definition-foo.md`.

Use one of:

- `mktemp`
- an in-tree local temp path
- stdin pipes where supported

For this repo, Codex-local draft artifacts should live under `.agents/.tmp/`.

## Commit messages with markdown bodies

If a multi-line commit message needs markdown, write it to a temp file and use `git commit -F <file>`.

Avoid brittle shell quoting for markdown-heavy bodies.
