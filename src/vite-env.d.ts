// Vite 클라이언트 앰비언트 타입 참조 (import.meta.env.DEV 등)
/// <reference types="vite/client" />

// 프론트가 S3로 분리되면서 API가 다른 오리진에 있을 수 있다 (finplay-api ADR-0022).
// 없으면(로컬 dev) 상대경로 '/api'를 그대로 쓴다 — vite.config.ts의 dev 프록시가 동일 오리진으로 만든다.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
