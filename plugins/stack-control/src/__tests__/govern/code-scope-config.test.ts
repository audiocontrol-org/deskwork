// 034 T005 — config-loader `govern` block parsing + fail-loud validation.
//
// RED-first (Constitution I): these exercise `parseInstallationConfig` reading a
// `govern` section, translating snake→camel (`code_only`→`codeOnly`,
// `code_scope`→`codeScope`) onto InstallationConfig, leaving `govern` `undefined`
// when the block is absent (defaulting happens downstream in
// `resolveCodeScopePolicy`, NOT the loader — data-model.md § GovernConfig), and
// rejecting every malformed shape per data-model.md § Validation rules
// (Principle V — throw, never silently default).

import { describe, it, expect } from 'vitest';
import { parseInstallationConfig } from '../../config/config-loader.js';
import { InstallationError } from '../../config/errors.js';

const SRC = 'fixture-config.yaml';

describe('config-loader govern-block parsing (034 T005)', () => {
  it('parses a valid govern block and surfaces it as camelCase govern', () => {
    const body = [
      'version: 1',
      'govern:',
      '  code_only: true',
      '  code_scope:',
      '    exclude:',
      '      - "**/*.md"',
      '      - "**/*.markdown"',
      '    include:',
      '      - "**/SKILL.md"',
      '      - "CLAUDE.md"',
    ].join('\n');
    const config = parseInstallationConfig(body, SRC);
    expect(config.govern).toEqual({
      codeOnly: true,
      codeScope: {
        exclude: ['**/*.md', '**/*.markdown'],
        include: ['**/SKILL.md', 'CLAUDE.md'],
      },
    });
  });

  it('leaves govern undefined when no govern section is present (defaulting is downstream, not the loader)', () => {
    const config = parseInstallationConfig('version: 1\n', SRC);
    expect(config.govern).toBeUndefined();
  });
});

describe('config-loader govern-block fail-loud validation (034 T005)', () => {
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

  it('rejects a non-boolean code_only', () => {
    expectReject('version: 1\ngovern:\n  code_only: "yes"\n', /code_only/);
  });

  it('rejects a code_scope.exclude that is a bare string instead of an array', () => {
    expectReject(
      'version: 1\ngovern:\n  code_scope:\n    exclude: "**/*.md"\n',
      /code_scope\.exclude/,
    );
  });

  it('rejects a code_scope.include that is a bare string instead of an array', () => {
    expectReject(
      'version: 1\ngovern:\n  code_scope:\n    include: "**/SKILL.md"\n',
      /code_scope\.include/,
    );
  });

  it('rejects a non-mapping govern block', () => {
    expectReject('version: 1\ngovern:\n  - code_only\n', /govern must be a mapping/);
  });

  it('rejects a non-mapping code_scope block', () => {
    expectReject('version: 1\ngovern:\n  code_scope: 7\n', /code_scope must be a mapping/);
  });
});
