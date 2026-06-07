# Feature Specification: Add a `--version` flag to the CLI (fixture: clean)

> Fixture spec for spec-governance tests — a small, internally-consistent
> spec with no seeded defects. A barrage over this should surface 0 HIGH.

## User Scenarios

### US1 — Operator checks the installed version (P1)

As an operator, I run `mycli --version` and the CLI prints its semantic
version to stdout and exits 0, so I can confirm which build is installed.

## Requirements

- FR-001: `mycli --version` MUST print the version string to stdout.
- FR-002: `mycli --version` MUST exit 0 on success.
- FR-003: The version string MUST be read from the package manifest — a
  single source of truth — never hardcoded in the flag handler.

## Success Criteria

- SC-001: `mycli --version` prints a non-empty version line and exits 0.
- SC-002: The printed version equals the manifest `version` field.
