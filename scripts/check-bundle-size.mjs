// Fails when the JavaScript a first visit must download is over budget.
//   node scripts/check-bundle-size.mjs [distDir] [maxKbGzip]
// "Initial" means the entry script plus every chunk the entry page preloads (.plan/10-testing-and-ci.md:
// initial JS under 340 KB gzip). Lazy route chunks are not counted: they load when the route does.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

export function initialScripts(html) {
  const found = [];
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const tag = m[0];
    const isScript = tag.startsWith('<script') && /type="module"/.test(tag);
    const isPreload = tag.startsWith('<link') && /rel="modulepreload"/.test(tag);
    const src = /(?:src|href)="([^"]+)"/.exec(tag)?.[1];
    if ((isScript || isPreload) && src) found.push(src.replace(/^\//, ''));
  }
  return [...new Set(found)];
}

export function measure(distDir) {
  const html = readFileSync(path.join(distDir, 'index.html'), 'utf8');
  return initialScripts(html).map((file) => ({
    file,
    gzipKb: gzipSync(readFileSync(path.join(distDir, file))).length / 1024,
  }));
}

export function check(distDir, maxKb) {
  const files = measure(distDir);
  const total = files.reduce((sum, f) => sum + f.gzipKb, 0);
  return { files, total, ok: total <= maxKb };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = path.resolve(process.argv[2] ?? 'apps/web/dist');
  const max = Number(process.argv[3] ?? 340);
  const { files, total, ok } = check(dist, max);
  for (const f of files) console.warn(`${f.gzipKb.toFixed(1).padStart(8)} KB gzip  ${f.file}`);
  console.warn(`${total.toFixed(1).padStart(8)} KB gzip  initial JavaScript (budget ${max} KB)`);
  if (!ok) {
    console.error(`x initial JavaScript is ${total.toFixed(1)} KB gzip, over the ${max} KB budget`);
    process.exit(1);
  }
}
