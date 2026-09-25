import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Production builds carry no console output and no debugger statements, from the app or from libraries, so the
// browser console shows nothing about how the app works or what it is doing. (Development keeps them.)
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
}))
