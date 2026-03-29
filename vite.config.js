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
