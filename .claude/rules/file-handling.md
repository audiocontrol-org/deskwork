## File Handling Rules

### Never use bare `/tmp/<name>` paths

Do not write to or read from un-namespaced paths like `/tmp/commit-msg.txt`, `/tmp/check.py`, `/tmp/body.md`. These are shared-namespace and race-prone — two concurrent Claude sessions, parallel worktrees, parallel sub-agents, or even rapid sequential edits can clobber each other. Symptoms include: commits with the wrong message, helper scripts running with stale logic, PR bodies pulled from a different session's draft.

The bug pattern is the bare `/tmp/<filename>`. Anything that puts the session ID, PID, or a `mktemp`-generated suffix in the path is fine.

**Use one of these instead:**

- **`mktemp`** when you need a temp file the OS will eventually clean up:
  ```bash
  MSG=$(mktemp)
  # ...write to "$MSG"...
  git commit -F "$MSG"
  rm "$MSG"
  ```
- **In-tree** when the artifact should live with the worktree. The deskwork repo has `.git-commit-msg.tmp` at the root for commit messages — gitignored and worktree-local. Use it instead of inventing a new `/tmp/` path.
- **Pipe via stdin** when the consumer accepts it. `git commit` does NOT accept stdin for the message, but many tools (`gh issue create --body-file -`, `jq`, etc.) do.

### Commit messages with markdown bodies

Per the work-level CLAUDE.md: never put `#` characters inside Bash heredocs or multi-line quoted arguments — Claude Code's permission gate flags them. To write multi-line messages with `#`, use a file:

```bash
MSG=$(mktemp)
cat > "$MSG" <<'EOF'
feat(area): subject

Body with markdown sections, lists, etc.
EOF
git commit -F "$MSG"
rm "$MSG"
```

Or write via the Write tool to the in-tree `.git-commit-msg.tmp`, then `git commit -F .git-commit-msg.tmp`.

The same constraint applies to sub-agent delegation prompts — pass through the same rules so dispatched agents don't trigger the gate.
