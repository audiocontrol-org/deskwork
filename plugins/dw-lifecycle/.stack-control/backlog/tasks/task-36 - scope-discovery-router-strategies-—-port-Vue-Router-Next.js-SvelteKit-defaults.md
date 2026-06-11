---
id: TASK-36
title: >-
  scope-discovery: router strategies — port Vue Router / Next.js / SvelteKit
  defaults
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-286
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Parent feature:** scope-discovery (#273), Phase 3.

## Summary

Phase 3 of scope-discovery shipped the `RouterStrategy` interface in
`plugins/dw-lifecycle/src/scope-discovery/discovery-agents/ui-route-enumerator.ts`
with a single default strategy: `ReactRouterStrategy` (React-Router-DOM
`<Route path="..." element={<XPage />} />` syntax). Other UI frameworks
have their own routing conventions and need their own strategy
implementations.

## Frameworks to port

- **Vue Router** — `src/router/index.ts` (or `src/router.ts`) declares
  routes as a `routes: [{ path, component }]` array. Detection: a
  default-exported `createRouter({ routes })` call from `vue-router`.
- **Next.js App Router** — file-system-based routing under `app/`. A
  route exists wherever an `app/<path>/page.tsx` file is found.
  Detection: presence of `app/` directory with at least one
  `page.{ts,tsx}` file plus a `next` dependency in `package.json`.
- **Next.js Pages Router** — file-system routing under `pages/`.
  Detection: presence of `pages/` directory with `.{ts,tsx,js,jsx}`
  files plus a `next` dependency.
- **SvelteKit** — file-system routing under `src/routes/`. A route
  exists wherever a `+page.svelte` (or `+page.{ts,js}`) file is found.
  Detection: presence of `src/routes/` plus `@sveltejs/kit` in
  `package.json`.

## Design

Each new strategy implements the `RouterStrategy` interface already
defined in `ui-route-enumerator.ts`:

```typescript
export interface RouterStrategy {
  readonly id: string;
  detect(opts: { repoRoot: string }): Promise<boolean>;
  enumerate(opts: { repoRoot: string; module: string | null; moduleRoot: string }): Promise<ReadonlyArray<UiRoute>>;
}
```

The default registry in `ui-route-enumerator.ts` should grow to include
each new strategy. When more than one strategy's `detect()` returns true,
the agent throws asking the operator to disambiguate via config (the
shape of which is Phase 4+ scope).

## Out of scope

- Project-supplied custom strategies via a `.dw-lifecycle/scope-discovery/router-strategies/<id>.ts`
  override-resolution path. That is Phase 4+ work.
- Strategy id selection via project config. Same — defer until adoption
  surfaces the need.

## Acceptance

- [ ] At least one of the four frameworks above ported as a default
  strategy alongside ReactRouterStrategy.
- [ ] `RouterStrategy.detect()` results are mutually exclusive across
  the default registry on representative fixtures (no project should
  match >1 of the bundled strategies).
- [ ] Tests cover detection + enumeration for each new strategy via
  fixture project trees on disk (no mocked filesystem).
<!-- SECTION:DESCRIPTION:END -->
