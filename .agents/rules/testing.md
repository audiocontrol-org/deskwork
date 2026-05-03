---
name: testing
description: "Testing practices for deskwork plugin libraries and skills"
---

# Testing Rules

## Categories

| Category | Tool | Scope |
|---|---|---|
| Unit | Vitest | Helpers, parsers, path resolvers |
| Integration | Vitest + tmp fixtures | End-to-end helper behavior against fixture trees |
| Smoke | Real plugin load/install paths | Plugin load and adopter-shaped verification |

## Principles

- write tests with implementation
- use on-disk fixtures instead of mocking the filesystem
- test edge cases, not only golden paths
- helper scripts are public contracts

## Before Shipping

- relevant tests pass
- plugin validates
- plugin loads

## What Not to Test

- Claude/Codex internals
- model prose generated from a skill body
