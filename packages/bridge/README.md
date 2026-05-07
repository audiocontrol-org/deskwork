@deskwork/bridge
================

Long-lived sidecar process for the deskwork studio ↔ Claude Code bridge.

The bridge owns the MCP `/mcp` endpoint and the chat-panel HTTP surface
(`/api/chat/{send,stream,state,history}`) so its process lifecycle is
decoupled from the studio's. The studio can restart while the bridge keeps
serving Claude Code's MCP listen loop and the operator's chat panel.

This package is internal-use-only at this stage. Adopter-facing wiring
(plugin shell, install instructions, launchd / systemd templates) is
deferred per Phase 10 of the studio-bridge feature workplan. See
`docs/1.0/001-IN-PROGRESS/studio-bridge/design-phase-10.md` for the
architectural contract.

Usage:
  deskwork-bridge --project-root <path> [--port <n>] [--host <addr>]

The sidecar writes a discovery descriptor at
`<projectRoot>/.deskwork/.bridge` so the studio can find the sidecar's
port. The descriptor is removed on graceful shutdown (SIGTERM / SIGINT).
