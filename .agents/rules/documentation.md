# Documentation Rules

## No rot-prone specifics in adopter-facing docs

Do not hardcode values in adopter-facing docs that will drift quickly:

- versions
- "latest/current" claims tied to a version
- example issue/PR numbers unless the doc is specifically about them

Point to canonical sources instead:

- versions → GitHub releases page
- issues → issue tracker

## Safe historical statements

Backward-looking statements are fine:

- upgrading from an older version
- describing a retired architecture
- documenting what happened in a specific release

The rule applies to adopter-facing docs, not time-bound internal artifacts like journal entries or release notes.
