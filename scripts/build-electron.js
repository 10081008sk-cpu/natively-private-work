#!/usr/bin/env node
/**
 * Fast electron build using esbuild (transpile-only, no type checking).
 * ~10-50x faster than `tsc` for dev builds.
 * Run `npm run typecheck:electron` separately for type safety.
 * 
 * Incremental asset copying: only copies files that are missing or newer than
 * the destination. Heavy assets (Python scripts, models) are skipped in dev
 * mode to keep startup fast.
 */

const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'dist-electron');
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

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

// Helper: copy file only if dest missing or src newer than dest
const copyIfChanged = (srcPath, destPath) => {
  try {
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      return true;
    }
    const srcMtime = fs.statSync(srcPath).mtimeMs;
    const destMtime = fs.statSync(destPath).mtimeMs;
    if (srcMtime > destMtime) {
      fs.copyFileSync(srcPath, destPath);
      return true;
    }
  } catch (e) {
    // If stat fails, try copying anyway
    try { fs.copyFileSync(srcPath, destPath); return true; } catch {}
  }
  return false;
};

build({
  entryPoints,
  bundle: true,
  outdir: outDir,
  outbase: rootDir,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'sharp','better-sqlite3', 'keytar', 'sqlite-vec', 'onnxruntime-node', 'sherpa-onnx-node', '*.node'],
  sourcemap: true,
  jsx: 'automatic',
  loader: {
    '.ts': 'ts',
    '.js': 'js',
  },
  logLevel: 'warning',
}).then(() => {
  // Copy non-TS assets (capture.py, etc.) from electron/ to dist-electron/
  // In dev mode, skip heavy Python/model files; only copy small config/scripts
  const copyAssets = (srcDir, destDir) => {
    for (const f of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, f.name);
      const destPath = path.join(destDir, f.name);
      if (f.isDirectory()) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
        copyAssets(srcPath, destPath);
      } else if (!f.name.endsWith('.ts') && !f.name.endsWith('.js') && !f.name.endsWith('.mts') && !f.name.endsWith('.mjs')) {
        // In dev mode, skip heavy binary/model files
        if (isDev && (f.name.endsWith('.onnx') || f.name.endsWith('.bin') || f.name.endsWith('.pb') || f.name.endsWith('.pt'))) {
          console.log(`[build-electron] Skipping heavy asset in dev: ${f.name}`);
          continue;
        }
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        copyIfChanged(srcPath, destPath);
      }
    }
  };
  copyAssets(electronDir, outDir + '/electron');
  console.log('[build-electron] Synced Electron assets (incremental)');

  // Copy root ./assets/ to ./dist-electron/assets/ for local ONNX model etc.
  // In dev mode, skip heavy model files; only copy small config/icons
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
      // In dev mode, skip heavy model files
      if (isDev && (f.name.endsWith('.onnx') || f.name.endsWith('.bin') || f.name.endsWith('.pb') || f.name.endsWith('.pt'))) {
        console.log(`[build-electron] Skipping heavy asset in dev: ${f.name}`);
        continue;
      }
      copyIfChanged(srcPath, destPath);
    }
    console.log(`[build-electron] Synced assets/ -> ${destAssetsDir}`);
  }

  console.log(`[build-electron] Done in ${Date.now() - start}ms`);
}).catch((err) => {
  console.error('[build-electron] Build failed:', err.message);
  process.exit(1);
});
