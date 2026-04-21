---
name: testing
description: "Testing practices for deskwork plugin libraries and skills"
---

# Testing Rules

## Test Categories

| Category | Tool | Scope |
|---|---|---|
| Unit | Vitest | Adapter functions, parsers, path resolvers |
| Integration | Vitest + tmp fixtures | Skill helper scripts end-to-end against fixture project trees |
| Smoke | `claude --plugin-dir` | Plugin loads, skills appear in list, install skill runs clean against a fixture |

## Principles

- Write tests alongside implementation, not after
- Use fixture project trees on disk, never mock the filesystem
- Test edge cases, not just the golden path
- Helper scripts are public contracts — cover both happy path and error shapes
- Integration tests must exercise the adapter + skill script boundary, not call the script as a shell string

## Before Shipping

- All tests pass: `npm test` from each plugin workspace
- Plugin validates: `claude plugin validate plugins/<name>`
- Plugin loads: `claude --plugin-dir plugins/<name>` shows every skill in `/` picker

## What NOT to Test

- Claude Code internals
- The model's response to a SKILL.md prompt (non-deterministic)
