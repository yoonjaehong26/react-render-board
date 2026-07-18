import { describe, it, expect } from 'vitest';
import { shouldSuppressMapModeDetail, SMALL_TREE_NODE_THRESHOLD } from './mapModeDetail';

describe('shouldSuppressMapModeDetail', () => {
  it('맵 모드가 아니면 노드 수와 무관하게 억제하지 않는다', () => {
    expect(shouldSuppressMapModeDetail(false, false, 10_000)).toBe(false);
  });

  it('wideDetail이 켜져 있으면 노드 수와 무관하게 억제하지 않는다(ADR-0049 우선)', () => {
    expect(shouldSuppressMapModeDetail(true, true, 10_000)).toBe(false);
  });

  it('작은 트리(임계값 이하)는 맵 모드라도 억제하지 않는다 — 실사용 버그 재현', () => {
    // 실사용 사례: 43노드짜리 앱이 초기 fitView로 맵 모드에 들어가 화면이 통째로 비어 보였다.
    expect(shouldSuppressMapModeDetail(true, false, 43)).toBe(false);
    expect(shouldSuppressMapModeDetail(true, false, SMALL_TREE_NODE_THRESHOLD)).toBe(false);
  });

  it('임계값을 넘는 큰 트리는 맵 모드에서 그대로 억제한다(ADR-0018 원래 동작 보존)', () => {
    expect(shouldSuppressMapModeDetail(true, false, SMALL_TREE_NODE_THRESHOLD + 1)).toBe(true);
    expect(shouldSuppressMapModeDetail(true, false, 5000)).toBe(true);
  });
});
