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
