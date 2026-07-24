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
  /**
   * getSource가 정상적으로 null을 돌려준 게 아니라 5초 타임아웃(withTimeout)으로 폴백했음(ADR-0073).
   * store가 이 둘을 구분해, 정상 null은 영구 캐시하되 타임아웃은 제한된 횟수만큼 재시도한다
   * (전이적 경합으로 인한 타임아웃 회복). 타임아웃이 아니면 이 필드 자체를 두지 않는다.
   */
  timedOut?: boolean;
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

// getSource는 내부적으로 sourcemap을 fetch하는데, 이 fetch가 응답 없이 영원히 pending될 수 있다
// (예: 번들러 dev 서버가 특정 sourcemap 요청에 끝내 응답하지 않는 경우 — Turbopack 실사용 중 재현,
// 콘솔 에러 없이 조용히 멈춤). getSource(fiber) 하나가 hang하면(= reject가 아니라 그냥 안 끝나면)
// 이 함수 전체가 한 배열의 Promise.all이라 나머지 fiber까지 전부 "그룹 확인 중"에 영원히 갇힌다
// (실사용 리포트, 2026-07-19). 타임아웃으로 hang한 entry만 null로 폴백시켜 배치 전체를 살린다.
const GET_SOURCE_TIMEOUT_MS = 5000;

// 동시에 진행하는 getSource 최대 개수(ADR-0073). 예전엔 pending 전체를 한 번의 Promise.all로
// 던져 N개의 5초 타임아웃 타이머가 전부 배치 착수 시점(t=0)에 동시 시작했다 — 대형 라우트에서
// 배치 wall-clock이 커지면 큐 뒤쪽 fiber는 실제 sourcemap fetch가 아니라 "자기 차례 대기"만으로
// 5초 예산을 태워 억울하게 타임아웃→null 폴백됐고, 그 null들이 조상 흡수(groups.ts)로 소수 그룹에
// 몰려 "대형 라우트 그룹 급락"으로 나타났다(ADR-0015 백로그 4, ADR-0071이 넣은 타임아웃이 이
// 급락을 세션 내내 sticky하게 만들었다). 동시성을 캡하면 각 fiber의 타이머가 "그 fiber가 실제로
// 착수하는 시점"에 시작돼 5초가 큐 대기가 아니라 진짜 fetch를 재는 예산이 된다. bippy가 sourcemap
// fetch를 파일 단위로 dedup하고(get-source.js의 in-flight j / resolved A 캐시) 브라우저 HTTP/1.1
// 커넥션이 오리진당 ~6이라, 8이면 병렬성을 살리면서 thundering-herd를 막는다.
const GET_SOURCE_CONCURRENCY = 8;

// 순서를 보존하면서 동시 실행 개수를 limit으로 제한하는 async 풀. Promise.all과 달리 N개 작업을
// 한꺼번에 착수시키지 않고, 워커 limit개가 큐를 소진한다 — 각 작업(=각 getSource+타임아웃)이
// "착수될 때" 비로소 시작되는 게 핵심이다.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function resolveGroupHints(compositeFibers: Map<number, Fiber>): Promise<GroupHintResult[]> {
  const entries = [...compositeFibers.entries()];
  return mapWithConcurrency(entries, GET_SOURCE_CONCURRENCY, async ([id, fiber]) => {
    // groupPath는 동기 파싱이라 getSource 실패와 무관하게 먼저 잡아둔다.
    const groupPath = usagePathFromStack((fiber as { _debugStack?: unknown })._debugStack);
    try {
      const source = await withTimeout(getSource(fiber), GET_SOURCE_TIMEOUT_MS);
      if (source === undefined) {
        console.error('[data-layer] getSource timed out', { id, timeoutMs: GET_SOURCE_TIMEOUT_MS });
        return { id, groupHint: null, groupPath, timedOut: true };
      }
      return { id, groupHint: source?.fileName ?? null, groupPath };
    } catch (err) {
      console.error('[data-layer] getSource failed', { id, err });
      return { id, groupHint: null, groupPath };
    }
  });
}
