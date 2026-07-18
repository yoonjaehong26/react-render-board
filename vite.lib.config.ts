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
      // index = 라이브러리 공개 API(수동 배선용). inject = 번들러 플러그인이 주입하는
      // 자기부팅 런타임 진입점(ADR-0034, react-render-board/inject).
      entry: { index: 'src/index.ts', inject: 'src/inject.tsx' },
      formats: ['es'],
      // 다중 entry로 바꾸면 Vite가 단일 CSS 번들을 패키지명(react-render-board.css)으로
      // 내보내, package.json exports의 "./style.css" → ./dist-lib/index.css 계약이 깨진다.
      // cssFileName으로 기존 index.css 이름을 유지한다.
      cssFileName: 'index',
    },
      // 선언된 의존(package.json dependencies)은 번들에 넣지 않고 external로 둔다 — 라이브러리는
      // 자기 deps를 소비자 번들러가 해석하게 맡기는 게 정석이고, 이렇게 해야 산출물이 다른
      // 번들러(Turbopack)로 재번들 가능해진다. rolldown(Vite 8)이 CJS 의존(scheduler·bippy)을
      // 번들하면 `typeof require !== 'u' ? require : Proxy` CJS interop 셰임을 심는데, 그 산출물을
      // Turbopack이 재번들하면 requireStub이 던진다(ADR-0036 실측). deps를 external로 빼면 셰임 자체가
      // 사라진다. react는 peerDependency, scheduler는 react-dom의 전이 의존이라 소비자에 이미 있다.
    rollupOptions: {
      external: [
        'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'scheduler',
        'bippy', '@xyflow/react', 'roughjs',
      ],
    },
  },
});
