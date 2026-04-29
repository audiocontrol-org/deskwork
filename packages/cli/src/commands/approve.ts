/**
 * deskwork-approve — terminal write step for the review loop.
 *
 * For **longform**, the SSOT invariant says disk is already the approved
 * content (the studio save handler writes disk first, approve annotation
 * captures the current version). This helper just transitions the
 * workflow to 'applied'. If disk has moved on since the approve click,
 * the helper refuses rather than silently rolling back.
 *
 * For **shortform**, the approved markdown is written into the matching
 * DistributionRecord's `shortform` field in the calendar.
 *
 * Usage:
 *   deskwork-approve <project-root> [--site <slug>] <slug>
 *   deskwork-approve <project-root> [--site <slug>] <slug> --platform <p> [--channel <c>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { readConfig } from '@deskwork/core/config';
import {
  resolveSite,
  resolveCalendarPath,
  resolveEntryFilePath,
  resolveShortformFilePath,
} from '@deskwork/core/paths';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import { parseFrontmatter } from '@deskwork/core/frontmatter';
import {
  handleGetWorkflow,
} from '@deskwork/core/review/handlers';
import {
  readAnnotations,
  transitionState,
} from '@deskwork/core/review/pipeline';
import type {
  ApproveAnnotation,
  DraftAnnotation,
  DraftVersion,
  DraftWorkflowItem,
} from '@deskwork/core/review/types';
import { isPlatform } from '@deskwork/core/types';
import type { DeskworkConfig } from '@deskwork/core/config';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site', 'platform', 'channel'] as const;
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail(
      'Usage: deskwork-approve <project-root> [--site <slug>] <slug> ' +
        '[--platform <p>] [--channel <c>]',
      2,
    );
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  if (!SLUG_RE.test(slug)) {
    fail(`invalid slug: ${slug} (must match ${SLUG_RE})`);
  }

  if (flags.platform !== undefined && !isPlatform(flags.platform)) {
    fail(`Invalid --platform "${flags.platform}".`);
  }

  let config: DeskworkConfig;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const site = resolveSite(config, flags.site);
  const contentKind: 'longform' | 'shortform' = flags.platform ? 'shortform' : 'longform';

  const fetched = handleGetWorkflow(projectRoot, config, {
    id: null,
    site,
    slug,
    contentKind,
    platform: flags.platform ?? null,
    channel: flags.channel ?? null,
  });

  if (fetched.status !== 200 || !isSuccessBody(fetched.body)) {
    fail(
      `no ${contentKind} workflow for ${site}/${slug}: ${errorMessage(fetched.body)}`,
    );
  }

  const workflow = fetched.body.workflow;
  const versions = fetched.body.versions;

  if (workflow.state !== 'approved') {
    fail(
      `Workflow state is '${workflow.state}', not 'approved'. ` +
        `Click Approve in the review UI first (that records which version was approved).`,
    );
  }

  const annotations = readAnnotations(projectRoot, config, workflow.id);
  const approveAnn = latestApprove(annotations);
  const approvedVersion = approveAnn?.version ?? workflow.currentVersion;

  if (contentKind === 'longform') {
    applyLongform(workflow, approvedVersion);
  } else {
    applyShortform(workflow, versions, approvedVersion);
  }

  function applyLongform(workflow: DraftWorkflowItem, approvedVersion: number): void {
    if (approvedVersion !== workflow.currentVersion) {
      fail(
        `Approved v${approvedVersion}, but workflow is at v${workflow.currentVersion}. ` +
          `Disk has moved on since the approve click — re-click Approve on v${workflow.currentVersion} or iterate back.`,
      );
    }

    // The workflow already records the stable entry id; prefer it for
    // path resolution so the UUID-bound file wins over the slug-template
    // (Issue #67).
    const blogFile = resolveEntryFilePath(
      projectRoot,
      config,
      site,
      slug,
      workflow.entryId,
    );
    if (!existsSync(blogFile)) {
      fail(`Blog file missing at ${blogFile}. Nothing to approve against.`);
    }

    transitionState(projectRoot, config, workflow.id, 'applied');

    emit({
      workflowId: workflow.id,
      site,
      slug,
      contentKind: 'longform',
      state: 'applied',
      version: approvedVersion,
      filePath: blogFile,
    });
  }

  function applyShortform(
    workflow: DraftWorkflowItem,
    _versions: DraftVersion[],
    approvedVersion: number,
  ): void {
    if (!flags.platform) fail('--platform is required for shortform workflows');
    if (!isPlatform(flags.platform)) fail(`Invalid --platform "${flags.platform}".`);

    // Phase 21a: shortform is now disk-backed. Read the on-disk file as
    // the SSOT — the journal version is just the latest snapshot, but
    // every save writes to disk first. Strip the frontmatter so the
    // calendar's `## Shortform Copy` section captures the body only.
    const filePath = resolveShortformFilePath(
      projectRoot,
      config,
      site,
      { slug },
      flags.platform,
      flags.channel,
    );
    if (filePath === undefined || !existsSync(filePath)) {
      const shown = filePath ?? '(unresolved)';
      fail(
        `Shortform file missing at ${shown}. ` +
          `The file is the SSOT — re-run /deskwork:shortform-start if needed.`,
      );
    }

    const fileSrc = readFileSync(filePath, 'utf-8');
    const approvedMarkdown = parseFrontmatter(fileSrc).body.replace(/^\n+/, '');

    const calendarPath = resolveCalendarPath(projectRoot, config, site);
    const cal = readCalendar(calendarPath);

    const channelLower = flags.channel?.toLowerCase();
    const match = cal.distributions.find((d) => {
      if (d.slug !== slug) return false;
      if (d.platform !== flags.platform) return false;
      if (channelLower !== undefined) {
        return (d.channel?.toLowerCase() ?? '') === channelLower;
      }
      return !d.channel;
    });

    if (!match) {
      const channelBit = flags.channel ? ` · channel=${flags.channel}` : '';
      fail(
        `No distribution record for (slug=${slug}, platform=${flags.platform}${channelBit}). ` +
          `Create it with /deskwork:distribute first.`,
      );
    }

    match.shortform = approvedMarkdown;
    writeCalendar(calendarPath, cal);
    transitionState(projectRoot, config, workflow.id, 'applied');

    emit({
      workflowId: workflow.id,
      site,
      slug,
      contentKind: 'shortform',
      state: 'applied',
      version: approvedVersion,
      platform: flags.platform,
      channel: flags.channel,
      calendarPath,
      filePath,
    });
  }

  function latestApprove(
    annotations: readonly DraftAnnotation[],
  ): ApproveAnnotation | undefined {
    const approves = annotations.filter(
      (a): a is ApproveAnnotation => a.type === 'approve',
    );
    if (approves.length === 0) return undefined;
    return approves.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  }

  function isSuccessBody(
    body: unknown,
  ): body is { workflow: DraftWorkflowItem; versions: DraftVersion[] } {
    if (typeof body !== 'object' || body === null) return false;
    return 'workflow' in body && 'versions' in body;
  }

  function errorMessage(body: unknown): string {
    if (typeof body === 'object' && body !== null) {
      const value = Reflect.get(body, 'error');
      if (typeof value === 'string') return value;
    }
    return 'unknown error';
  }

  function parse() {
    try {
      return parseArgs(argv, KNOWN_FLAGS);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
    }
  }
}
