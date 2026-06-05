import { describe, it, expect } from 'vitest';
import type {
  EngineAdapter,
  EngineAdapterRequestFor,
  EngineAdapterResponseFor,
} from '@/engine-adapter';

/**
 * A minimal stub adapter that satisfies the {@link EngineAdapter} interface. The
 * point of this stub is the COMPILE-TIME binding: each method's request `method`
 * field is narrowed to its own method string, so passing the wrong method to a
 * method is a type error (asserted below with @ts-expect-error).
 */
function makeStubAdapter(): EngineAdapter {
  return {
    async authorWireframe(
      request: EngineAdapterRequestFor<'author-wireframe'>,
    ): Promise<EngineAdapterResponseFor<'author-wireframe'>> {
      return {
        method: request.method,
        manifestId: request.manifestId,
        imageHashes: [],
        modelIdentity: 'stub',
        confidence: 1,
        result: {},
      };
    },
    async translateDesignLanguage(
      request: EngineAdapterRequestFor<'translate-design-language'>,
    ): Promise<EngineAdapterResponseFor<'translate-design-language'>> {
      return {
        method: request.method,
        manifestId: request.manifestId,
        imageHashes: [],
        modelIdentity: 'stub',
        confidence: 1,
        result: {},
      };
    },
    async refereeScreenshot(
      request: EngineAdapterRequestFor<'referee-screenshot'>,
    ): Promise<EngineAdapterResponseFor<'referee-screenshot'>> {
      return {
        method: request.method,
        manifestId: request.manifestId,
        imageHashes: [],
        rubricItemIds: request.rubricItemIds ?? ['rubric-1'],
        modelIdentity: 'stub',
        confidence: 1,
        result: {},
      };
    },
  };
}

describe('EngineAdapter method/envelope binding (compile-time)', () => {
  it('accepts a request whose method matches the adapter method', async () => {
    const adapter = makeStubAdapter();
    const response = await adapter.authorWireframe({
      method: 'author-wireframe',
      manifestId: 'm',
      payload: {},
    });
    expect(response.method).toBe('author-wireframe');
  });

  it('rejects (at the type level) a request whose method is for a different adapter method', async () => {
    const adapter = makeStubAdapter();
    // @ts-expect-error — authorWireframe must reject a referee-screenshot request envelope.
    await adapter.authorWireframe({ method: 'referee-screenshot', manifestId: 'm', payload: {} });
    expect(adapter).toBeDefined();
  });

  it('rejects (at the type level) a mismatched method on refereeScreenshot too', async () => {
    const adapter = makeStubAdapter();
    // @ts-expect-error — refereeScreenshot must reject an author-wireframe request envelope.
    await adapter.refereeScreenshot({ method: 'author-wireframe', manifestId: 'm', payload: {} });
    expect(adapter).toBeDefined();
  });
});
