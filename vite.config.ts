import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * Furtu build configuration.
 *
 * Two builds run in sequence: a client build, then a server build of
 * `entry-server.tsx` which the prerenderer imports. The prerender step is not
 * part of Vite, because it has to read the client build's manifest to discover
 * the hashed CSS and JS filenames.
 *
 * `manualChunks` is the important part: each engine is its own chunk, so
 * pdf-lib and pdf.js only reach a visitor who opens a PDF tool.
 */
export default defineConfig(({ mode }) => {
  const isSsr = process.env.FURTU_SSR === '1';
  const dev = mode === 'development';

  return {
    base: '/',
    appType: isSsr ? 'custom' : 'spa',
    build: {
      outDir: isSsr ? 'dist-ssr' : 'dist',
      emptyOutDir: !isSsr,
      sourcemap: dev ? 'inline' : false,
      // The prerenderer needs to know the hashed output filenames.
      manifest: !isSsr,
      target: 'es2022',
      rollupOptions: {
        output: isSsr
          ? { format: 'esm', entryFileNames: 'entry-server.js' }
          : {
              /**
               * Without this, the bundler hoists modules shared between the
               * entry and several dynamic imports into the entry itself — which
               * put the whole text engine into the first-load bundle. Naming the
               * chunks explicitly keeps the initial payload to React, the app
               * shell and the one page the visitor actually asked for.
               */
              manualChunks(id) {
                if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
                if (id.includes('pdf-lib')) return 'vendor-pdf-lib';
                if (id.includes('node_modules/js-yaml')) return 'vendor-yaml';
                if (id.includes('node_modules/qrcode')) return 'vendor-qrcode';
                if (id.includes('node_modules/fflate')) return 'vendor-zip';

                // The engine operation modules. Each engine is imported
                // dynamically, so naming them explicitly keeps the pairing
                // between an operation module and its vendor library obvious in
                // the build output without pulling any of it into the entry.
                if (id.includes('engines/ops/')) return undefined;
                if (id.includes('engines/loader')) return 'engine-loader';
                return undefined;
              },
            },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: Number.parseInt(process.env.PORT || '8443', 10),
      strictPort: true,
    },
    preview: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: Number.parseInt(process.env.PORT || '8443', 10),
    },
    // pdf.js ships a worker that Vite must treat as an asset rather than a module.
    worker: { format: 'es' },
  };
});
