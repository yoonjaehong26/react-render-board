// react-render-board — Next.js / Turbopack 자동 주입 (ADR-0021/0036).
//
// Turbopack엔 HTML 주입 플러그인 API가 없다(ADR-0021, 공식 문서로 확인). 그리고 ADR-0021
// 스파이크가 실측한 반직관적 결과: "정석"으로 보이는 instrumentation-client.ts / 클라이언트
// useEffect import는 Next의 Fast-Refresh 런타임이 __REACT_DEVTOOLS_GLOBAL_HOOK__ 슬롯을
// 먼저 선점해 **타이밍 경쟁에서 진다**. 반대로 가장 오래된 방식 — 루트 layout의 <head>에
// 심은 동기 <script> — 가 문서 파싱 순서상 Next/React 번들보다 먼저 실행돼 **이긴다**.
//
// 그래서 이 어댑터는 그 검증된 메커니즘을 정식 코드로 옮긴다: app/layout.tsx의 <head>에
// (없으면 <head>째) 조기 실행 <script>를 삽입한다 — 대상 앱의 page/컴포넌트 소스는 안 건드림.
//
// dev 전용 가드(요구사항 3): 삽입한 <script>를 `process.env.NODE_ENV !== 'production'`
// JSX 조건으로 감싼다. Next가 빌드 시 process.env.NODE_ENV를 정적 치환하므로 프로덕션
// 번들엔 스크립트가 아예 안 들어간다("빌드에 안 들어감"). 런타임(react-render-board/inject)도
// import.meta.env 가드를 겹으로 가진다.

import { createHash } from 'node:crypto';
import { EARLY_HOOK_SCRIPT_BODY } from './early-hook-script.cjs';

// 삽입 여부/멱등성 판별용 마커.
export const RRB_NEXT_MARKER = 'data-rrb-inject';

// 조기 스크립트 본문의 내용 해시(마커 값). layout.tsx에 스크립트 전문이 박제되므로, 패키지가
// 업데이트돼 스크립트가 바뀌어도 마커 존재 여부만 보면 "이미 설정됨"으로 스킵돼 구버전이 영구히
// 남는다(ADR-0070에서 실사용 stale 스크립트로 확인 — 훅 wrap 수정이 layout에 안 흘러들어감).
// 마커 값에 이 해시를 박아, 스크립트가 바뀌면 마커도 달라지므로 init(및 postinstall 자동 실행)이
// 구버전을 감지해 갱신한다. 내용이 안 바뀐 버전업에선 해시가 같아 불필요한 재작성을 안 한다.
export const SCRIPT_HASH = createHash('sha256').update(EARLY_HOOK_SCRIPT_BODY).digest('hex').slice(0, 8);

const DEFAULT_ENTRY = 'react-render-board/inject';

// <head>에 심는 조기 실행 스크립트 본문(classic, 동기). 하는 일:
//  1) React/Next보다 먼저 __REACT_DEVTOOLS_GLOBAL_HOOK__를 심어 초기 커밋부터 관찰(타이밍 승리).
//  2) 플로팅 버튼을 즉시 띄운다(연결 확인용 UI).
//
// 왜 여기서 실제 보드(react-render-board/inject)를 로드하지 않는가: 브라우저의 네이티브
// import()는 번들러 없이 bare 지정자('react-render-board/inject')를 해석하지 못하고, Next는
// 이 인라인 <head> 스크립트를 번들 대상으로 잡지 않는다. 따라서 Turbopack에서 "실제 보드
// 캔버스"까지 띄우려면 layout에 별도의 번들된 클라이언트 컴포넌트를 추가해야 한다(ADR-0036
// 참고 — 프레임워크 버전 취약, 다음 라운드). 이 조기 스크립트가 검증·보장하는 것은 ADR-0021이
// 실측한 그 지점 — "Turbopack에서도 앱 소스 무수정으로 훅이 초기 커밋부터 걸리고 진입 UI가
// 뜬다"는 연결 방식 자체다.
function buildInlineScript() {
  return EARLY_HOOK_SCRIPT_BODY;
}

// 우리가 심는 가드+스크립트 블록. 마커 값에 SCRIPT_HASH를 박아 버전 드리프트를 감지 가능하게 한다.
const scriptJsx =
  `{process.env.NODE_ENV !== 'production' && (\n` +
  `        <script ${RRB_NEXT_MARKER}="${SCRIPT_HASH}" dangerouslySetInnerHTML={{ __html: \`${buildInlineScript()}\` }} />\n` +
  `      )}`;

// 기존에 심긴(구버전 포함) rrb 스크립트 블록을 찾는 정규식. 우리 가드(`&& (` 뒤 `<script
// data-rrb-inject`)에만 매칭되고 RenderBoardClient 렌더(`&& <RenderBoardClient />`)엔 안 걸린다.
// 스크립트 본문엔 `/>`가 없어 비탐욕 매칭이 스크립트의 자기닫힘에서 정확히 끝난다. 마커 값
// (해시/빈값) 무관하게 매칭돼 구형 `data-rrb-inject=""`도 잡는다.
const STALE_BLOCK_RE =
  /\{process\.env\.NODE_ENV !== 'production' && \(\s*<script data-rrb-inject[\s\S]*?\/>\s*\)\}/;

// layout.tsx 소스 문자열에 조기 스크립트를 삽입(또는 구버전이면 갱신)한 새 문자열을 돌려준다
// (순수 함수, 멱등). 반환: { changed, source, reason }.
export function patchNextLayout(source) {
  // 최신 마커(현재 해시)가 이미 있으면 최신 상태 — 아무것도 안 한다.
  if (source.includes(`${RRB_NEXT_MARKER}="${SCRIPT_HASH}"`)) {
    return { changed: false, source, reason: 'already-patched' };
  }
  // 마커는 있는데 해시가 다르면(또는 구형 빈 마커면) 구버전 — 그 블록만 최신으로 교체한다.
  if (STALE_BLOCK_RE.test(source)) {
    return {
      changed: true,
      reason: 'refreshed-script',
      source: source.replace(STALE_BLOCK_RE, scriptJsx),
    };
  }

  // 1) <head>가 있으면 여는 태그 바로 뒤에 삽입(가장 이른 실행 위치).
  if (/<head\s*>/.test(source)) {
    return {
      changed: true,
      reason: 'inserted-into-head',
      source: source.replace(/<head\s*>/, (m) => `${m}\n        ${scriptJsx}`),
    };
  }

  // 2) <head>가 없으면 <html ...> 여는 태그 뒤에 <head>째 삽입.
  const htmlOpen = source.match(/<html\b[^>]*>/);
  if (htmlOpen) {
    const headBlock = `\n      <head>\n        ${scriptJsx}\n      </head>`;
    return {
      changed: true,
      reason: 'inserted-head-block',
      source: source.replace(htmlOpen[0], (m) => `${m}${headBlock}`),
    };
  }

  return { changed: false, source, reason: 'no-html-tag' };
}

// `react-render-board init`이 생성하는 클라이언트 컴포넌트. layout <head>의 조기 스크립트가
// 훅을 걸고 초기 커밋을 버퍼링하는 사이, 이 컴포넌트가 하이드레이션 후 실제 보드 런타임과
// 스타일을 클라이언트에서만 동적 로드한다 — 런타임이 버퍼를 재생해 캔버스에 트리를 그린다.
// dev에서만 렌더되므로(layout의 process.env.NODE_ENV 가드) 프로덕션엔 실행되지 않는다.
export const RENDER_BOARD_CLIENT_SOURCE = `'use client';
// 자동 생성: npx react-render-board init (지우면 보드 캔버스가 안 뜹니다)
import { useEffect } from 'react';

export default function RenderBoardClient() {
  useEffect(() => {
    Promise.all([
      import('react-render-board/style.css'),
      import('react-render-board/inject'),
    ]).catch((err) => console.error('[react-render-board] 런타임 로드 실패', err));
  }, []);
  return null;
}
`;

// layout 소스에 RenderBoardClient import + dev 전용 렌더를 얹는다(멱등). patchNextLayout이
// <head> 조기 스크립트를 넣은 뒤 이걸 이어서 호출한다. 반환: { changed, source, reason }.
export function wireCanvasIntoLayout(source) {
  if (source.includes('RenderBoardClient')) {
    return { changed: false, source, reason: 'already-wired' };
  }
  if (!/<\/body>/.test(source)) {
    return { changed: false, source, reason: 'no-body-tag' };
  }
  const importStmt = "import RenderBoardClient from './RenderBoardClient';\n";
  let out = /export\s+default/.test(source)
    ? source.replace(/export\s+default/, `${importStmt}export default`)
    : importStmt + source;
  out = out.replace(
    /<\/body>/,
    `  {process.env.NODE_ENV !== 'production' && <RenderBoardClient />}\n      </body>`,
  );
  return { changed: true, source: out, reason: 'wired-canvas' };
}

// init 안내/폴백에서 쓰는 수동 스니펫(자동 패치 실패 시).
export function manualSnippet(entry = DEFAULT_ENTRY) {
  return (
    `app/layout.tsx의 <html> 안 <head>에 아래를 추가하세요(없으면 <head>째):\n` +
    `  {process.env.NODE_ENV !== 'production' && (\n` +
    `    <script ${RRB_NEXT_MARKER}="" dangerouslySetInnerHTML={{ __html: /* ${entry} 부팅 스크립트 */ }} />\n` +
    `  )}`
  );
}
