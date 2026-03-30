import * as esbuild from 'esbuild';
import { writeFileSync, chmodSync } from 'node:fs';
import { mkdirSync } from 'node:fs';

mkdirSync('bin', { recursive: true });

await esbuild.build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'bin/arhit-bundle.cjs',
  external: [],
  minify: false,
  sourcemap: false,
});

// Create wrapper script with shebang
writeFileSync('bin/arhit', `#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("./arhit-bundle.cjs");
`, { mode: 0o755 });

chmodSync('bin/arhit', 0o755);

console.log('Bundled to bin/arhit-bundle.cjs + bin/arhit wrapper');
