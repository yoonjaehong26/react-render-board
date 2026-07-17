// 그룹핑 힌트(소스 파일 경로) 비동기 해석 — ADR-0007에서 검증한 대로:
// bippy/source의 getSource(fiber)는 composite fiber 전용, async, dev 빌드 전용이고
// "정의 위치"가 아니라 "그 컴포넌트의 JSX가 렌더(사용)된 파일"을 돌려준다.
import { getSource } from 'bippy/source';
import type { Fiber } from 'bippy';

export interface GroupHintResult {
  id: number;
  groupHint: string | null;
}

export async function resolveGroupHints(compositeFibers: Map<number, Fiber>): Promise<GroupHintResult[]> {
  const entries = [...compositeFibers.entries()];
  return Promise.all(
    entries.map(async ([id, fiber]) => {
      try {
        const source = await getSource(fiber);
        return { id, groupHint: source?.fileName ?? null };
      } catch (err) {
        console.error('[data-layer] getSource 실패', { id, err });
        return { id, groupHint: null };
      }
    }),
  );
}
