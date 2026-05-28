import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CompleteGateInvalidOverrideError,
  CompleteGateRefusedError,
  formatOverrideJournalEntry,
  runCompleteGate,
  scanForBareTbds,
} from '../lifecycle-integration/complete-tbd-gate.js';

interface Fixture {
  root: string;
  workplanPath: string;
}

function setup(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-complete-gate-'));
  return { root, workplanPath: join(root, 'workplan.md') };
}

const SUBSTANTIVE = 'This deferral is acceptable because the upstream API contract changes are out of our control until the vendor responds to the open ticket.';

describe('scanForBareTbds', () => {
  let fx: Fixture;

  beforeEach(() => { fx = setup(); });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('returns zero bare TBDs when every marker has a [debt: #NNN] back-link', () => {
    writeFileSync(
      fx.workplanPath,
      [
        '# Workplan',
        '- [ ] Step 1: TBD [debt: #123]',
        '- [ ] Step 2: defer to platform team [debt: #124]',
        '',
      ].join('\n'),
      'utf8',
    );
    expect(scanForBareTbds({ workplanPath: fx.workplanPath })).toHaveLength(0);
  });

  it('returns zero bare TBDs when every marker has an inline (wontfix: …) clause', () => {
    writeFileSync(
      fx.workplanPath,
      [
        '# Workplan',
        '- [ ] Step 1: TBD (wontfix: dependency is permanently external)',
        '- [ ] Step 2: out of scope (wontfix: addressed by upstream library v2)',
        '',
      ].join('\n'),
      'utf8',
    );
    expect(scanForBareTbds({ workplanPath: fx.workplanPath })).toHaveLength(0);
  });

  it('returns each bare TBD location with line number + text', () => {
    writeFileSync(
      fx.workplanPath,
      [
        '# Workplan',
        '- [ ] Step 1: TBD wire up the API call',
        '- [ ] Step 2: defer the migration script',
        '- [ ] Step 3: clean line',
        '',
      ].join('\n'),
      'utf8',
    );
    const bare = scanForBareTbds({ workplanPath: fx.workplanPath });
    expect(bare).toHaveLength(2);
    expect(bare[0]?.lineNumber).toBe(2);
    expect(bare[1]?.lineNumber).toBe(3);
  });

  it('returns zero locations when the workplan does not exist', () => {
    expect(scanForBareTbds({ workplanPath: fx.workplanPath })).toHaveLength(0);
  });
});

describe('runCompleteGate — refusal path', () => {
  let fx: Fixture;
  beforeEach(() => { fx = setup(); });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('throws CompleteGateRefusedError when bare TBDs are present', () => {
    writeFileSync(
      fx.workplanPath,
      '- [ ] Step 1: TBD wire up\n',
      'utf8',
    );
    expect(() =>
      runCompleteGate({
        workplanPath: fx.workplanPath,
        skipTbdGate: false,
        overrideReason: null,
      }),
    ).toThrow(CompleteGateRefusedError);
  });

  it('refusal message mentions promote-deferrals as the remediation', () => {
    writeFileSync(
      fx.workplanPath,
      '- [ ] Step 1: TBD wire up\n',
      'utf8',
    );
    try {
      runCompleteGate({
        workplanPath: fx.workplanPath,
        skipTbdGate: false,
        overrideReason: null,
      });
      expect.fail('expected refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(CompleteGateRefusedError);
      const refused = err as CompleteGateRefusedError;
      expect(refused.message).toContain('promote-deferrals');
      expect(refused.bareTbds).toHaveLength(1);
    }
  });

  it('passes cleanly when no bare TBDs are present', () => {
    writeFileSync(
      fx.workplanPath,
      [
        '# Workplan',
        '- [ ] Step 1: TBD [debt: #123]',
        '- [ ] Step 2: out of scope (wontfix: upstream is end-of-life and no fix exists)',
        '',
      ].join('\n'),
      'utf8',
    );
    const result = runCompleteGate({
      workplanPath: fx.workplanPath,
      skipTbdGate: false,
      overrideReason: null,
    });
    expect(result.bareTbds).toHaveLength(0);
    expect(result.overrideUsed).toBe(false);
  });
});

describe('runCompleteGate — override path', () => {
  let fx: Fixture;
  beforeEach(() => { fx = setup(); });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('refuses --skip-tbd-gate without --reason', () => {
    writeFileSync(fx.workplanPath, '- [ ] Step 1: TBD wire up\n', 'utf8');
    expect(() =>
      runCompleteGate({
        workplanPath: fx.workplanPath,
        skipTbdGate: true,
        overrideReason: null,
      }),
    ).toThrow(CompleteGateInvalidOverrideError);
  });

  it('refuses --reason "<short>" via substantive-reason validator', () => {
    writeFileSync(fx.workplanPath, '- [ ] Step 1: TBD wire up\n', 'utf8');
    expect(() =>
      runCompleteGate({
        workplanPath: fx.workplanPath,
        skipTbdGate: true,
        overrideReason: 'too short',
      }),
    ).toThrow(CompleteGateInvalidOverrideError);
  });

  it('refuses --reason "<gaming phrase>" via substantive-reason validator', () => {
    writeFileSync(fx.workplanPath, '- [ ] Step 1: TBD wire up\n', 'utf8');
    expect(() =>
      runCompleteGate({
        workplanPath: fx.workplanPath,
        skipTbdGate: true,
        overrideReason: 'we will fix it later when the migration completes next sprint okay?',
      }),
    ).toThrow(CompleteGateInvalidOverrideError);
  });

  it('accepts a substantive override reason and surfaces bareTbds for journaling', () => {
    writeFileSync(fx.workplanPath, '- [ ] Step 1: TBD wire up\n', 'utf8');
    const result = runCompleteGate({
      workplanPath: fx.workplanPath,
      skipTbdGate: true,
      overrideReason: SUBSTANTIVE,
    });
    expect(result.overrideUsed).toBe(true);
    expect(result.overrideReason).toBe(SUBSTANTIVE);
    expect(result.bareTbds).toHaveLength(1);
  });
});

describe('formatOverrideJournalEntry', () => {
  it('emits a markdown entry under `### Hygiene override`', () => {
    const entry = formatOverrideJournalEntry({
      slug: 'hygiene',
      workplanPath: '/repo/docs/1.0/001-IN-PROGRESS/hygiene/workplan.md',
      reason: SUBSTANTIVE,
      bareTbds: [
        { path: '/repo/docs/1.0/001-IN-PROGRESS/hygiene/workplan.md', lineNumber: 12, text: '- [ ] Step 1: TBD wire up' },
      ],
    });
    expect(entry).toContain('### Hygiene override');
    expect(entry).toContain('Feature slug: hygiene');
    expect(entry).toContain('Bare TBDs at override: 1');
    expect(entry).toContain(SUBSTANTIVE);
  });
});
