/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // experiments/ 아래에는 검증용으로 clone한 제3자 앱(shadcn-admin 등)이 자기 자신의 테스트
    // 스위트를 통째로 갖고 있다 — 기본 include 패턴이 그것까지 주워가지 않도록 src/만 스캔한다.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
