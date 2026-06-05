import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import { EngineAdapterRequestSchema, EngineAdapterResponseSchema } from '@/engine-adapter';
import type {
  EngineAdapter,
  EngineAdapterRequest,
  EngineAdapterResponse,
  EngineAdapterRequestFor,
  EngineAdapterResponseFor,
} from '@/engine-adapter';

/**
 * Compile-time field-set drift guard (AUDIT-20260605-08). The request schema
 * cannot carry a `satisfies z.ZodType<EngineAdapterRequest>` clause (its
 * `ZodEffects`/required-`payload` shape — see conformance.ts), so its field-set is
 * pinned to the type here instead: if a field is added to or removed from
 * {@link EngineAdapterRequest} without the matching schema change (or vice-versa),
 * the key unions diverge and `Equal` resolves to `false`, failing `tsc --noEmit`
 * (which the package `test` script runs before vitest). The response schema keeps
 * its own `satisfies` clause AND is pinned here for symmetry.
 */
type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

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

  it('rejects (at the type level) a request envelope that omits the required payload key (AUDIT-05)', async () => {
    const adapter = makeStubAdapter();
    // @ts-expect-error — payload is a REQUIRED key on the request envelope; omitting it is a type error.
    await adapter.authorWireframe({ method: 'author-wireframe', manifestId: 'm' });
    expect(adapter).toBeDefined();
  });

  it('pins each schema field-set to its type — field drift fails tsc (AUDIT-08)', () => {
    // These consts are typed `Expect<Equal<schema-keys, type-keys>>`. When the key
    // sets align, `Equal` is `true` and `= true` typechecks. Add/remove a field on
    // one side only and `Equal` becomes `false`, `Expect<false>` violates its
    // `extends true` constraint, and `tsc --noEmit` (run before vitest by the
    // package `test` script) fails. The runtime `expect` keeps the locals used.
    const requestKeysAligned: Expect<
      Equal<keyof z.input<typeof EngineAdapterRequestSchema>, keyof EngineAdapterRequest>
    > = true;
    const responseKeysAligned: Expect<
      Equal<keyof z.input<typeof EngineAdapterResponseSchema>, keyof EngineAdapterResponse>
    > = true;
    expect([requestKeysAligned, responseKeysAligned]).toEqual([true, true]);
  });
});
