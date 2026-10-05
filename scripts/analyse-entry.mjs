/**
 * Prints the real per-module byte weight of the client entry chunk.
 *
 * Counting identifier references in a minified chunk only estimates weight, so
 * this runs the project's own Vite build and reads the module sizes the bundler
 * reports while writing the entry. The CSS is left in the real pipeline; the
 * question here is JavaScript only.
 *
 *   node scripts/analyse-entry.mjs
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = 'index';

await build({
  root,
  base: '/',
  logLevel: 'error',
  plugins: [
    react(),
    tailwindcss(),
    {
      // `generateBundle` runs while the chunks are still structured, before
      // they are minified into a single string, which is the only point where
      // per-module weights are still visible.
      name: 'report-entry-modules',
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk' || !chunk.isEntry) continue;
          if (chunk.name !== target && !chunk.facadeModuleId?.endsWith('main.tsx')) continue;

          const mods = Object.values(chunk.modules)
            .filter((m) => typeof m.renderedLength === 'number')
            .sort((a, b) => b.renderedLength - a.renderedLength);
          const total = mods.reduce((sum, m) => sum + m.renderedLength, 0);

          console.log(`\nentry ${chunk.fileName}`);
          console.log(`${(total / 1024).toFixed(1)} KB across ${mods.length} modules\n`);

          // Vite 8's module records carry no path, only the emitted code, so
          // each one is identified by matching its source back to the project
          // files. This is a deliberate last resort: the record shape means the
          // bundler has already done the tree-shaking, and the question being
          // answered is only which subsystem is heavy.
          const candidates = [];
          const walk = (dir) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
              if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) walk(full);
              else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) candidates.push(full);
            }
          };
          walk(path.join(root, 'src'));

          const sources = candidates.map((file) => [file, readFileSync(file, 'utf8')]);
          const nameOf = (mod) => {
            let best = null;
            for (const [file, text] of sources) {
              if (!text) continue;
              // A module is identified by the longest distinctive line it
              // contains, which survives minification far better than its name.
              const marker = text
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l.length > 60 && !l.startsWith('//') && !l.startsWith('*'))
                .sort((a, b) => b.length - a.length)[0];
              if (marker && mod.code.includes(marker.slice(20, 90))) {
                if (!best || marker.length > best.marker.length) best = { file, marker };
              }
            }
            return best ? best.file.replace(root, '.').replace(/\\/g, '/') : '(anonymous)';
          };

          let listed = 0;
          for (const mod of mods) {
            if (mod.renderedLength < 1500) continue;
            listed += mod.renderedLength;
            console.log(`  ${(mod.renderedLength / 1024).toFixed(1).padStart(7)} KB  ${nameOf(mod)}`);
          }

          console.log(`\n  modules over 1.5 KB: ${(listed / 1024).toFixed(1)} KB of ${(total / 1024).toFixed(1)} KB`);
        }
      },
    },
  ],
  build: {
    outDir: 'dist-analysis',
    emptyOutDir: true,
    target: 'es2022',
    manifest: false,
    reportCompressedSize: false,
    write: false,
    rollupOptions: {
      output: { chunkFileNames: '[name]-[hash].js', entryFileNames: '[name]-[hash].js' },
    },
  },
});
