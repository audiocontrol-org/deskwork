# Data Model: Portable stack-control workflow across Claude Code and Codex

## Portable Workflow Contract

- **Purpose**: The authoritative shared definition of a stack-control workflow
  capability.
- **Attributes**:
  - `capabilityId` — stable identifier (`define`, `extend`, `execute`,
    `backlog.capture`, `release`, etc.)
  - `inputShape` — validated arguments/options
  - `successSurface` — structured result reported by the core
  - `failureSurface` — explicit fail-loud outcomes
  - `stateTransitions` — any persistent state changes caused by the capability

## Host Adapter

- **Purpose**: A thin Claude Code or Codex-facing layer over the portable
  workflow contract.
- **Attributes**:
  - `host` — `claude` or `codex`
  - `capabilities` — host-specific affordances/limitations
  - `invokedCapabilityId` — shared core capability the adapter exposes
  - `presentationRules` — host-native phrasing/output behavior
- **Relationships**:
  - maps to exactly one portable workflow capability per adapter action

## Backlog Port

- **Purpose**: Stable stack-control-facing seam for backlog operations.
- **Attributes**:
  - `operations` — capture, list, promote, import, inspect
  - `validationRules` — stack-control terms and fail-loud diagnostics
  - `backendErrorTranslation` — maps backend failures to workflow-safe messages
- **Relationships**:
  - mediated by one concrete backlog backend implementation at runtime

## Backlog Backend

- **Purpose**: Concrete storage/mutation engine implementing the backlog port.
- **Attributes**:
  - `backendId` — current backend identity
  - `storageLayout` — backend-private representation
  - `nativeTools` — backend-private commands/UI
- **Relationships**:
  - hidden behind the backlog port

## Release Unit

- **Purpose**: The atomic set of shipped artifacts that move together in one
  monorepo release.
- **Attributes**:
  - `version` — shared lockstep release version
  - `tag` — annotated git tag for the release
  - `artifacts` — all shipped plugins/packages updated together
  - `verificationFlow` — preconditions, publish assertions, smoke checks

## Distribution Channel

- **Purpose**: A consumer-facing route to the same released artifacts.
- **Attributes**:
  - `channelId` — e.g. Claude marketplace, Codex install/update path
  - `releaseVersion` — version exposed to the consumer
  - `resolutionMechanism` — how the consumer fetches the released artifact
- **Relationships**:
  - many channels may point to one release unit

## Parity Verdict

- **Purpose**: Evidence that Claude Code and Codex expose the same shared-core
  capability.
- **Attributes**:
  - `capabilityId`
  - `coreBehaviorVerified` — yes/no
  - `claudeAdapterVerified` — yes/no
  - `codexAdapterVerified` — yes/no
  - `explicitLimitations` — host limitations surfaced fail-loud
