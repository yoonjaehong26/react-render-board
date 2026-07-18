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
  /**
   * groupHint와 같은 "사용 위치" 파일의 전체 경로(폴더 포함) — 폴더 단위 그룹핑(ADR-0053)이 쓴다.
   * React 19 파이버 `_debugStack`에서 파싱한다(sourceHints.ts). dev 전용, 못 얻으면 null.
   * basename은 groupHint와 일치한다(둘 다 사용 위치).
   */
  groupPath?: string | null;
}

export interface RenderSnapshot {
  commitId: number;
  nodes: RenderNode[];
}
