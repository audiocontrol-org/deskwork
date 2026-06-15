# Research: Audit protocol friction burndown

## Decisions

### D1. Required govern unit

Use **per-phase** as the required implementation governance unit. Whole-feature govern remains a final composing pass only.

### D2. Phase freshness

Represent phase acceptance as a durable checkpoint keyed by phase identity plus a work fingerprint over the authoritative in-scope files. Any file change after the checkpoint makes it stale.

### D3. Prospective sizing

Prospective sizing should be heuristic and explicit about that fact. The estimate basis should include at minimum touched-file count, raw diff size, and any known path classes that historically expand heavily in rendered payloads.

### D4. Actual sizing

Actual sizing should evaluate the real rendered payload that would be sent to the active fleet, not an indirect proxy. This is the gate that has teeth.

### D5. Lane capability knowledge

Start with an explicit local record of known-good lanes and practical payload envelopes. Later self-calibration can append to that same surface.

### D6. Fleet negotiation timing

Negotiate the fleet before remediation payload assembly. This keeps control-plane selection out of execution / fix prompts and gives boundary sizing a stable target.

### D7. Anchor discipline

Every govern sub-step in one run should share one authoritative installation root resolved at the top of the run and passed down, not rediscovered ad hoc.

### D8. Reporting

Boundary-too-large, negotiation-failed, floor-shortfall, and coverage-degraded should be separate terminal outcomes, not mere warning strings.
