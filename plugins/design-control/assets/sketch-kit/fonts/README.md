# Bundled sketch-kit fonts (OFL)

These woff2 files are vendored (committed) so the wireframe kit is fully
self-contained — no network fetch, no external resource. They are **aesthetic
only** and carry no determinism claim.

| File | Family / weight | Source package | License |
|---|---|---|---|
| `patrick-hand-400.woff2` | Patrick Hand 400 | `@fontsource/patrick-hand` (latin subset) | SIL OFL 1.1 — `patrick-hand.OFL.txt` |
| `space-mono-400.woff2` | Space Mono 400 | `@fontsource/space-mono` (latin subset) | SIL OFL 1.1 — `space-mono.OFL.txt` |
| `space-mono-700.woff2` | Space Mono 700 | `@fontsource/space-mono` (latin subset) | SIL OFL 1.1 — `space-mono.OFL.txt` |

The `sk-theme-grayscale` theme deliberately uses a plain system sans stack and
bundles no font.

## Re-vendoring

```bash
npm install --no-save @fontsource/patrick-hand @fontsource/space-mono
# copy <pkg>/files/<family>-latin-<weight>-normal.woff2  ->  <family>-<weight>.woff2
# copy <pkg>/LICENSE  ->  <family>.OFL.txt
```
