// exp1(fiber-inspector.ts)이 실제로 뽑아낸 FiberNodeJSON 모양을 그대로 따른다.
// 차이점: architecture.md의 데이터 레이어 초안에 있는 "그룹핑 힌트"(소스 파일/도메인)를
// exp1은 아직 뽑지 않으므로, exp2에서는 fixture 데이터에 group을 직접 채워 넣어 흉내낸다.
export type FiberKind = 'host' | 'composite';

export interface RawFiberNode {
  id: number;
  displayName: string;
  kind: FiberKind;
  parentId: number | null;
  group: string;
}
