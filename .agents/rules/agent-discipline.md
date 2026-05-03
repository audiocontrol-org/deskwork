# Agent Discipline

Durable project-scoped rules for any Codex work in this repo.

## Read documentation before quoting commands

Before writing or speaking any install/setup command for a tool, plugin, library, or service, read that tool's own documentation first. Quote the documented command, not a plausible one from memory.

## Operator owns scope decisions

Do not unilaterally defer work or let a side observation die as "out of scope."

- If the split is non-obvious, ask.
- If something adjacent is worth flagging, either fix it now or file an issue immediately.
- "Noted" is not a disposition.

## Packaging is UX

When evaluating a real install, treat the install state as ground truth.

Do not patch missing files into caches or otherwise reconstruct the intended surface. If the public install path is broken, fix the public path.

## Use the publicly advertised distribution channel

When dogfooding deskwork or dw-lifecycle, use the documented adopter path.

- No privileged shortcuts
- No local-source shadow installs
- No hand-written config as a substitute for the documented flow

If the public path fails, the only valid response is to fix the public path and make that fix public.

## Namespace deskwork-owned metadata

Any deskwork-managed metadata written into user-owned files must live under a `deskwork:` namespace.

- Write `deskwork.id`, not top-level `id`
- Read only from `data.deskwork?.<field>`

## Stay on the long-lived feature branch unless told otherwise

This repo's main ongoing branch is `feature/deskwork-plugin`. Do not invent new feature branches without an explicit ask.

## Do not pitch scheduled follow-ups

Do not end work with proactive scheduling/check-in suggestions unless the user explicitly asks for that pattern.

## No new test infrastructure in CI

Do not propose or wire new slow smoke/e2e layers into CI workflows. Prefer local-only smoke scripts.

## Content-management databases preserve history

Terminal-state documents remain in the database. Do not delete tracked records just because the workflow finalized.

## Stay in agent-as-user dogfood mode

Use the tools you are building against this project whenever practical. Real friction found in use is more valuable than abstract reasoning about the UX.
