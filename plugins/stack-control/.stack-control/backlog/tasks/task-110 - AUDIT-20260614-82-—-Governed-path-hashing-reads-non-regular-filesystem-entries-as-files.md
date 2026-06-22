---
id: TASK-110
title: >-
  AUDIT-20260614-82 — Governed path hashing reads non-regular filesystem entries
  as files
status: To Do
assignee: []
created_date: '2026-06-14 18:32'
labels:
  - 'type:migrated-finding'
  - 'feature:audit-protocol-friction-burndown'
  - 'finding:AUDIT-20260614-82'
dependencies: []
references:
  - 'audit:audit-protocol-friction-burndown:AUDIT-20260614-82'
priority: medium
ordinal: 110000
---



## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-scoped 2026-06-22: original finding cited checkpoint-state.ts:144-158 (deleted by 030 — moot). Same defect migrated to scope-fingerprint.ts:77 digestScopedPath — only symlinks and directories are guarded; FIFO, socket, and device special files fall through to readFileSync and hash as opaque blobs. Fix: reject non-regular entries (FIFO/socket/block-device/char-device) in digestScopedPath, fail loud instead of silently hashing device bytes.
<!-- SECTION:DESCRIPTION:END -->
