# Quickstart: Audit protocol friction burndown

1. Prepare a multi-phase fixture spec with at least two distinct phases and one nested-installation case.
2. Record or synthesize lane capability profiles covering a small, medium, and degraded fleet.
3. Validate that govern refuses advancement when a required phase checkpoint is missing.
4. Validate that a prospectively-safe but actually-oversized phase fails with `boundary-too-large`.
5. Validate that fleet negotiation finishes before remediation payload assembly and either selects lanes or fails explicit negotiation.
6. Validate that nested-installation phase govern uses one installation anchor end to end.
