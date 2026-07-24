// 훅킹 레이어 — exp1(fiber-inspector.ts)의 3원칙을 그대로 유지, 콘솔 출력 대신
// 데이터 레이어 스토어(RenderStore)에 커밋을 넘긴다.
//
// 1. devtools-only 실행 — import.meta.env.DEV가 아니면 instrument() 자체를 호출하지 않는다.
// 2. 재귀 순회 가드 — 데이터 레이어(serializeFiberTree)가 깊이 제한 + 방문 노드 캐시로 처리.
// 3. 커밋 시점 훅 — onCommitFiberRoot 콜백 안에서만 root.current를 읽는다.
//
// 에러 가드: bippy 0.6.0에는 secure()가 없다(ADR-0005, ADR-0002 프로젝트 규칙) — 콜백을
// 직접 try/catch로 감싼다.
//
// exp1에는 없던 결정 (ADR-0008): 이 라이브 MVP는 계측 대상 앱(subject)과 그 결과를
// 그리는 보드(board)를 같은 페이지, 같은 devtools 훅 아래 함께 띄운다. `instrument()`는
// 훅 하나를 페이지 전체에 건다 — 보드 자신도 React로 만들어졌으므로 필터링 없이는
// 보드가 자기 자신의 커밋까지 관찰 대상으로 삼아버린다. `containerInfo`(FiberRoot가
// createRoot에 넘긴 DOM 컨테이너를 들고 있는 필드, bippy 타입에는 `any`로만 나오지만
// React 내부 구조상 항상 존재)로 "관찰 대상 root"만 골라낸다.
import { instrument, type FiberRoot } from 'bippy';
import type { RenderStore } from '../data/store';
import { isDevEnvironment } from './devEnvironment';

export function startFiberInspector(store: RenderStore, subjectContainer: Element): () => void {
  // ADR-0067 버그 수정: import.meta.env.DEV는 이 파일이 라이브러리로 빌드될 때(`build:lib`,
  // 순수 프로덕션 vite build) 정적으로 false가 되어 이 함수가 죽은 코드로 트리셰이킹된다 —
  // 라이브러리 API로 startFiberInspector를 직접 쓰는 소비자(src/index.ts 문서화된 사용법)에게
  // 영향. isDevEnvironment()는 import.meta를 참조하지 않는 __RRB_DEV__ 체크를 우선한다.
  if (!isDevEnvironment()) {
    return () => {};
  }

  const unsubscribe = instrument({
    name: 'react-render-board',
    onCommitFiberRoot(_rendererID: number, root: FiberRoot) {
      const containerInfo = (root as { containerInfo?: unknown } | null)?.containerInfo;
      if (containerInfo !== subjectContainer) return; // 보드 자신을 포함한 다른 root는 무시.

      try {
        store.handleCommit(root.current);
      } catch (err) {
        console.error('[hooking] error while handling a commit', err);
      }
    },
  });

  console.log('[hooking] react-render-board fiber inspector started (dev-only)');
  return unsubscribe;
}
