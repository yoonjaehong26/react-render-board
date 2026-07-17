import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 데모 앱 빌드(vite.config.ts, src/main.tsx 엔트리)와는 별도의 설정이다. 이 설정은
// src/index.ts가 노출하는 공개 API만 라이브러리로 번들링한다 (docs/project-status.md
// 7-3(b) / ADR-0023 — "실제 npm publish는 스코프 밖, 준비만 한다").
//
// .d.ts 생성은 vite-plugin-dts가 아니라 `tsc -p tsconfig.lib.json --emitDeclarationOnly`로
// 별도 처리한다(package.json의 build:lib 스크립트 참고) — vite-plugin-dts는 이 프로젝트가 쓰는
// rolldown 기반 Vite 8에서 "성공" 로그를 찍고도 .d.ts를 하나도 안 만드는 현상이 실측됐다
// (rollupTypes:true/false 둘 다 재현). tsc 직접 호출은 이미 build 스크립트가 타입체크 게이트로
// 쓰고 있는 안정적인 경로라 이걸 재사용하는 게 더 적은 도구 의존으로 같은 결과를 얻는다.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-lib',
    // tsc가 이 vite build보다 먼저 .d.ts를 dist-lib/에 emit한다(build:lib 스크립트 순서 참고).
    // 기본값(true)이면 vite가 시작할 때 outDir을 비워 방금 만든 .d.ts까지 지워버린다.
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
