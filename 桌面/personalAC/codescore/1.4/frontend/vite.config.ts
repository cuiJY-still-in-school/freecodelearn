import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/download': { target: 'http://localhost:3000', changeOrigin: true },
    }
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // KaTeX 独立无循环依赖，单独 chunk
          if (id.includes('node_modules/katex')) {
            return 'vendor-katex'
          }
          // marked + highlight 独立，单独 chunk
          if (id.includes('node_modules/marked') || id.includes('node_modules/highlight')) {
            return 'vendor-md'
          }
          // 其余所有 node_modules 不做 manual 分包，由 Vite 自动处理
          // 避免 vendor-react/vendor-diagram/vendor-misc 之间的循环 chunk 依赖
        }
      }
    }
  }
})
