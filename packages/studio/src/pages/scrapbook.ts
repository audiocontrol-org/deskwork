/**
 * Scrapbook viewer — `/dev/scrapbook/:site/<path>`.
 *
 * The implementation lives in the `scrapbook/` directory (one module
 * per concern, each under the 500-line cap). This file re-exports the
 * public render function + error type so the existing `server.ts`
 * import keeps working.
 *
 * Mirrors the post-#191 envelope/dispatch split for mutations
 * (`routes/scrapbook-mutation-{envelope,dispatch}.ts`): the slim entry
 * is the public surface; the directory holds the concerns.
 */

export {
  renderScrapbookPage,
  ScrapbookPageError,
} from './scrapbook/index.ts';
