import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { createRenderStore } from './data/store';
import { startFiberInspector } from './hooking/fiberInspector';
import { DemoApp } from './fixtures/DemoApp';
import { Canvas } from './visualization/Canvas';

// 계측 대상 앱(subject)과 보드(board)를 별도의 React root로 마운트한다 — 같은 root였다면
// 보드가 자기 자신의 리렌더까지 훅에 걸어 관찰하게 된다 (hooking/fiberInspector.ts 참고).
//
// ?board=off 쿼리 파라미터: 보드(Canvas)를 아예 마운트하지 않는다(계측 자체는 그대로 동작 —
// startFiberInspector/handleCommit은 여전히 실행된다). ADR-0009/0012가 excalidraw 오버레이로
// 썼던 "보드 열림 vs 닫힘" 응답시간 비교 방법론을 자체 fixture에도 그대로 적용하기 위한
// 최소 토글이다 (scripts/verify-high-frequency.mjs, ADR-0013).
const boardEnabled = new URLSearchParams(location.search).get('board') !== 'off';

const appShell = document.getElementById('app-shell')!;
appShell.innerHTML = `
  <header class="app-header">
    <h1>react-render-board — 라이브 MVP</h1>
    <p>왼쪽은 계측 대상 앱(버튼을 눌러보세요), 오른쪽은 실시간 렌더 트리 보드입니다.</p>
  </header>
  <div class="app-split">
    <section class="pane pane--subject">
      <h2>계측 대상 앱</h2>
      <div id="subject-root"></div>
    </section>
    ${boardEnabled ? '<section class="pane pane--board"><div id="board-root"></div></section>' : ''}
  </div>
`;

const subjectContainer = document.getElementById('subject-root')!;

const store = createRenderStore();
startFiberInspector(store, subjectContainer);

createRoot(subjectContainer).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);

if (boardEnabled) {
  const boardContainer = document.getElementById('board-root')!;
  createRoot(boardContainer).render(
    <StrictMode>
      <Canvas store={store} />
    </StrictMode>,
  );
}
