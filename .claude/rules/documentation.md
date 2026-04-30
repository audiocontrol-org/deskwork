# Documentation Rules

## No rot-prone specifics in adopter-facing docs

Don't hardcode values in `README.md`, plugin `README.md` files, or other adopter-facing docs that change over time and won't get bumped on every release. Specifically:

- **Plugin / package versions.** Don't write `Shipping (v0.9.6)` in a status table; write `Shipping`. Don't put `/plugin marketplace add audiocontrol-org/deskwork#v0.1.0` as an example; write `#<tag>` and link the releases page.
- **"Latest" / "current" claims tied to a specific version.** Don't claim a specific version is the latest in prose; the GitHub releases page asserts it.
- **Specific PR / issue numbers used as examples.** Linking to a specific issue is fine when the doc is *about* that issue; using `#88` as a generic example will read badly when context drifts.

Point at the canonical source instead:

- **Versions** → [GitHub releases page](https://github.com/audiocontrol-org/deskwork/releases). The release list IS the source of truth; link to it.
- **Issues** → the issue tracker.

## What's safe to write

Backward-looking statements describe history and stay accurate:

- ✓ `If you're upgrading from v0.8.x or earlier, see MIGRATING.md` — describes the past; doesn't rot.
- ✓ `The vendor architecture (Phase 23, retired in v0.9.5)` — historical context.
- ✗ `The current version is v0.9.6` — rots immediately.
- ✗ `Shipping (v0.9.6)` in a table — rots on every release.

## Why

Hardcoded versions in adopter docs are bug factories. The deskwork README's plugin-status table drifted from v0.4.2 to v0.9.6 across five releases without an update; the Pinning section's `v0.1.0` example was wrong from v0.2.0 onward. Adopters following stale instructions install old versions or paste install commands that point at pre-pivot tags. Eliminate the maintenance burden by removing the rot vector — the releases page already exists, it's authoritative, link to it.

This rule applies to **adopter-facing** docs. Internal artifacts that are explicitly version-bound (commit messages, release notes, journal entries, workplan tasks tied to a version) can and should name versions — they describe a moment in time, not "now."
