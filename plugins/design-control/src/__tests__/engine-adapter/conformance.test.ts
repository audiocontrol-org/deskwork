import { describe, it, expect } from 'vitest';
import {
  EngineAdapterRequestSchema,
  EngineAdapterResponseSchema,
  validateConformance,
  type EngineAdapterRequest,
  type EngineAdapterResponse,
} from '@/engine-adapter';

function baseRequest(): EngineAdapterRequest {
  return {
    method: 'referee-screenshot',
    manifestId: 'manifest-001',
    imageHashes: ['sha256:aaa', 'sha256:bbb'],
    rubricItemIds: ['rubric-1', 'rubric-2'],
    payload: { kind: 'referee', screenshot: 'sha256:aaa' },
  };
}

function baseSuccessResponse(): EngineAdapterResponse {
  return {
    method: 'referee-screenshot',
    manifestId: 'manifest-001',
    imageHashes: ['sha256:aaa', 'sha256:bbb'],
    rubricItemIds: ['rubric-1', 'rubric-2'],
    modelIdentity: 'claude-frontend-design',
    confidence: 0.9,
    result: { verdict: 'pass' },
  };
}

describe('zod schemas reject malformed shapes', () => {
  it('rejects a request with a missing manifestId', () => {
    const bad = { method: 'author-wireframe', payload: {} };
    expect(EngineAdapterRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a request with an unknown method', () => {
    const bad = { method: 'not-a-method', manifestId: 'm', payload: {} };
    expect(EngineAdapterRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a well-formed request', () => {
    expect(EngineAdapterRequestSchema.safeParse(baseRequest()).success).toBe(true);
  });

  it('rejects a response with out-of-range confidence (> 1)', () => {
    const bad = { ...baseSuccessResponse(), confidence: 1.5 };
    expect(EngineAdapterResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a response with out-of-range confidence (< 0)', () => {
    const bad = { ...baseSuccessResponse(), confidence: -0.2 };
    expect(EngineAdapterResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a failure response with an unknown failureMode', () => {
    const bad = {
      method: 'author-wireframe',
      manifestId: 'm',
      imageHashes: [],
      modelIdentity: 'claude',
      confidence: 0.1,
      failureMode: 'not-a-real-mode',
    };
    expect(EngineAdapterResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a well-formed success response', () => {
    expect(EngineAdapterResponseSchema.safeParse(baseSuccessResponse()).success).toBe(true);
  });

  it('accepts a well-formed failure response', () => {
    const failure: EngineAdapterResponse = {
      method: 'author-wireframe',
      manifestId: 'manifest-001',
      imageHashes: [],
      modelIdentity: 'claude-frontend-design',
      confidence: 0.0,
      failureMode: 'engine-absent',
    };
    expect(EngineAdapterResponseSchema.safeParse(failure).success).toBe(true);
  });
});

describe('validateConformance — load-bearing echo check', () => {
  it('returns conformant for a correct echo', () => {
    const result = validateConformance(baseRequest(), baseSuccessResponse());
    expect(result.conformant).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('flags a method mismatch', () => {
    const response = { ...baseSuccessResponse(), method: 'author-wireframe' as const };
    const result = validateConformance(baseRequest(), response);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('method'))).toBe(true);
  });

  it('flags a manifestId mismatch', () => {
    const response = { ...baseSuccessResponse(), manifestId: 'manifest-999' };
    const result = validateConformance(baseRequest(), response);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('manifest'))).toBe(true);
  });

  it('flags a missing (empty) modelIdentity', () => {
    const response = { ...baseSuccessResponse(), modelIdentity: '' };
    const result = validateConformance(baseRequest(), response);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('modelidentity'))).toBe(true);
  });

  it('flags missing rubricItemIds on a referee-screenshot response', () => {
    const response: EngineAdapterResponse = {
      method: 'referee-screenshot',
      manifestId: 'manifest-001',
      imageHashes: ['sha256:aaa', 'sha256:bbb'],
      modelIdentity: 'claude-frontend-design',
      confidence: 0.9,
      result: { verdict: 'pass' },
    };
    const result = validateConformance(baseRequest(), response);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('rubric'))).toBe(true);
  });

  it('flags rubricItemIds drift on a referee-screenshot response', () => {
    const response = { ...baseSuccessResponse(), rubricItemIds: ['rubric-1'] };
    const result = validateConformance(baseRequest(), response);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('rubric'))).toBe(true);
  });

  it('flags image-hash drift (response acted on a hash not in the request)', () => {
    const response = {
      ...baseSuccessResponse(),
      imageHashes: ['sha256:aaa', 'sha256:ccc'],
    };
    const result = validateConformance(baseRequest(), response);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('image'))).toBe(true);
  });

  it('accepts an image-hash superset (response echoes all requested hashes, plus extras)', () => {
    const response = {
      ...baseSuccessResponse(),
      imageHashes: ['sha256:aaa', 'sha256:bbb', 'sha256:ddd'],
    };
    const result = validateConformance(baseRequest(), response);
    // superset-or-equal of request hashes is conformant on the image axis
    expect(result.violations.some((v) => v.toLowerCase().includes('image'))).toBe(false);
  });

  it('flags an out-of-range confidence value', () => {
    const response = { ...baseSuccessResponse(), confidence: 2 };
    const result = validateConformance(baseRequest(), response);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('confidence'))).toBe(true);
  });

  it('flags a failure response that carries no failureMode and no result', () => {
    const response = {
      method: 'author-wireframe' as const,
      manifestId: 'manifest-x',
      imageHashes: [],
      modelIdentity: 'claude',
      confidence: 0.1,
    };
    const request: EngineAdapterRequest = {
      method: 'author-wireframe',
      manifestId: 'manifest-x',
      payload: {},
    };
    const result = validateConformance(request, response);
    expect(result.conformant).toBe(false);
    expect(
      result.violations.some(
        (v) => v.toLowerCase().includes('failuremode') || v.toLowerCase().includes('result'),
      ),
    ).toBe(true);
  });

  it('accepts a conformant failure response (failureMode present, no result)', () => {
    const request: EngineAdapterRequest = {
      method: 'author-wireframe',
      manifestId: 'manifest-x',
      payload: {},
    };
    const response: EngineAdapterResponse = {
      method: 'author-wireframe',
      manifestId: 'manifest-x',
      imageHashes: [],
      modelIdentity: 'claude-frontend-design',
      confidence: 0.0,
      failureMode: 'engine-absent',
    };
    const result = validateConformance(request, response);
    expect(result.conformant).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
