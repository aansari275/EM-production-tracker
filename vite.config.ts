import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Server-only packages — exclude from client bundle
      external: ['mssql', 'pg', 'tedious', 'dotenv'],
    },
  },
  server: {
    port: 5173,
  },
})
