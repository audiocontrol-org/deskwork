# Design Record: Fleet Control Plane

**Item**: `design:feature/fleet-control-plane`
**Date**: 2026-07-16
**Status**: Approved

## Problem domain

stack-control manages development effort across multiple worktrees, sessions, and workstreams simultaneously. Today there is no way to see what is happening across them at a glance. An operator running three parallel `stackctl execute` runs on three different worktrees must switch terminal context to check progress, has no mechanism to pause or cancel a run from a central surface, and has no historical record of how long design / spec / execution / governance phases actually take. Roadmap and backlog state drift silently across worktrees with no reconciliation signal. The missing piece is a **control plane**: a server that every stackctl invocation reports into, and a dashboard that aggregates that state into a live operator view with active control over each session.

## Solution space

### Chosen — SSE for commands, HTTP POST for telemetry

`stackctl serve` starts a standalone HTTP server. Each stackctl invocation that has a control plane URL configured opens a Server-Sent Events stream (`GET /stream/:instanceId`) to receive commands for its lifetime. Telemetry is sent as discrete fire-and-forget HTTP POSTs to `POST /telemetry`. The dashboard receives its own SSE stream (`GET /dashboard-stream`) for real-time fleet state pushes. Commands travel server → instance over the SSE stream; telemetry travels instance → server over POSTs.

**Why chosen:** SSE is a durable, server-pushed HTTP stream that satisfies the "durable connection for receiving commands" requirement with less implementation complexity than full WebSocket. The two channels (telemetry up, commands down) are decoupled — a telemetry burst does not block command delivery. SSE has native browser support, automatic reconnect semantics, and is trivial to debug with `curl`. The asymmetry (POST for telemetry, SSE for commands) matches the asymmetry in traffic shape: telemetry is high-frequency, bursty, and fire-and-forget; commands are low-frequency and need delivery guarantees.

### Rejected — Full WebSocket control plane

Every stackctl invocation opens a persistent WebSocket connection. Both telemetry and commands travel over the same bidirectional frame stream.

**Why rejected:** Full WebSocket adds connection lifecycle management, message framing, backpressure handling, and a more complex reconnect protocol — none of which is required when the two traffic directions have different delivery semantics. WebSocket becomes the right choice if stackctl-initiated request/response to the server is needed (not yet identified); SSE can be promoted to WebSocket at that point.

### Rejected — Message queue / event log with REST polling

`stackctl serve` exposes a REST API backed by a JSONL log. stackctl instances POST events and GET pending commands on a short poll. No persistent connection.

**Why rejected:** Polling for commands introduces delivery latency and "durable connection" becomes "frequent polling." Dashboard state is stale by poll interval. Ruled out once real-time command delivery was identified as a requirement.

## Decisions

### Server

- New subcommand `stackctl serve [--port PORT]` starts the control plane server.
- Stack-control is standalone — the server has no dependency on deskwork studio (stack-control is moving out of the deskwork umbrella).
- Server endpoints:
  - `GET /stream/:instanceId` — SSE stream, held open for the instance lifetime; server pushes commands down this stream.
  - `POST /telemetry` — telemetry intake; updates in-memory registry and writes to durable store asynchronously.
  - `POST /commands/:instanceId` — dashboard sends a command; server forwards it down the target instance's SSE stream.
  - `GET /dashboard-stream` — SSE stream for the dashboard; server pushes registry change events.
  - `GET /` — serves the web dashboard.

### Telemetry emitter

Fires on every stackctl invocation when `STACKCTL_CP_URL` is configured. No-op when unconfigured. Emits on: `invocation-start`, `phase-change`, `task-start`, `task-complete`, `task-error`, `invocation-end`.

**Telemetry payload:**

```
instanceId, worktree, branch, installationPath, operator,
phase, currentTask, elapsedMs, errors, timestamp, event

model, taskModel, claudeCodeVersion, platform, nodeVersion, stackctlVersion

compass: { item, intent, verdict, phase, reason, checkedAt }

artifacts: { roadmap, designDoc, spec, plan, tasks, backlog, auditLog, developmentLog }

execution: { runId, status, totalTasks, completed, failed, skipped, startedAt, completedAt, history[] }

governance: { status, lastRunAt, lastVerdict, openFindings, history[] }

timings: { designMs, specMs, executionMs, governanceMs, totalMs }

git: { uncommittedFiles, unpushedCommits, currentBranch, lastCommitHash,
       lastCommitMessage, lastCommitAt, hasConflicts, isDirty }

reconciliation: { lastRunAt, status, roadmapItemCount, backlogItemCount,
                  driftedItems[], unresolvedCount }
```

### Instance registry

In-memory map keyed by `instanceId` (worktree path + session ID, hashed). Each entry is the latest telemetry record plus `connectedAt`, `lastSeenAt`, `status` (`live` | `stale` | `complete`). TTL default: 60 seconds with no telemetry → `stale`. `invocation-end` event → `complete`.

### Control commands

Commands delivered to stackctl instances via SSE. Initial command set:
- `pause` — suspend execute loop after current task
- `resume` — clear pause
- `cancel` — abort run cleanly
- `config-push` — push updated model tier map, concurrency limit, or other runtime config
- `reconcile` — trigger `stackctl roadmap reconcile` and POST result back as telemetry

### Durable store

Every telemetry POST is also written to Backblaze B2 (fronted by Cloudflare CDN) asynchronously — B2 write failure does not block live dashboard response. Storage layout:

```
{bucket}/telemetry/{instanceId}/{YYYY-MM-DD}/{timestamp}-{event}.json
{bucket}/runs/{instanceId}/{runId}/events.jsonl
{bucket}/governance/{instanceId}/{runId}/result.json
{bucket}/reconciliation/{instanceId}/{timestamp}-reconcile.json
```

A Cloudflare Worker at `STACKCTL_CP_CF_WORKER_URL` provides a `/query` endpoint for range queries (e.g. all telemetry for an instance over a date range). Dashboard historical views (timing history, cross-instance aggregates, error rate trends) query the Worker.

If `STACKCTL_CP_B2_BUCKET` / `STACKCTL_CP_B2_KEY_ID` / `STACKCTL_CP_B2_APP_KEY` are absent, the server runs store-less: live dashboard only, no history.

**Configuration:**
```
STACKCTL_CP_URL             — control plane base URL (set on stackctl instances; enables emitter)
STACKCTL_CP_PORT            — port for stackctl serve (default: 3100)
STACKCTL_CP_B2_BUCKET       — B2 bucket name
STACKCTL_CP_B2_KEY_ID       — B2 application key id
STACKCTL_CP_B2_APP_KEY      — B2 application key
STACKCTL_CP_CF_ACCOUNT_ID   — Cloudflare account id
STACKCTL_CP_CF_WORKER_URL   — Cloudflare Worker query endpoint
```

### Dashboard UI

Single-page app served by the control plane server. Live updates via SSE from `GET /dashboard-stream`.

**Fleet table** — one row per instance, sorted by last-seen descending. Stale instances greyed; complete instances collapsed into a "Recent" section.

| Column | Content |
|---|---|
| Instance | Worktree name + branch |
| Compass | Phase badge + verdict chip |
| Status | live / stale / complete + elapsed |
| Progress | Current phase → current task + progress bar |
| Model | In-session model + dispatched task model |
| Git | Dirty indicator + unpushed count |
| Recon | clean / N drifted badge |
| Actions | Pause · Resume · Cancel · Reconcile |

**Instance detail drawer** — opens on row click, tabbed:
- **Overview** — compass snapshot, git status, model + runtime
- **Artifacts** — quick-access links to roadmap, design doc, spec, plan, tasks, backlog, audit log, dev log
- **Execution** — current run progress + history table
- **Governance** — last verdict, open findings, history table
- **Timings** — bar chart: design / spec / execution / governance elapsed per item
- **Reconciliation** — drift table + Reconcile button

**Fleet-wide actions bar**: Reconcile all · Pause all · Cancel all

## Open questions

- **SSE reconnect on instance side:** if the SSE connection to the server drops mid-run (network hiccup, server restart), the instance should reconnect with backoff. The reconnect window and backoff policy (e.g. exponential, max 30s) need to be specified at plan time.
- **Command acknowledgement:** the current design has no ACK from the instance back to the server when it receives a command. The dashboard has no way to know if a `pause` command was received. A lightweight ACK telemetry event (`command-received`, `command-applied`) should be added if the operator needs delivery confirmation.
- **Cloudflare Worker query API shape:** the Worker's `/query` endpoint needs a defined request/response schema before the dashboard historical views can be built. This is deferred to plan/implementation.
- **Multi-machine fleet:** the current design assumes all instances connect to one `stackctl serve` process. Cross-machine fleet (multiple operators on multiple machines sharing one control plane) is not addressed. The pluggable `STACKCTL_CP_URL` config leaves the door open but the auth/identity model for multi-machine is unresolved.
- **B2 write failure handling:** the async write path silently drops failed B2 writes. A dead-letter queue or local buffer for failed writes is not designed yet.
- **Dashboard auth:** the web UI is currently unauthenticated (localhost-only assumed). If the server is exposed beyond localhost, auth is needed. Not designed.

## Provenance

Designed in-session via `superpowers:brainstorming` (Alternative B selected from three alternatives). Operator approved each design section interactively. Key decisions: standalone server (stack-control moving out of deskwork umbrella); SSE + HTTP POST over full WebSocket or polling; B2 + Cloudflare for durable store; in-memory registry for live state. Handoff: `/stack-control:define`.
