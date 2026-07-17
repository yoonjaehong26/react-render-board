// 데이터 레이어 스키마 (docs/architecture.md "데이터 레이어" 확정안 + ADR-0007로 구체화됨).
// 시각화 레이어 전체가 이 타입에 의존하므로 되돌리기 어려운 결정이다.
export type FiberKind = 'host' | 'composite';

export interface RenderNode {
  id: number;
  displayName: string;
  kind: FiberKind;
  parentId: number | null;
  /**
   * "이 컴포넌트의 JSX가 렌더(사용)된 파일" 경로 (ADR-0007이 고정한 의미 — 정의 위치 아님).
   * dev 빌드 전용, bippy `getSource`가 비동기이므로 커밋 시점엔 null일 수 있고 이후 갱신된다.
   * host 노드에는 애초에 의미가 없어 항상 null.
   */
  groupHint: string | null;
}

export interface RenderSnapshot {
  commitId: number;
  nodes: RenderNode[];
}
