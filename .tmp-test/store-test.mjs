import { build } from 'esbuild';
await build({
  entryPoints: ['/workspace/src/store.ts'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: '/workspace/.tmp-test/store.mjs', treeShaking: false,
  alias: { 'pinia': '/workspace/.tmp-test/pinia-shim.mjs' }
});
