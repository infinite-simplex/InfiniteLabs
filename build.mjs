// Builds the deployable index.html from index.src.html.
//
// index.src.html links styles.css and script.js normally, so it works as-is on a
// static server for development (open /index.src.html). This script minifies both
// and inlines them (plus the VT323 font, as a data URI) into index.html, so the
// first paint needs a single request instead of a chain of them. index.html is a
// generated file that gets committed; run `npm run build` after editing the
// source, CSS or JS.
import { build, transform } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const CSS_TAG = '<link rel="stylesheet" href="styles.css">';
const JS_TAG = '<script src="script.js" defer></script>';

const html = await readFile('index.src.html', 'utf8');
for (const tag of [CSS_TAG, JS_TAG]) {
    if (!html.includes(tag)) throw new Error(`index.src.html is missing: ${tag}`);
}

// Bundling resolves url(fonts/vt323.woff2) and inlines it as a data URI.
const css = (await build({
    entryPoints: ['styles.css'],
    bundle: true,
    minify: true,
    write: false,
    loader: { '.woff2': 'dataurl' },
})).outputFiles[0].text.trim();

// Not bundled: script.js is a classic script whose top-level names are globals
// (inline onclick handlers and project modules rely on them), which esbuild
// leaves alone outside bundle/module mode.
const js = (await transform(await readFile('script.js', 'utf8'), { minify: true })).code.trim();

const guard = (code) => code.replace(/<\/(script|style)/gi, '<\/$1');

const out = html
    .replace(CSS_TAG, () => `<style>${guard(css)}</style>`)
    // At the end of <body> so the DOM exists when it runs (inline scripts can't defer).
    .replace(JS_TAG, '')
    .replace('</body>', () => `<script>${guard(js)}</script>\n</body>`);

await writeFile('index.html', out);
console.log(`index.html: ${(out.length / 1024).toFixed(1)} KB (css ${(css.length / 1024).toFixed(1)} KB, js ${(js.length / 1024).toFixed(1)} KB)`);
