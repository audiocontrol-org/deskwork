// 033 T003/T004 — config-loader `tier_map` parsing + fail-loud validation.
//
// RED-first (Constitution I): these exercise `parseInstallationConfig` reading a
// `tier_map` section, translating snake→camel (`tierMap`) onto InstallationConfig,
// and rejecting every malformed/out-of-range shape per contracts/tier-map-config.md.

import { describe, it, expect } from 'vitest';
import { parseInstallationConfig } from '../../config/config-loader.js';
import { InstallationError } from '../../config/errors.js';

const SRC = 'fixture-config.yaml';

describe('config-loader tier_map parsing (033 T003)', () => {
  it('parses a valid tier_map and surfaces it as camelCase tierMap', () => {
    const body = ['version: 1', 'tier_map:', '  fast: haiku', '  balanced: sonnet', '  powerful: opus'].join('\n');
    const config = parseInstallationConfig(body, SRC);
    expect(config.tierMap).toEqual({ fast: 'haiku', balanced: 'sonnet', powerful: 'opus' });
  });

  it('leaves tierMap undefined when no tier_map section is present (optional field)', () => {
    const config = parseInstallationConfig('version: 1\n', SRC);
    expect(config.tierMap).toBeUndefined();
  });
});

describe('config-loader tier_map fail-loud validation (033 T004)', () => {
  function expectReject(body: string, pattern: RegExp): void {
    let thrown: unknown;
    try {
      parseInstallationConfig(body, SRC);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(InstallationError);
    if (!(thrown instanceof InstallationError)) throw new Error('expected an InstallationError');
    expect(thrown.message).toMatch(pattern);
  }

  it('rejects a non-mapping tier_map', () => {
    expectReject('version: 1\ntier_map:\n  - fast\n  - powerful\n', /tier_map must be a mapping/);
  });

  it('rejects an empty tier-label key', () => {
    expectReject('version: 1\ntier_map:\n  "": haiku\n', /tier_map has an empty tier label/);
  });

  it('rejects a non-string / empty value', () => {
    expectReject('version: 1\ntier_map:\n  fast: ""\n', /tier_map\[fast\] must be a non-empty model keyword/);
  });

  it('rejects a value outside the accepted-model set, naming the accepted models', () => {
    expectReject(
      'version: 1\ntier_map:\n  powerful: gpt-9000\n',
      /tier_map\[powerful\] = 'gpt-9000' is not an accepted model \(haiku\|sonnet\|opus\|fable\)/,
    );
  });
});
