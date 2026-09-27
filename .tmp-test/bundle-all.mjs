import { build } from 'esbuild';
await build({
  entryPoints: ['/workspace/src/store.ts', '/workspace/src/storage.ts'],
  bundle: true, format: 'esm', platform: 'node',
  outdir: '/workspace/.tmp-test/out', treeShaking: false,
  alias: { 'pinia': '/workspace/.tmp-test/pinia-shim.mjs' }
});
