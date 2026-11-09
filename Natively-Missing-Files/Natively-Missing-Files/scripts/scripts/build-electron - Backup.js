#!/usr/bin/env node
/**
 * Fast electron build using esbuild (transpile-only, no type checking).
 * ~10-50x faster than `tsc` for dev builds.
 * Run `npm run typecheck:electron` separately for type safety.
 */

const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'dist-electron');

const entryPoints = [];

// Function to recursively find all .ts files in a directory
const findTs = (dir) => {
  const results = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) results.push(...findTs(full));
    else if (f.name.endsWith('.ts') && !f.name.endsWith('.d.ts')) results.push(full);
  }
  return results;
};

const electronDir = path.resolve(rootDir, 'electron');
if (fs.existsSync(electronDir)) {
  entryPoints.push(...findTs(electronDir).map(f => path.relative(rootDir, f)));
}

// Also include premium electron files if they exist
const premiumDir = path.resolve(rootDir, 'premium/electron');
if (fs.existsSync(premiumDir)) {
  entryPoints.push(...findTs(premiumDir).map(f => path.relative(rootDir, f)));
}

const start = Date.now();

build({
  entryPoints,
  bundle: true,           // resolve all static + dynamic imports so postProcessor
                         // is inlined and the path rewrite works (vs bundle:false
                         // which copies files as-is and leaves unresolved relative paths)
  outdir: outDir,
  outbase: rootDir,       // preserve directory structure (electron/main.ts → dist-electron/electron/main.js)
  platform: 'node',
  target: 'node20',
  format: 'cjs',          // Electron loads package.json main as CommonJS in this repo
                          // (package.json has no "type": "module").
  external: ['electron', 'better-sqlite3', 'keytar', 'sqlite-vec', 'onnxruntime-node'],
  sourcemap: true,
  jsx: 'automatic',
  loader: {
    '.ts': 'ts',
    '.js': 'js',
    '.node': 'copy',
  },
  logLevel: 'warning',
}).then(() => {
  // Copy non-TS assets (capture.py, etc.) from electron/ to dist-electron/
  const copyAssets = (srcDir, destDir) => {
    for (const f of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, f.name);
      const destPath = path.join(destDir, f.name);
      if (f.isDirectory()) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
        copyAssets(srcPath, destPath);
      } else if (!f.name.endsWith('.ts') && !f.name.endsWith('.js') && !f.name.endsWith('.mts') && !f.name.endsWith('.mjs')) {
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };
  copyAssets(electronDir, outDir + '/electron');

  // Copy root ./assets/ to ./dist-electron/assets/ for local ONNX model etc.
  const rootAssetsDir = path.resolve(rootDir, 'assets');
  const destAssetsDir = path.resolve(outDir, 'assets');
  if (fs.existsSync(rootAssetsDir)) {
    if (!fs.existsSync(destAssetsDir)) fs.mkdirSync(destAssetsDir, { recursive: true });
    for (const f of fs.readdirSync(rootAssetsDir, { withFileTypes: true })) {
      const srcPath = path.join(rootAssetsDir, f.name);
      const destPath = path.join(destAssetsDir, f.name);
      if (f.isDirectory()) {
        // Skip icon subdirectories; only copy flat files
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
    }
    console.log(`[build-electron] Copied assets/ -> ${destAssetsDir}`);
  }

  console.log(`[build-electron] Done in ${Date.now() - start}ms`);
}).catch((err) => {
  console.error('[build-electron] Build failed:', err.message);
  process.exit(1);
});
