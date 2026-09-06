#!/usr/bin/env node
// Dev-only entrypoint: runs the TypeScript source directly via tsx, without
// requiring a build step. The published package's real bin is
// dist/index.js (see package.json "bin"), built by `npm run build`.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcEntry = path.join(__dirname, '..', 'src', 'index.ts');

const child = spawn('npx', ['tsx', srcEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
