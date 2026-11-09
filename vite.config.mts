import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Handle __dirname properly in ESM (.mts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json cleanly without modern Node import attribute warnings
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf-8')
);

// Inject version
process.env.VITE_APP_VERSION = packageJson.version;

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    'process.env': process.env,
    'global': 'window',
  },
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@config': path.resolve(__dirname, './src/config'),
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/dist-electron/**',
        '**/release/**',
        '**/.git/**',
      ],
    },
  },
  optimizeDeps: {
    // Stops Vite from getting stuck in dynamic re-optimizing loops
    holdUntilCrawlEnd: false,
    include: [
      'react',
      'react-dom',
      'framer-motion',
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-toast',
    ],
    exclude: ['electron'],
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('framer-motion')
            ) {
              return 'vendor';
            }
            if (
              id.includes('lucide-react') ||
              id.includes('@radix-ui')
            ) {
              return 'ui';
            }
          }
        },
      },
    },
  },
});