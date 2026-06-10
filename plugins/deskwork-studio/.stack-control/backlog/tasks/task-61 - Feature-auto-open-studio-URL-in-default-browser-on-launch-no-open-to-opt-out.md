---
id: TASK-61
title: >-
  Feature: auto-open studio URL in default browser on launch (--no-open to opt
  out)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-217
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Feature: auto-open the studio URL in the operator's default browser on launch

### Current behavior

`deskwork-studio` (and its skill `/deskwork-studio:studio`) prints a listening banner with the URLs and exits the foreground until Ctrl-C. The operator then has to copy/paste or cmd-click the URL into a browser to actually use the studio.

### Proposed behavior

After the listening banner prints, automatically open the **loopback** URL (`http://localhost:<port>/dev/editorial-studio`) in the operator's default browser. Tailscale/LAN URLs remain banner-only — those are for other devices and shouldn't summon a browser on the host.

In agent contexts (Claude Code, Codex, Copilot CLI), this saves one round-trip — today the agent prints the URL and the operator says "can you wave a magic wand and open this in my browser?" The agent then shells out to `open`/`xdg-open`. If that's the desired default, ship it in the wrapper.

### Behavior details

1. **Loopback only.** Never auto-open `http://<tailscale-ip>:port/` or `http://<lan-ip>:port/` — peers don't get pop-up browsers, and the host operator wants `localhost`.
2. **After the banner prints**, so the (possibly auto-incremented) port is known.
3. **Cross-platform**:
   - macOS: `open <url>`
   - Linux: `xdg-open <url>`
   - Windows: `start "" <url>`
   - Or use `npm:open` / `npm:opener` to delegate.
4. **Skip when non-interactive** — detect `!process.stdout.isTTY` OR a known CI env var (`CI`, `GITHUB_ACTIONS`, etc.) and skip silently.
5. **Skip on `--host` exposure beyond loopback** when the operator is clearly remote (e.g., bound to `0.0.0.0` over SSH). Heuristic: if the loopback bind succeeded AND we're interactive, open. Otherwise skip.
6. **Best-effort, never fail-the-launch.** If the open call errors (no DISPLAY, no default handler), log a one-line note and keep the studio running.
7. **Opt-out flag** — `--no-open` (and/or env var `DESKWORK_STUDIO_NO_OPEN=1`) for operators who already have a tab pinned and don't want a new one each launch.

### Suggested skill prose update

After this lands, the `/deskwork-studio:studio` skill's Step 4 should mention:

> The wrapper opens `http://localhost:<port>/dev/editorial-studio` in your default browser on launch. Pass `--no-open` to skip.

…and Step 6 ("Report to the operator") should drop the URL line when auto-open ran.

### Acceptance

- `deskwork-studio` on a TTY launches the studio AND opens `http://localhost:<port>/dev/editorial-studio` in the default browser.
- `deskwork-studio --no-open` launches the studio and does NOT open the browser.
- `deskwork-studio` in a non-TTY / CI context launches the studio and does NOT open the browser; nothing crashes.
- Auto-open targets loopback only — never the Tailscale or LAN URL — even when both are bound.
- A best-effort open failure (no default browser, no display) prints a one-line note but does not abort the launch.

### Origin

Surfaced 2026-05-06 during a Claude Code session: agent launched the studio in the background, printed the banner, and the operator asked the agent to "wave a magic wand and make the editorial studio appear in my browser." Agent shelled out to `open`. Worth shipping that round-trip as the default.
<!-- SECTION:DESCRIPTION:END -->
