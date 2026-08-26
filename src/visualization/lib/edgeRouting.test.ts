import { describe, it, expect } from 'vitest';
import {
  routeOrthogonal,
  routeCrossGroupBuses,
  assignGutterTracks,
  pointsToPath,
  type RoutingRect,
  type Pt,
  type BusEdgeInput,
  type TrackSource,
} from './edgeRouting';

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

describe('routeCrossGroupBuses (버스 병합, ADR-0054 Phase 2)', () => {
  it('같은 출발의 두 간선을 트렁크+바로 합친다 — 트렁크 x와 바 y를 공유', () => {
    const edges: BusEdgeInput[] = [
      { id: 'a', source: 'S', sx: 100, sy: 100, tx: 50, ty: 300 },
      { id: 'b', source: 'S', sx: 100, sy: 100, tx: 300, ty: 300 },
    ];
    const { paths, visuals } = routeCrossGroupBuses(edges, []);
    const a = paths.get('a')!;
    const b = paths.get('b')!;
    // 둘 다 소스 바닥에서 시작해 (트렁크 x, 바 y)에서 갈라진다.
    expect(a[0]).toEqual({ x: 100, y: 100 });
    expect(b[0]).toEqual({ x: 100, y: 100 });
    expect(a[1].x).toBe(100); // 트렁크 x 공유
    expect(b[1].x).toBe(100);
    expect(a[1].y).toBe(b[1].y); // 같은 바 y = 한 줄기(버스)
    expect(a[1].y).toBeGreaterThan(100); // 바는 소스 아래 거터
    // 공유 구간은 edge 두 개가 겹쳐 그리지 않는다. leader(a) 하나가 trunk+bar+두 stub을 그리고
    // follower(b)는 논리 edge만 남겨 gradient/굵기가 섞이지 않는다.
    expect(visuals.get('a')?.branches).toHaveLength(4);
    expect(visuals.get('b')?.hidden).toBe(true);
    // 끝점은 각자 타깃.
    expect(a[a.length - 1]).toEqual({ x: 50, y: 300 });
    expect(b[b.length - 1]).toEqual({ x: 300, y: 300 });
  });

  it('단일 타깃 출발은 버스가 아니라 개별 배선으로 낸다(끝점만 검증)', () => {
    const { paths } = routeCrossGroupBuses([{ id: 'x', source: 'S', sx: 100, sy: 100, tx: 200, ty: 300 }], []);
    const x = paths.get('x')!;
    expect(x[0]).toEqual({ x: 100, y: 100 });
    expect(x[x.length - 1]).toEqual({ x: 200, y: 300 });
  });

  it('출발이 다르면 바 y를 레인 오프셋으로 분리한다', () => {
    const laneOf = (s: string): number => (s === 'S1' ? -10 : 10);
    const edges: BusEdgeInput[] = [
      { id: 'a', source: 'S1', sx: 100, sy: 100, tx: 50, ty: 300 },
      { id: 'b', source: 'S1', sx: 100, sy: 100, tx: 150, ty: 300 },
      { id: 'c', source: 'S2', sx: 400, sy: 100, tx: 350, ty: 300 },
      { id: 'd', source: 'S2', sx: 400, sy: 100, tx: 450, ty: 300 },
    ];
    const { paths } = routeCrossGroupBuses(edges, [], laneOf);
    expect(paths.get('a')![1].y).not.toBe(paths.get('c')![1].y); // 다른 출발 = 다른 바 y
  });

  it('서로 다른 부모 버스가 같은 레인을 요구해도 경로를 예약해 수평 바를 공유하지 않는다', () => {
    const edges: BusEdgeInput[] = [
      { id: 'a', source: 'S1', sx: 100, sy: 100, tx: 20, ty: 300 },
      { id: 'b', source: 'S1', sx: 100, sy: 100, tx: 500, ty: 300 },
      { id: 'c', source: 'S2', sx: 300, sy: 100, tx: 60, ty: 300 },
      { id: 'd', source: 'S2', sx: 300, sy: 100, tx: 540, ty: 300 },
    ];
    const { paths } = routeCrossGroupBuses(edges, [], () => 0);
    // 둘의 수평 span은 크게 겹치지만, S2는 예약된 S1 바보다 아래의 다음 트랙으로 이동한다.
    expect(paths.get('a')![1].y).toBe(120);
    expect(paths.get('c')![1].y).toBeGreaterThan(paths.get('a')![1].y);
  });

  it('병합이 프레임을 관통하는 간선만 개별 A*로 폴백하고, 나머지는 버스로 남는다 — 관통 0', () => {
    const blocker: RoutingRect = { x: 280, y: 150, width: 40, height: 100 }; // B 스텁(x=300) 경로를 막음
    const edges: BusEdgeInput[] = [
      { id: 'a', source: 'S', sx: 100, sy: 100, tx: 50, ty: 300 }, // 깨끗 → 버스
      { id: 'b', source: 'S', sx: 100, sy: 100, tx: 300, ty: 300 }, // 스텁 막힘 → 폴백
    ];
    const { paths } = routeCrossGroupBuses(edges, [blocker]);
    const a = paths.get('a')!;
    const b = paths.get('b')!;
    // a는 버스: 트렁크 아래 바에서 갈라진다.
    expect(a[1].x).toBe(100);
    expect(a[1].y).toBeGreaterThan(100);
    // 어느 경로도 장애물을 관통하지 않는다(폴백이 A*로 우회).
    expect(polylineHitsRect(a, blocker)).toBe(false);
    expect(polylineHitsRect(b, blocker)).toBe(false);
    // 둘 다 끝점은 정확히 타깃.
    expect(a[a.length - 1]).toEqual({ x: 50, y: 300 });
    expect(b[b.length - 1]).toEqual({ x: 300, y: 300 });
  });
});

describe('assignGutterTracks (span-aware corridor-local 트랙, ADR-0082)', () => {
  it('같은 층이라도 수평 span이 닿지 않으면 같은 트랙을 재사용한다', () => {
    const src: TrackSource[] = [
      { id: 'c', layer: 100, spanStart: 240, spanEnd: 320 },
      { id: 'a', layer: 100, spanStart: 0, spanEnd: 80 },
      { id: 'b', layer: 100, spanStart: 120, spanEnd: 200 },
    ];
    const t = assignGutterTracks(src);
    // 12px 이상 비어 있으므로 a/b/c 모두 같은 y 트랙(0)을 재사용한다.
    expect(t.get('a')).toBe(0);
    expect(t.get('b')).toBe(0);
    expect(t.get('c')).toBe(0);
  });

  it('서로 다른 부모 버스의 span이 겹치면 작은 여백을 두고 별도 트랙으로 보낸다', () => {
    const t = assignGutterTracks([
      { id: 'left', layer: 100, spanStart: 0, spanEnd: 200 },
      { id: 'right', layer: 100, spanStart: 80, spanEnd: 280 },
    ]);
    expect(t.get('left')).toBe(0);
    expect(t.get('right')).toBe(11);
  });

  it('다른 층은 독립 — 각 층이 0부터 다시 시작한다', () => {
    const src: TrackSource[] = [
      { id: 'a', layer: 100, spanStart: 0, spanEnd: 100 },
      { id: 'b', layer: 100, spanStart: 20, spanEnd: 120 },
      { id: 'c', layer: 300, spanStart: 0, spanEnd: 100 },
      { id: 'd', layer: 300, spanStart: 20, spanEnd: 120 },
    ];
    const t = assignGutterTracks(src);
    expect(t.get('a')).toBe(0);
    expect(t.get('b')).toBe(11);
    expect(t.get('c')).toBe(0); // 다른 층이라 다시 0
    expect(t.get('d')).toBe(11);
  });

  it('겹치는 버스가 5개를 넘어도 clamp로 같은 트랙에 되돌아가지 않는다', () => {
    const src: TrackSource[] = Array.from({ length: 7 }, (_, i) => ({
      id: `s${i}`,
      layer: 0,
      spanStart: 0,
      spanEnd: 100,
    }));
    const t = assignGutterTracks(src);
    expect(t.get('s0')).toBe(0);
    expect(t.get('s4')).toBe(44); // 4*11
    expect(t.get('s5')).toBe(55);
    expect(t.get('s6')).toBe(66);
  });

  it('결정적(sticky) — 같은 입력은 같은 결과, x 동률은 id로 정렬', () => {
    const src: TrackSource[] = [
      { id: 'z', layer: 0, spanStart: 10, spanEnd: 100 },
      { id: 'a', layer: 0, spanStart: 10, spanEnd: 100 }, // 같은 span → id로 a가 먼저
    ];
    const t1 = assignGutterTracks(src);
    const t2 = assignGutterTracks([...src].reverse());
    expect(t1.get('a')).toBe(0);
    expect(t1.get('z')).toBe(11);
    expect(t2.get('a')).toBe(t1.get('a')); // 입력 순서 무관(결정적)
    expect(t2.get('z')).toBe(t1.get('z'));
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
