# Contract: audit-barrage-config.yaml v2 lane grammar

Consumers: `config-loader.ts` (validates), operators (author project overrides), the shipped template. Field semantics are normative in [data-model.md](../data-model.md) § ModelConfigEntry; this contract pins the on-disk grammar and the refusal behavior.

## Grammar (one lane)

```yaml
models:
  - name: claude                      # unique
    binary: claude                    # PATH-resolvable
    model: opus                       # REQUIRED — explicit pin (alias or full id)
    args_template: "-p --model {{model}} --permission-mode plan --output-format stream-json --verbose {{prompt-stdin}}"
    #              MUST contain {{model}} and exactly one of {{prompt}} | {{prompt-stdin}}
    readonly_enforcement: "--permission-mode plan"   # REQUIRED — CLI fragment, or the sentinel: none
    output_mode: stream-json          # REQUIRED — text | stream-json
    liveness_signal: stdout           # REQUIRED — stdout | stderr | none
    liveness_window_seconds: 60       # required when liveness_signal != none
    timeout_floor_seconds: 300        # derivation pair — required unless timeout_seconds present
    timeout_secs_per_kb: 13
    # timeout_seconds: 900            # optional explicit override; recorded as override
```

## Shipped template defaults (research D1–D5)

| lane | model | readonly_enforcement | output_mode | liveness | floor / per-kb |
|---|---|---|---|---|---|
| claude | `opus` | `--permission-mode plan` (spike-verified) | stream-json | stdout / 60 s | 300 / 13 |
| codex | explicit pin (confirmed against installed CLI at implement time) | `--sandbox read-only` (MUST be hostile-probe verified before shipping as enforced; until then `none`) | text | stderr / 60 s | 300 / 7 |
| gemini (disabled) | explicit pin | `none` until probed | text | none (unmonitored) | 300 / 7 |

A fable thoroughness-override profile is documented in the template comments: `model: fable`, `timeout_secs_per_kb: 17`.

## Validation / refusal behavior (fail-loud, zero-write)

| Condition | Loader behavior |
|---|---|
| `model` absent, or `args_template` lacks `{{model}}` | refuse: names the lane + the missing pin (FR-001) |
| `readonly_enforcement` absent | refuse: pre-014 config — migration message names file, missing fields, template path (FR-011, SC-006) |
| `output_mode` / `liveness_signal` absent or invalid enum | refuse, naming the lane + allowed values |
| `liveness_signal != none` and no `liveness_window_seconds` | refuse |
| neither (`timeout_floor_seconds` + `timeout_secs_per_kb`) nor `timeout_seconds` | refuse (FR-002) |
| `readonly_enforcement: none` | LOAD OK — lane runs; fire-time warning + `unenforced` marking everywhere (clarified 2026-06-10) |
| prompt-placeholder rules | unchanged from v1 (exactly one of `{{prompt}}`/`{{prompt-stdin}}`) |

Refusals are exit-2 usage-class errors with remediation text; no partial load, no defaulting (Constitution V).
