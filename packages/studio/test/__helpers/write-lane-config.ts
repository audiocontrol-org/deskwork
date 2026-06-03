/**
 * Shared lane-config fixture writer for studio tests.
 *
 * Phase 39 (sites→lanes retirement): a lane carries NO `contentDir` —
 * location is a property of the ENTRY (`entry.artifactPath`). The
 * directory argument here lands under the lane's add-time
 * `scaffoldDefaults.markdown` (the editorial/visual pipelines' markdown
 * artifact kind), which is convenience-only and never resolution.
 *
 * Extracted so the dashboard-swimlane fixture builders (the unit fixture
 * in `dashboard-swimlane-fixture.ts` and the integration fixture in
 * `dashboard-swimlane-integration-fixture.ts`) share one writer instead
 * of each maintaining an identical copy.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeLaneConfig(
  root: string,
  id: string,
  name: string,
  pipelineTemplate: string,
  scaffoldMarkdown: string,
): void {
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify(
      {
        id,
        name,
        pipelineTemplate,
        scaffoldDefaults: { markdown: scaffoldMarkdown },
      },
      null,
      2,
    ),
    'utf8',
  );
}
