import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Custom domain www.rivvra.com — serve from root
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Strip console.log/warn from production builds (keep console.error for debugging)
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          // React + router in their own chunk: it changes only when a
          // dependency is bumped, so returning visitors keep it cached across
          // every app deploy instead of re-downloading it inside index-*.js.
          // `react-dom/client` is its own entry file; without listing it the
          // whole of react-dom rode along in index-*.js (verified on the first
          // deploy: __reactFiber sat in index, vendor-react was 52 KB).
          'vendor-react': ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'react-router', 'react-router-dom', 'scheduler'],
          'vendor-pdf': ['pdfjs-dist'],
          'vendor-excel': ['exceljs'],
          'vendor-charts': ['recharts'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
  esbuild: {
    // Drop console.log/warn and debugger in production, but keep console.error for debugging
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
    pure: process.env.NODE_ENV === 'production' ? ['console.log', 'console.warn', 'console.info', 'console.debug'] : [],
  },
})
