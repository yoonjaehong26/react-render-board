/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // experiments/·scripts/init-fixture 아래엔 검증용으로 clone한 서드파티 앱이 자기 자신의
    // index.html + node_modules를 갖고 있다 — 기본 스캔이 루트부터 이들까지 훑다 exports 필드
    // 불일치로 깨지는 것을 막기 위해 진입점을 이 앱 자신의 index.html로 한정한다.
    entries: ['index.html'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // experiments/ 아래에는 검증용으로 clone한 제3자 앱(shadcn-admin 등)이 자기 자신의 테스트
    // 스위트를 통째로 갖고 있다 — 기본 include 패턴이 그것까지 주워가지 않도록 src/만 스캔한다.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
