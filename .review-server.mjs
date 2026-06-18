// Throwaway design-doc review server (mobile-friendly, server-side markdown render).
// Not committed. Reads the doc fresh on each request so edits show on refresh.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import MarkdownIt from 'markdown-it';

const DOC = '/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/docs/superpowers/specs/2026-06-18-roadmap-edge-mutation-and-cluster-design.md';
const PORT = 8765;
const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 1.1rem 1.05rem 4rem;
  max-width: 46rem; margin-inline: auto;
  font: 17px/1.62 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1c1e21; background: #fbfbfa;
  -webkit-text-size-adjust: 100%; word-wrap: break-word;
}
@media (prefers-color-scheme: dark) {
  body { color: #d7dadc; background: #16181a; }
  a { color: #6cb6ff; }
  code, pre { background: #22262a !important; }
  th, td { border-color: #30353a !important; }
  hr { border-color: #30353a !important; }
  blockquote { color: #9aa0a6; border-color: #30353a !important; }
}
h1 { font-size: 1.5rem; line-height: 1.25; margin: 1.4rem 0 .8rem; }
h2 { font-size: 1.22rem; margin: 2rem 0 .6rem; padding-top: .5rem; border-top: 1px solid #e4e4e1; }
h3 { font-size: 1.06rem; margin: 1.4rem 0 .5rem; }
@media (prefers-color-scheme: dark) { h2 { border-color: #30353a; } }
a { color: #0b66c3; }
code { font: 0.86em ui-monospace, SFMono-Regular, Menlo, monospace; background: #eee9; padding: .12em .35em; border-radius: 4px; }
pre { background: #f0f0ee; padding: .85rem 1rem; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; font-size: .92rem; }
th, td { border: 1px solid #ddd; padding: .45rem .6rem; text-align: left; vertical-align: top; }
th { background: #f0f0ee; }
@media (prefers-color-scheme: dark) { th { background: #22262a; } }
blockquote { margin: .8rem 0; padding: .2rem 0 .2rem .9rem; border-left: 3px solid #ccc; color: #555; }
hr { border: none; border-top: 1px solid #e4e4e1; margin: 1.6rem 0; }
ul, ol { padding-left: 1.35rem; }
li { margin: .25rem 0; }
.meta { font-size: .8rem; opacity: .6; margin-top: 2.5rem; }
`;

function page() {
  const body = md.render(readFileSync(DOC, 'utf8'));
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>roadmap-edge-mutation-and-cluster — design review</title>
<style>${CSS}</style>
</head><body>
${body}
<p class="meta">stack-control design review · served locally over Tailscale · refresh to see edits</p>
</body></html>`;
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200).end('ok'); return; }
  try {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(page());
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('render error: ' + (err && err.message ? err.message : String(err)));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`review server listening on 0.0.0.0:${PORT}`);
});
