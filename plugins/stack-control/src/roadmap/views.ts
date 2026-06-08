// Roadmap derived views (006 US4, R8) — ready-list, blocked report, and a
// mermaid flowchart from `depends-on`. All computed on demand from the graph;
// NEVER persisted (FR-015). The roadmap verb composes these for output.

import { blockedBy, isReady, ready } from './graph.js';
import type { RoadmapModel, WorkItem } from './roadmap-model.js';

/** The ready-list: header + one bullet per ready item. */
export function readyList(model: RoadmapModel): string {
  const items = ready(model);
  const lines = [`roadmap next: ${items.length} ready`];
  for (const item of items) lines.push(`  - ${item.identifier}`);
  return `${lines.join('\n')}\n`;
}

function isLive(model: RoadmapModel, item: WorkItem): boolean {
  return !model.doc.grammar.terminalStatuses.includes(item.status);
}

/** Each non-terminal, non-ready item + what blocks it (deps named; deferred marker). */
export function blockedReport(model: RoadmapModel): string {
  const blocked = model.items.filter((i) => isLive(model, i) && !isReady(model, i));
  const lines = [`roadmap blocked: ${blocked.length} item${blocked.length === 1 ? '' : 's'}`];
  for (const item of blocked) {
    const report = blockedBy(model, item.identifier);
    const parts = report.unmetDependencies.map((d) => `${d.identifier} (${d.status})`);
    if (report.deferredUntil !== null) parts.push(`deferred: ${report.deferredUntil}`);
    lines.push(`  - ${item.identifier} — blocked by ${parts.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** A mermaid flowchart from `depends-on` (dependency --> dependent), derived. */
export function mermaid(model: RoadmapModel): string {
  const nodeId = new Map(model.items.map((item, i) => [item.identifier, `n${i}`]));
  const lines = ['flowchart TD'];
  for (const item of model.items) {
    lines.push(`  ${nodeId.get(item.identifier)}["${item.identifier} (${item.status})"]`);
  }
  for (const item of model.items) {
    for (const dep of item.dependsOn) {
      // Dependency points to dependent (the direction work flows).
      lines.push(`  ${nodeId.get(dep)} --> ${nodeId.get(item.identifier)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
