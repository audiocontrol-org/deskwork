import { describe, it, expect } from 'vitest';
import {
  EngineAdapterRequestSchema,
  EngineAdapterResponseSchema,
  validateConformance,
  parseAndValidate,
  ENGINE_METHODS,
  isConfidence,
  type EngineAdapterRequest,
  type EngineAdapterResponse,
} from '@/engine-adapter';
import { ConfidenceSchema } from '@/engine-adapter/conformance';

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

  it('rejects a request missing the payload key entirely (AUDIT-05 key-presence contract)', () => {
    const noPayload = { method: 'author-wireframe', manifestId: 'm' };
    expect('payload' in noPayload).toBe(false);
    expect(EngineAdapterRequestSchema.safeParse(noPayload).success).toBe(false);
  });

  it('accepts a request whose payload key is present with an explicit undefined value (AUDIT-05)', () => {
    const explicitUndefined = { method: 'author-wireframe', manifestId: 'm', payload: undefined };
    expect('payload' in explicitUndefined).toBe(true);
    expect(EngineAdapterRequestSchema.safeParse(explicitUndefined).success).toBe(true);
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

describe('ConfidenceSchema agrees with isConfidence by construction (1d single-source)', () => {
  const boundaryValues = [0, 1, -0.0001, 1.0001, Number.NaN, 0.5];

  for (const value of boundaryValues) {
    it(`schema-refine and isConfidence agree for ${String(value)}`, () => {
      const predicate = isConfidence(value);
      const schemaAccepts = ConfidenceSchema.safeParse(value).success;
      expect(schemaAccepts).toBe(predicate);
    });
  }
});

describe('non-execution conformance surface requires no engine probe (AUDIT-02)', () => {
  // This test proves TODAY's engine-free property of the seam: the non-execution
  // surface — ENGINE_METHODS, the confidence validators, the request/response zod
  // schemas, validateConformance, and parseAndValidate — is fully exercisable with
  // NO engine and NO probe constructed. preflightEngine is the only entry point
  // that consults a probe. It does not claim a manual-authoring helper exists.
  it('exercises the schema + validateConformance + parseAndValidate end-to-end with no probe constructed', () => {
    // method vocabulary is available without any engine
    expect([...ENGINE_METHODS]).toContain('referee-screenshot');

    // confidence validators run with no engine
    expect(isConfidence(0.5)).toBe(true);

    const request: EngineAdapterRequest = baseRequest();
    const response: EngineAdapterResponse = baseSuccessResponse();

    // structural parse runs with no engine
    expect(EngineAdapterRequestSchema.safeParse(request).success).toBe(true);
    expect(EngineAdapterResponseSchema.safeParse(response).success).toBe(true);

    // semantic echo check runs with no engine
    expect(validateConformance(request, response).conformant).toBe(true);

    // combined parse-then-echo runs with no engine
    expect(parseAndValidate(request, response).conformant).toBe(true);
  });
});

describe('parseAndValidate — parse-then-echo wrapper (AUDIT-03)', () => {
  it('returns conformant:false with structural violations for a malformed raw response (confidence 5)', () => {
    const rawResponse = { ...baseSuccessResponse(), confidence: 5 };
    const result = parseAndValidate(baseRequest(), rawResponse);
    expect(result.conformant).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    // structural source (confidence range), surfaced from the zod error path
    expect(result.violations.some((v) => v.toLowerCase().includes('confidence'))).toBe(true);
  });

  it('returns conformant:false with structural violations for a response missing manifestId', () => {
    const rawResponse = {
      method: 'referee-screenshot',
      imageHashes: ['sha256:aaa', 'sha256:bbb'],
      rubricItemIds: ['rubric-1', 'rubric-2'],
      modelIdentity: 'claude',
      confidence: 0.9,
      result: { verdict: 'pass' },
    };
    const result = parseAndValidate(baseRequest(), rawResponse);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('manifestid'))).toBe(true);
  });

  it('does not run the echo check when structural parse fails (echo is not the failure source)', () => {
    // Request is structurally malformed (missing manifestId). The echo check, if
    // run, would compare manifestIds — but structural parse must short-circuit so
    // the violations are structural, not echo-mismatch text.
    const rawRequest = { method: 'author-wireframe', payload: {} };
    const rawResponse = baseSuccessResponse();
    const result = parseAndValidate(rawRequest, rawResponse);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('manifestid'))).toBe(true);
    // The echo mismatch message uses the word "mismatch"; structural failure must not.
    expect(result.violations.some((v) => v.toLowerCase().includes('mismatch'))).toBe(false);
  });

  it('returns the echo violations for a well-formed-but-non-echoing pair', () => {
    const rawResponse = { ...baseSuccessResponse(), manifestId: 'manifest-999' };
    const result = parseAndValidate(baseRequest(), rawResponse);
    expect(result.conformant).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('manifest'))).toBe(true);
    // proves the echo layer ran (the structural shape is valid)
    expect(result.violations.some((v) => v.toLowerCase().includes('mismatch'))).toBe(true);
  });

  it('returns conformant:true for a fully-conformant pair', () => {
    const result = parseAndValidate(baseRequest(), baseSuccessResponse());
    expect(result.conformant).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
