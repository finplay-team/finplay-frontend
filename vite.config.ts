import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 백엔드에 CORS 설정이 없어 dev 프록시로 같은 origin에서 호출한다.
      // SSE(text/event-stream)도 이 경로를 그대로 통과한다.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
