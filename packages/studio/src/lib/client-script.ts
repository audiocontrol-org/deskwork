/**
 * Emit the <script> tag for a client-side TS module.
 *
 * Dev mode (DESKWORK_DEV=1): emit /src/<name>.ts so Vite's middleware serves
 * the source with HMR.
 *
 * Prod mode (default): emit /static/dist/<name>.js (the in-process esbuild
 * output served from .runtime-cache/dist/).
 */
export function clientScriptTag(name: string): string {
  if (process.env.DESKWORK_DEV === '1') {
    return `<script type="module" src="/src/${name}.ts"></script>`;
  }
  return `<script type="module" src="/static/dist/${name}.js"></script>`;
}

/**
 * Emit the Vite HMR client `<script>` tag — empty string in prod.
 *
 * Vite's `/@vite/client` module connects the browser to Vite's WebSocket,
 * receives invalidation events on file change, and either runs the
 * module's `import.meta.hot.accept` handler or triggers a full page
 * reload. With no `import.meta.hot` calls in the studio's client code
 * yet, this gives us auto-reload on save (HMR-grade behavior without the
 * fine-grained module updates).
 *
 * Layout prepends this to scriptModules in dev so every page gets it.
 */
export function viteClientTag(): string {
  if (process.env.DESKWORK_DEV === '1') {
    return '<script type="module" src="/@vite/client"></script>';
  }
  return '';
}
