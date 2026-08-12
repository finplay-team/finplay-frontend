import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 백엔드가 이제 CORS를 지원하지만(finplay-api ADR-0022), 로컬 dev는 여전히 이 프록시로
      // 동일 오리진을 유지한다 — VITE_API_BASE_URL을 비워 두면(.env.example 참고) 상대경로 '/api'가
      // 이 프록시를 그대로 탄다. SSE(text/event-stream)도 이 경로를 그대로 통과한다.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
