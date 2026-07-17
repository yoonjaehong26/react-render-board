import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { createRenderStore } from './data/store';
import { startFiberInspector } from './hooking/fiberInspector';
import { startDomClickBridge } from './hooking/domInteraction';
import { createInteractionStore } from './visualization/lib/interactionStore';
import { DemoApp } from './fixtures/DemoApp';
import { BoardOverlay } from './visualization/BoardOverlay';

// 계측 대상 앱(subject)과 보드(board)를 별도의 React root로 마운트한다 — 같은 root였다면
// 보드가 자기 자신의 리렌더까지 훅에 걸어 관찰하게 된다 (hooking/fiberInspector.ts 참고).
//
// ADR-0020/ADR-0024/0025: 보드는 왼쪽 고정 패널이 아니라 플로팅 버튼 + 전체화면 포탈
// 오버레이다(BoardOverlay.tsx) — 계측 대상 앱은 항상 화면 전체를 그대로 쓴다.
//
// ?board=off 쿼리 파라미터: BoardOverlay 자체를 마운트하지 않는다(계측 자체는 그대로 동작 —
// startFiberInspector/handleCommit은 여전히 실행된다). ADR-0009/0012가 excalidraw 오버레이로
// 썼던 "보드 열림 vs 닫힘" 응답시간 비교 방법론을 자체 fixture에도 그대로 적용하기 위한
// 최소 토글이다 (scripts/verify-high-frequency.mjs, ADR-0013).
const boardEnabled = new URLSearchParams(location.search).get('board') !== 'off';

const appShell = document.getElementById('app-shell')!;
appShell.innerHTML = `
  <header class="app-header">
    <h1>react-render-board — 라이브 MVP</h1>
    <p>우측 하단 버튼을 눌러 실시간 렌더 트리 보드를 열 수 있습니다. 보드 안에서 노드를 클릭하면
       실제 화면 요소가 하이라이트되고, 실제 화면 요소를 클릭하면 보드가 열리며 해당 노드로
       이동합니다.</p>
  </header>
  <div id="subject-root" class="subject-root"></div>
`;

const subjectContainer = document.getElementById('subject-root')!;

const store = createRenderStore();
const interactionStore = createInteractionStore();
startFiberInspector(store, subjectContainer);

createRoot(subjectContainer).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);

if (boardEnabled) {
  startDomClickBridge(subjectContainer, interactionStore);

  const overlayHost = document.createElement('div');
  overlayHost.id = 'board-overlay-root';
  document.body.appendChild(overlayHost);

  createRoot(overlayHost).render(
    <StrictMode>
      <BoardOverlay store={store} interactionStore={interactionStore} />
    </StrictMode>,
  );
}
