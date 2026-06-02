/**
 * Phase 8 Step 8.3.3 — direct tests for the shared route plumbing
 * extracted from `routes/api.ts`. The two route handlers compose
 * `extractScreenshotUploadFile` + `mapScreenshotErrorToResponse`;
 * pinning the helper contract here keeps a refactor from silently
 * weakening the error-mapping rules both routes depend on.
 *
 * The extract helper is exercised indirectly through the route tests
 * in `entry-screenshot-route.test.ts`; this file targets only the
 * error-mapping function which is the part most likely to drift if a
 * future change renames an error-message prefix on the persistence
 * layer.
 */

import { describe, it, expect } from 'vitest';
import { mapScreenshotErrorToResponse } from '../src/routes/screenshot-upload-helper.ts';

describe('mapScreenshotErrorToResponse', () => {
  it('maps a sidecar-not-found error to 404 when entryId is supplied', () => {
    const err = new Error('sidecar not found at /tmp/.deskwork/entries/x.json');
    const mapped = mapScreenshotErrorToResponse(err, { entryId: 'abc-def' });
    expect(mapped.status).toBe(404);
    expect(mapped.message).toBe('unknown entry: abc-def');
  });

  it('does NOT map sidecar-not-found to 404 when entryId is omitted', () => {
    // Orphan route does not call readSidecar but if some future
    // change ever surfaced the same prefix, the orphan route would
    // not have an entryId to embed — fall through to the 500 catchall.
    const err = new Error('sidecar not found at /tmp/.deskwork/entries/x.json');
    const mapped = mapScreenshotErrorToResponse(err);
    expect(mapped.status).toBe(500);
    expect(mapped.message).toMatch(/screenshot write failed/);
  });

  it('maps already-exists to 409 with the original message preserved', () => {
    const err = new Error('screenshot already exists at /proj/scrapbook/file.png');
    const mapped = mapScreenshotErrorToResponse(err);
    expect(mapped.status).toBe(409);
    expect(mapped.message).toBe(
      'screenshot already exists at /proj/scrapbook/file.png',
    );
  });

  it('maps a filename-validation error to 400 with the message preserved', () => {
    const err = new Error('screenshot filename must match /.../ (got "..bad")');
    const mapped = mapScreenshotErrorToResponse(err);
    expect(mapped.status).toBe(400);
    expect(mapped.message).toMatch(/^screenshot filename/);
  });

  it('maps the "screenshot filename is required" empty-string error to 400', () => {
    const err = new Error('screenshot filename is required');
    const mapped = mapScreenshotErrorToResponse(err);
    expect(mapped.status).toBe(400);
    expect(mapped.message).toBe('screenshot filename is required');
  });

  it('maps anything else to 500 with the wrapped message', () => {
    const err = new Error('EIO write failed');
    const mapped = mapScreenshotErrorToResponse(err);
    expect(mapped.status).toBe(500);
    expect(mapped.message).toBe('screenshot write failed: EIO write failed');
  });

  it('coerces non-Error throws to their string form before wrapping', () => {
    const mapped = mapScreenshotErrorToResponse('bare string');
    expect(mapped.status).toBe(500);
    expect(mapped.message).toBe('screenshot write failed: bare string');
  });
});
