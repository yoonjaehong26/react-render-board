// 그룹핑 힌트(소스 파일 경로) 비동기 해석 — ADR-0007에서 검증한 대로:
// bippy/source의 getSource(fiber)는 composite fiber 전용, async, dev 빌드 전용이고
// "정의 위치"가 아니라 "그 컴포넌트의 JSX가 렌더(사용)된 파일"을 돌려준다.
//
// getSource는 소스맵 심볼리케이션 과정에서 경로를 파일명만으로 깎는다(Vite 소스맵의 sources가
// ["Foo.tsx"]라 폴더 정보가 원천에 없음). 폴더 단위 그룹핑(ADR-0053)은 파일명 위 폴더가 필요한데,
// 그 전체 경로는 React 19 파이버의 `_debugStack`(owner 스택)에 URL로 살아있다 —
// 예: "at DemoApp (http://localhost:5173/src/fixtures/DemoApp.tsx:106:20)". 이 스택의 첫
// app-source 프레임(node_modules 제외) URL pathname을 뽑아 groupPath로 돌려준다. getSource가
// 돌려주는 groupHint(파일명)와 같은 "사용 위치"를 가리키므로 basename이 일치한다. dev 전용이라
// 얻지 못하면 null → 파일 그룹핑으로 폴백.
import { getSource } from 'bippy/source';
import type { Fiber } from 'bippy';

export interface GroupHintResult {
  id: number;
  groupHint: string | null;
  /** 사용 위치 파일의 전체 경로(폴더 포함, ADR-0053). 못 얻으면 null. */
  groupPath: string | null;
}

/**
 * React 19 파이버의 `_debugStack`(owner 스택 Error)에서 첫 app-source 프레임의 전체 경로를 뽑는다.
 * 스택 프레임은 "at Name (http://host:port/src/…/File.tsx:line:col)" 형태이고, 우리는 node_modules를
 * 건너뛴 첫 소스 파일의 URL pathname(쿼리 제거)을 돌려준다. 순수 함수(테스트 대상). 실패 시 null.
 */
export function usagePathFromStack(debugStack: unknown): string | null {
  const raw =
    debugStack instanceof Error ? debugStack.stack : typeof debugStack === 'string' ? debugStack : null;
  if (!raw) return null;
  for (const line of raw.split('\n')) {
    const m = line.match(/\((https?:\/\/[^)]+)\)/) || line.match(/(https?:\/\/\S+)/);
    if (!m) continue;
    const url = m[1].replace(/:\d+:\d+$/, ''); // 끝의 :line:col 제거
    let pathname: string;
    try {
      pathname = new URL(url).pathname.replace(/\?.*$/, '');
    } catch {
      continue;
    }
    if (pathname.includes('/node_modules/')) continue;
    if (/\.(tsx|jsx|ts|js)$/.test(pathname)) return pathname;
  }
  return null;
}

export async function resolveGroupHints(compositeFibers: Map<number, Fiber>): Promise<GroupHintResult[]> {
  const entries = [...compositeFibers.entries()];
  return Promise.all(
    entries.map(async ([id, fiber]) => {
      // groupPath는 동기 파싱이라 getSource 실패와 무관하게 먼저 잡아둔다.
      const groupPath = usagePathFromStack((fiber as { _debugStack?: unknown })._debugStack);
      try {
        const source = await getSource(fiber);
        return { id, groupHint: source?.fileName ?? null, groupPath };
      } catch (err) {
        console.error('[data-layer] getSource 실패', { id, err });
        return { id, groupHint: null, groupPath };
      }
    }),
  );
}
