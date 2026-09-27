import { build } from 'esbuild';
await build({
  entryPoints: ['/workspace/src/scheduler.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '/workspace/.tmp-test/scheduler.mjs'
});
