import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';

await build({
  entryPoints: { kernel: 'src/kernel.ts', lunar: 'src/api.ts' },
  outdir: 'dist', bundle: true, minify: true, format: 'esm', platform: 'browser',
  target: 'es2022', legalComments: 'none',
});
await build({
  entryPoints: ['server.ts'], outfile: 'dist/server.js', bundle: true,
  format: 'esm', platform: 'node', target: 'node22', legalComments: 'none',
});
mkdirSync('dist/data', { recursive: true });
writeFileSync('dist/package.json', '{"type":"module"}\n');
copyFileSync('data/phases-2001-2100.lph', 'dist/data/phases-2001-2100.lph');
const sizes = Object.fromEntries(['kernel.js', 'lunar.js', 'data/phases-2001-2100.lph'].map(name => {
  const data = readFileSync(`dist/${name}`);
  return [name, { bytes: data.length, gzip: gzipSync(data).length, brotli: brotliCompressSync(data).length }];
}));
writeFileSync('dist/sizes.json', JSON.stringify(sizes, null, 2) + '\n');
console.table(sizes);
