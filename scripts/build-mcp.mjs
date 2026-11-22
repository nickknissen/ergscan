// Bundles the MCP server and the app code it uses into mcp/dist/ergscan-mcp.js for the npm package.
// Packages stay external and are installed from mcp/package.json, so their licences ship with them.
import { build } from 'esbuild';
import { copyFile, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('mcp/package.json', root), 'utf8'));

const result = await build({
  absWorkingDir: root.pathname,
  entryPoints: ['mcp/main.ts'],
  outfile: 'mcp/dist/ergscan-mcp.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
  define: { __ERGSCAN_MCP__: JSON.stringify({ name: pkg.name, version: pkg.version }) },
  metafile: true,
  logLevel: 'warning',
});

// Every package the bundle imports must be a dependency of the published package.
const builtins = new Set(builtinModules);
const imported = new Set(
  Object.values(result.metafile.outputs).flatMap((output) => output.imports)
    .filter((entry) => entry.external)
    .map((entry) => entry.path)
    .filter((path) => !path.startsWith('node:') && !builtins.has(path))
    .map((path) => path.split('/').slice(0, path.startsWith('@') ? 2 : 1).join('/')),
);
const missing = [...imported].filter((name) => !pkg.dependencies?.[name]);
if (missing.length) {
  console.error(`mcp/package.json is missing dependencies the bundle imports: ${missing.join(', ')}`);
  process.exit(1);
}

await copyFile(new URL('LICENSE', root), new URL('mcp/LICENSE', root));
console.log(`Built mcp/dist/ergscan-mcp.js (${pkg.name}@${pkg.version}), importing ${[...imported].sort().join(', ')}`);
