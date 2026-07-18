import { describe, it, expect } from 'vitest';
import { routeOrthogonal, pointsToPath, type RoutingRect, type Pt } from './edgeRouting';

// 폴리라인의 모든 선분(수직/수평)이 rect를 관통하는지 검사(테스트 헬퍼 — 라우터 내부와 독립 구현).
function polylineHitsRect(points: Pt[], r: RoutingRect): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    // 선분 bbox가 rect 내부와 진짜로 겹치면(경계 접촉 제외) 관통.
    if (x1 > r.x && x0 < r.x + r.width && y1 > r.y && y0 < r.y + r.height) return true;
  }
  return false;
}

describe('routeOrthogonal', () => {
  it('routes a clear downward edge as a 3-segment orthogonal path (start=source, end=target)', () => {
    const source: Pt = { x: 100, y: 0 };
    const target: Pt = { x: 300, y: 200 };
    const pts = routeOrthogonal(source, target, []);
    expect(pts[0]).toEqual(source);
    expect(pts[pts.length - 1]).toEqual(target);
    // 순수 직교: 인접 점은 x 또는 y 중 하나만 바뀐다.
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = Math.abs(pts[i + 1].x - pts[i].x);
      const dy = Math.abs(pts[i + 1].y - pts[i].y);
      expect(dx === 0 || dy === 0).toBe(true);
    }
  });

  it('avoids an obstacle that the midpoint channel would cut through', () => {
    const source: Pt = { x: 100, y: 0 };
    const target: Pt = { x: 500, y: 200 };
    // 중점 채널 y=100에 걸치는 장애물(x 200~400). 소박한 smoothstep이라면 관통한다.
    const obstacle: RoutingRect = { x: 200, y: 80, width: 200, height: 40 };
    const pts = routeOrthogonal(source, target, [obstacle]);
    expect(polylineHitsRect(pts, obstacle)).toBe(false);
    expect(pts[0]).toEqual(source);
    expect(pts[pts.length - 1]).toEqual(target);
  });

  it('does not treat the frames CONTAINING the endpoints as obstacles', () => {
    const source: Pt = { x: 100, y: 20 };
    const target: Pt = { x: 300, y: 220 };
    const sourceFrame: RoutingRect = { x: 50, y: 0, width: 120, height: 60 }; // source 포함
    const targetFrame: RoutingRect = { x: 250, y: 200, width: 120, height: 60 }; // target 포함
    // 자기 프레임을 장애물로 보면 경로가 못 나가 폴백만 남는다 — 제외되므로 정상 3-세그먼트가 나와야.
    const pts = routeOrthogonal(source, target, [sourceFrame, targetFrame]);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(pts[0]).toEqual(source);
    expect(pts[pts.length - 1]).toEqual(target);
  });

  it('keeps the path clear of several obstacles crowding the route (3-seg or side detour)', () => {
    const source: Pt = { x: 100, y: 0 };
    const target: Pt = { x: 420, y: 420 };
    const obstacles: RoutingRect[] = [
      { x: 150, y: 120, width: 120, height: 120 },
      { x: 330, y: 120, width: 120, height: 120 },
      { x: 240, y: 300, width: 120, height: 80 },
    ];
    const pts = routeOrthogonal(source, target, obstacles);
    for (const o of obstacles) expect(polylineHitsRect(pts, o)).toBe(false);
    expect(pts[0]).toEqual(source);
    expect(pts[pts.length - 1]).toEqual(target);
  });

  it('finds a fully clear route through a wall of obstacles that blocks every straight channel (A* completeness)', () => {
    const source: Pt = { x: 200, y: 0 };
    const target: Pt = { x: 200, y: 400 };
    // source·target 사이를 가로지르는 "벽" — 가운데에 좁은 통로(gap)만 있다. 3-세그먼트로는
    // 절대 못 풀지만(모든 직선 채널이 막힘) A*는 통로를 찾아 완전히 회피해야 한다.
    const obstacles: RoutingRect[] = [
      { x: -100, y: 180, width: 250, height: 40 }, // 왼쪽 벽 (x -100~150)
      { x: 250, y: 180, width: 250, height: 40 }, // 오른쪽 벽 (x 250~500), 통로 = x 150~250
    ];
    const pts = routeOrthogonal(source, target, obstacles);
    for (const o of obstacles) expect(polylineHitsRect(pts, o)).toBe(false);
    expect(pts[0]).toEqual(source);
    expect(pts[pts.length - 1]).toEqual(target);
  });

  it('falls back to a midpoint path for feedback (target above source) instead of throwing', () => {
    const source: Pt = { x: 100, y: 300 };
    const target: Pt = { x: 300, y: 50 }; // 위로 가는 역방향
    const pts = routeOrthogonal(source, target, [{ x: 150, y: 100, width: 100, height: 100 }]);
    expect(pts[0]).toEqual(source);
    expect(pts[pts.length - 1]).toEqual(target);
  });
});

describe('pointsToPath', () => {
  it('produces a straight M/L path when radius is 0', () => {
    const d = pointsToPath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
      ],
      0,
    );
    expect(d).toBe('M0,0 L0,10 L10,10');
  });

  it('rounds corners with quadratics when radius > 0 (contains Q commands)', () => {
    const d = pointsToPath(
      [
        { x: 0, y: 0 },
        { x: 0, y: 40 },
        { x: 40, y: 40 },
        { x: 40, y: 80 },
      ],
      6,
    );
    expect(d).toContain('Q');
    expect(d.startsWith('M0,0')).toBe(true);
    expect(d.endsWith('40,80')).toBe(true);
  });
});
