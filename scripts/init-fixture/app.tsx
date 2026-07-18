// 주입 대상 앱. react-render-board를 전혀 import 하지 않는다 — 보드가 화면에 뜬다면
// 그것은 번들러 플러그인이 주입한 런타임 진입점 덕분이다(scripts/verify-init.mjs).
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button id="app-counter" onClick={() => setN((v) => v + 1)}>
      count: {n}
    </button>
  );
}

function App() {
  return (
    <main>
      <h1>init fixture app</h1>
      <Counter />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
