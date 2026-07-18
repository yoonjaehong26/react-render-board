// react-render-board — Vite dev 서버 자동 주입 플러그인 (1순위 타깃, ADR-0020/0021/0036).
//
// 사용자의 vite.config.ts `plugins` 배열에 이 플러그인 한 줄을 추가하면(수동 또는
// `npx react-render-board init`), 앱 소스(src/*.tsx, index.html)를 단 한 줄도 안 건드리고
// dev 서버가 서빙하는 HTML의 <head>에 보드 런타임 진입점(react-render-board/inject)을
// 로드하는 <script type="module">이 자동 주입된다.
//
// 검증 근거(ADR-0021, experiments/bundler-injection-spike/vite/):
// - transformIndexHtml은 이 유스케이스를 위해 설계된 Vite 1급 공개 API다(워크어라운드 0).
// - injectTo:'head-prepend'가 문서상 "정확히 맨 앞"은 아니지만, 실행 순서를 좌우하는 진짜
//   변수는 "태그 위치"가 아니라 "module이냐 classic이냐"였다. 우리 진입점은 module이라
//   defer 실행되지만, 보드는 대상 앱 커밋을 놓쳐도 되는 게 아니다 — bippy instrument가
//   대상 앱 root보다 먼저 훅을 걸어야 한다. head에 먼저 놓인 우리 module은 body 끝의 앱
//   진입 module보다 문서 순서상 앞서 실행되므로 이 순서가 지켜진다.
//
// dev 전용(요구사항 3, React-Sight가 죽은 지점): apply:'serve'로 프로덕션 빌드엔 아예
// 주입하지 않는다. 런타임 진입점(src/inject.tsx)도 import.meta.env.DEV 가드를 겹으로 둔다.

const DEFAULT_ENTRY = 'react-render-board/inject';
const DEFAULT_STYLE = 'react-render-board/style.css';

/**
 * @param {{ entry?: string }} [options]
 *   entry — 주입할 보드 런타임 모듈 지정자. 기본값은 npm 패키지 진입점
 *   'react-render-board/inject'. 로컬 개발/검증 시에는 프로젝트 루트 기준 경로
 *   (예: '/src/inject.tsx')나 npm alias로 바꿔 끼울 수 있다.
 * @returns {import('vite').Plugin}
 */
export function rrbInjectPlugin(options = {}) {
  const entry = options.entry ?? DEFAULT_ENTRY;

  return {
    name: 'react-render-board:inject',
    // 프로덕션 빌드(`vite build`)에는 관여하지 않는다 — dev 서버(serve)에서만 주입.
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            // dev 신호를 동기(classic)로 먼저 세운다 — module import보다 앞서 실행되므로
            // 런타임(react-render-board/inject)이 부팅 시 이 플래그를 본다. 이 플러그인은
            // apply:'serve'라 프로덕션 빌드엔 아예 안 들어가므로, 플래그도 dev에서만 선다.
            tag: 'script',
            injectTo: 'head-prepend',
            children: 'window.__RRB_DEV__ = true;',
          },
          {
            tag: 'script',
            injectTo: 'head-prepend',
            attrs: { type: 'module' },
            // 인라인 module 스크립트의 bare/루트-상대 import는 Vite dev가 그 자리에서
            // 재작성·해석한다(별도 <script src> 파일 불필요). static import라 동기 실행돼
            // 대상 앱 커밋보다 먼저 훅을 건다.
            // style.css도 같은 module에서 import해 Vite dev의 CSS 처리(<style> 주입)에
            // 태운다 — 별도 <link> 태그는 대상 앱 index.html이 최종 인라인 script보다
            // 늦게 붙는 경우 순서를 보장할 수 없어 module import 쪽이 더 안전하다.
            children: `import ${JSON.stringify(entry)};\nimport ${JSON.stringify(DEFAULT_STYLE)};`,
          },
        ];
      },
    },
  };
}

export default rrbInjectPlugin;
