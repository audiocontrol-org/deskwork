## Workplan: deskwork-triage

### Phase 1 — Issue #4: marketplace install ships no runnable bundle

Tracked in: https://github.com/audiocontrol-org/deskwork/issues/4

#### Tasks

- [ ] **CLI plugin: relocate bundle into plugin tree**
  - [ ] Update `packages/cli/build.ts` to write `plugins/deskwork/bundle/cli.mjs`
  - [ ] Update `plugins/deskwork/bin/deskwork` to resolve the bundle at `${SCRIPT_DIR}/../bundle/cli.mjs`
  - [ ] Run `npm --workspace packages/cli run build` and confirm new path exists
  - [ ] Remove the now-unused `packages/cli/bundle/` directory and its tracked `cli.mjs`

- [ ] **Studio plugin: relocate bundle + public assets into plugin tree**
  - [ ] Move `packages/studio/public/` to `plugins/deskwork-studio/public/` via `git mv`
  - [ ] Update `packages/studio/build.ts` to read from `plugins/deskwork-studio/public/src/`, write client bundles to `plugins/deskwork-studio/public/dist/`, and write the server bundle to `plugins/deskwork-studio/bundle/server.mjs`
  - [ ] Update `packages/studio/src/server.ts` `publicDir()` to try the bundle layout (`${here}/../public`) first and fall back to the source-tree layout (`${here}/../../../plugins/deskwork-studio/public`)
  - [ ] Update `plugins/deskwork-studio/bin/deskwork-studio` to resolve the bundle at `${SCRIPT_DIR}/../bundle/server.mjs`
  - [ ] Run `npm --workspace packages/studio run build` and confirm new paths exist
  - [ ] Remove the now-unused `packages/studio/bundle/` directory

- [ ] **Verify**
  - [ ] Marketplace simulation: copy `plugins/deskwork/` to `/tmp/dwk-cli-test/`, run `bin/deskwork --help`, expect exit 0
  - [ ] Marketplace simulation: copy `plugins/deskwork-studio/` to `/tmp/dwk-studio-test/`, run `bin/deskwork-studio --help`, expect exit 0
  - [ ] Dev path still works: `npm install` at root, `node_modules/.bin/deskwork --help` runs source via tsx
  - [ ] `npm test` passes for `packages/cli` and `packages/studio`
  - [ ] `claude plugin validate plugins/deskwork` and `claude plugin validate plugins/deskwork-studio` pass
  - [ ] `git ls-files plugins/deskwork/bundle plugins/deskwork-studio/bundle plugins/deskwork-studio/public` shows relocated artifacts

- [ ] **Commit and open PR**
  - [ ] Commit changes
  - [ ] Push `feature/deskwork-triage`
  - [ ] Open PR referencing issue #4
