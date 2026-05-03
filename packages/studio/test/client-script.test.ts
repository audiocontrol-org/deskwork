import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clientScriptTag, viteClientTag } from '../src/lib/client-script.ts';

describe('clientScriptTag', () => {
  let savedDev: string | undefined;
  beforeEach(() => {
    savedDev = process.env.DESKWORK_DEV;
  });
  afterEach(() => {
    if (savedDev === undefined) {
      delete process.env.DESKWORK_DEV;
    } else {
      process.env.DESKWORK_DEV = savedDev;
    }
  });

  it('emits prod path by default', () => {
    delete process.env.DESKWORK_DEV;
    expect(clientScriptTag('editorial-studio-client')).toBe(
      '<script type="module" src="/static/dist/editorial-studio-client.js"></script>',
    );
  });

  it('emits dev path when DESKWORK_DEV=1', () => {
    process.env.DESKWORK_DEV = '1';
    expect(clientScriptTag('editorial-studio-client')).toBe(
      '<script type="module" src="/src/editorial-studio-client.ts"></script>',
    );
  });

  it('does NOT emit dev path for any other DESKWORK_DEV value', () => {
    process.env.DESKWORK_DEV = 'true';
    expect(clientScriptTag('editorial-studio-client')).toBe(
      '<script type="module" src="/static/dist/editorial-studio-client.js"></script>',
    );
  });
});

describe('viteClientTag', () => {
  let savedDev: string | undefined;
  beforeEach(() => {
    savedDev = process.env.DESKWORK_DEV;
  });
  afterEach(() => {
    if (savedDev === undefined) {
      delete process.env.DESKWORK_DEV;
    } else {
      process.env.DESKWORK_DEV = savedDev;
    }
  });

  it('emits the Vite HMR client tag in dev mode', () => {
    process.env.DESKWORK_DEV = '1';
    expect(viteClientTag()).toBe(
      '<script type="module" src="/@vite/client"></script>',
    );
  });

  it('emits empty string in prod', () => {
    delete process.env.DESKWORK_DEV;
    expect(viteClientTag()).toBe('');
  });
});
