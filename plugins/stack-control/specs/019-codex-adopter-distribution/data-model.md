# Data Model: Public Codex distribution for adopters

## Codex Distribution Channel

- **Purpose**: Public adopter-facing route for installing `stack-control` in
  Codex.
- **Attributes**:
  - `channelId`
  - `registrationStep`
  - `installCommand`
  - `updateCommand`
  - `resolvedVersion`

## Released Plugin Artifact

- **Purpose**: Versioned plugin payload consumed by host channels.
- **Attributes**:
  - `version`
  - `manifest`
  - `skillsPayload`
  - `releaseRef`

## Distribution Metadata

- **Purpose**: Host-facing metadata that points consumers at the released
  plugin artifact.
- **Attributes**:
  - `host`
  - `sourceKind`
  - `sourceRef`
  - `version`

## Development Install Flow

- **Purpose**: Repo-local plugin loading path for maintainers developing the
  plugin.
- **Attributes**:
  - `localPath`
  - `host`
  - `intendedAudience`
