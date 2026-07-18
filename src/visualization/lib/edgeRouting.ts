// 크로스-그룹 간선의 규칙 기반 직교 배선 (ADR-0029 §5 "규칙 기반 특화 배선기").
//
// 배경: 그룹 내(부모→자식) 간선은 tidy-tree라 smoothstep의 공유 중점 채널이 이미 버스로 정렬돼
// 충돌이 없다. 문제는 그룹 경계를 넘는 크로스-그룹 간선 — waterfall 층에 그룹이 빽빽한 실제 앱
// (excalidraw 80그룹, shadcn-admin 49그룹)에서 smoothstep의 "무조건 중점" 채널이 중간 그룹
// 프레임/노드를 관통한다. 여기서는 프레임을 장애물로 보고, 빈 거터로만 다니는 직교 경로를 낸다.
//
// v2 알고리즘(Hanan-그리드 A*): source·target·장애물 모서리(±margin)의 x·y로 만든 격자(Hanan
// grid) 위에서 A*로 최소 비용(길이 + 굽힘 페널티) 직교 경로를 찾는다. 격자선은 전부 장애물 밖
// (모서리 바로 옆)이라 경로가 프레임을 절대 관통하지 않고, 우회 경로가 존재하면(항상 존재한다)
// 반드시 찾는다 — v1의 "3-세그먼트로 못 풀면 중점 폴백(관통)" 한계를 없앤다. A*가 공유 격자선을
// 선호하므로 같은 방향 간선들이 같은 거터로 모이는 버스 병합 효과가 부분적으로 딸려온다.
// 좌표(프레임 위치)의 순수 함수라 라이브 안정성이 레이아웃에서 상속된다(ADR-0008, 새 상태 없음).

export interface Pt {
  x: number;
  y: number;
}

export interface RoutingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RouteOptions {
  /** 충돌 회피 여백 — 경로가 프레임에서 최소 이만큼 떨어진다(작게). */
  collideMargin?: number;
  /** 격자선(=꺾임·갈라짐이 일어나는 자리)을 프레임 모서리에서 이만큼 "밖"(거터 안쪽)에 놓는다.
   * 크게 잡을수록 특이점이 프레임에 안 붙고 빈 거터 공간에서 생긴다(피드백 1). */
  lanePlacement?: number;
  /** 소스(부모)별 트랙 오프셋 — 다른 부모에서 나온 경로가 같은 거터에서 겹치지 않게 서로 다른
   * 레인으로 민다(피드백 2). 같은 부모는 같은 값이라 여전히 공유(버스)된다. 크기는 lanePlacement
   * 안쪽으로 제한돼 충돌을 안 만든다. */
  laneOffset?: number;
}

const DEFAULT_COLLIDE_MARGIN = 10;
const DEFAULT_LANE_PLACEMENT = 30;
// 격자 후보를 source·target 바운딩박스 밖으로 이만큼까지 확장(장애물을 크게 우회할 여지).
const BBOX_PAD = 90;
// A* 비용에서 코너(방향 전환) 하나당 더하는 페널티. 길이가 비슷하면 굽힘이 적은 경로를 고른다.
const BEND_PENALTY = 30;
// 소스별 레인 오프셋 후보(px). 격자선을 이만큼 밀어 부모가 다른 경로를 분리한다. lanePlacement
// (30) 안쪽이라 격자선이 항상 collideMargin(10) 밖에 남아 충돌을 안 만든다.
export const LANE_OFFSETS = [-12, -6, 0, 6, 12] as const;

/** 점이 rect 안에(경계 포함) 있는가. */
function rectContains(r: RoutingRect, p: Pt): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** 세로 선분 (x, y0~y1)이 rect 내부와 겹치는가. 경계 접촉은 통과로 본다(엄격 부등호). */
function vSegHitsRect(x: number, y0: number, y1: number, r: RoutingRect): boolean {
  const [lo, hi] = y0 <= y1 ? [y0, y1] : [y1, y0];
  return x > r.x && x < r.x + r.width && hi > r.y && lo < r.y + r.height;
}

/** 가로 선분 (y, x0~x1)이 rect 내부와 겹치는가. */
function hSegHitsRect(y: number, x0: number, x1: number, r: RoutingRect): boolean {
  const [lo, hi] = x0 <= x1 ? [x0, x1] : [x1, x0];
  return y > r.y && y < r.y + r.height && hi > r.x && lo < r.x + r.width;
}

function uniqSorted(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

/**
 * Hanan-그리드 A*로 source→target 직교 경로(장애물 회피)를 낸다. 경로가 없으면(격자에 끝점이
 * 없는 예외적 경우) null.
 */
// frames = 원본 프레임 rect들. 격자선은 프레임 모서리에서 `inset`만큼 밖(거터)에 놓고, 충돌은
// `collideMargin`만큼 부풀린 rect로 검사한다(격자 배치와 충돌 여백을 분리 — inset > collideMargin이라
// 격자선은 항상 충돌 rect 밖). inset에 소스별 laneOffset을 더해 부모가 다른 경로를 분리한다.
function aStarRoute(source: Pt, target: Pt, frames: RoutingRect[], collideMargin: number, inset: number): Pt[] | null {
  const minX = Math.min(source.x, target.x) - BBOX_PAD;
  const maxX = Math.max(source.x, target.x) + BBOX_PAD;
  const minY = Math.min(source.y, target.y) - BBOX_PAD;
  const maxY = Math.max(source.y, target.y) + BBOX_PAD;

  const obstacles = frames.map((r) => ({
    x: r.x - collideMargin,
    y: r.y - collideMargin,
    width: r.width + collideMargin * 2,
    height: r.height + collideMargin * 2,
  }));
  const xs = uniqSorted(
    [source.x, target.x, ...frames.flatMap((r) => [r.x - inset, r.x + r.width + inset])].filter(
      (x) => x >= minX && x <= maxX,
    ),
  );
  const ys = uniqSorted(
    [source.y, target.y, ...frames.flatMap((r) => [r.y - inset, r.y + r.height + inset])].filter(
      (y) => y >= minY && y <= maxY,
    ),
  );
  const xi = new Map(xs.map((x, i) => [x, i]));
  const yi = new Map(ys.map((y, i) => [y, i]));
  const si = xi.get(source.x);
  const sj = yi.get(source.y);
  const ti = xi.get(target.x);
  const tj = yi.get(target.y);
  if (si === undefined || sj === undefined || ti === undefined || tj === undefined) return null;

  const W = xs.length;
  const H = ys.length;
  const clearH = (i0: number, i1: number, j: number): boolean => {
    const y = ys[j];
    const x0 = xs[Math.min(i0, i1)];
    const x1 = xs[Math.max(i0, i1)];
    for (const r of obstacles) if (hSegHitsRect(y, x0, x1, r)) return false;
    return true;
  };
  const clearV = (j0: number, j1: number, i: number): boolean => {
    const x = xs[i];
    const y0 = ys[Math.min(j0, j1)];
    const y1 = ys[Math.max(j0, j1)];
    for (const r of obstacles) if (vSegHitsRect(x, y0, y1, r)) return false;
    return true;
  };

  // 상태 = (i, j, 진입방향). 방향: 0=시작, 1=수평, 2=수직. 방향이 바뀌면 굽힘 페널티.
  const stateKey = (i: number, j: number, dir: number) => (i * H + j) * 3 + dir;
  const best = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const h = (i: number, j: number) => Math.abs(xs[i] - target.x) + Math.abs(ys[j] - target.y);

  // 간단한 배열 기반 우선순위 큐(격자가 작아 충분).
  type Node = { i: number; j: number; dir: number; g: number; f: number; key: number };
  const startKey = stateKey(si, sj, 0);
  best.set(startKey, 0);
  const open: Node[] = [{ i: si, j: sj, dir: 0, g: 0, f: h(si, sj), key: startKey }];

  let goalKey: number | null = null;
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (best.get(cur.key)! < cur.g) continue;
    if (cur.i === ti && cur.j === tj) {
      goalKey = cur.key;
      break;
    }
    const neighbors: Array<[number, number, number]> = [];
    if (cur.i + 1 < W && clearH(cur.i, cur.i + 1, cur.j)) neighbors.push([cur.i + 1, cur.j, 1]);
    if (cur.i - 1 >= 0 && clearH(cur.i, cur.i - 1, cur.j)) neighbors.push([cur.i - 1, cur.j, 1]);
    if (cur.j + 1 < H && clearV(cur.j, cur.j + 1, cur.i)) neighbors.push([cur.i, cur.j + 1, 2]);
    if (cur.j - 1 >= 0 && clearV(cur.j, cur.j - 1, cur.i)) neighbors.push([cur.i, cur.j - 1, 2]);
    for (const [ni, nj, ndir] of neighbors) {
      const stepLen = Math.abs(xs[ni] - xs[cur.i]) + Math.abs(ys[nj] - ys[cur.j]);
      const bend = cur.dir !== 0 && cur.dir !== ndir ? BEND_PENALTY : 0;
      const ng = cur.g + stepLen + bend;
      const nk = stateKey(ni, nj, ndir);
      if (best.get(nk) === undefined || ng < best.get(nk)!) {
        best.set(nk, ng);
        cameFrom.set(nk, cur.key);
        open.push({ i: ni, j: nj, dir: ndir, g: ng, f: ng + h(ni, nj), key: nk });
      }
    }
  }

  if (goalKey === null) return null;
  // 경로 복원(상태 key → 좌표), 그다음 일직선 점 병합.
  const pts: Pt[] = [];
  let k: number | undefined = goalKey;
  while (k !== undefined) {
    const cell = Math.floor(k / 3);
    const i = Math.floor(cell / H);
    const j = cell % H;
    pts.push({ x: xs[i], y: ys[j] });
    k = cameFrom.get(k);
  }
  pts.reverse();
  return simplifyCollinear(pts);
}

/** 같은 직선 위 연속 점(중간점)을 없앤다. */
function simplifyCollinear(pts: Pt[]): Pt[] {
  if (pts.length <= 2) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!collinear) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * source에서 target으로 가는 직교 폴리라인 점열을 낸다(장애물=그룹 프레임 회피).
 * 반환은 항상 source로 시작해 target으로 끝나는 점열이다.
 */
export function routeOrthogonal(
  source: Pt,
  target: Pt,
  obstacles: RoutingRect[],
  {
    collideMargin = DEFAULT_COLLIDE_MARGIN,
    lanePlacement = DEFAULT_LANE_PLACEMENT,
    laneOffset = 0,
  }: RouteOptions = {},
): Pt[] {
  const midY = (source.y + target.y) / 2;
  const simple = (): Pt[] => [source, { x: source.x, y: midY }, { x: target.x, y: midY }, target];

  if (obstacles.length === 0 || target.y <= source.y) return simple(); // 장애물 없음/피드백은 단순 경로.

  // 끝점을 담은 프레임(자기 소스/타깃 그룹)을 찾는다. 예전엔 이 프레임들을 "장애물 제외"했더니
  // 라우터가 그 프레임 안에서 자유롭게 꺾여, 특이점이 그룹 박스 안에 생겼다(피드백 1). 대신
  // 이제 **모든 프레임을 장애물로** 두고, 간선은 자기 프레임 밖으로 곧장(수직) 탈출한 뒤 거터
  // 에서만 A*로 배선한다 — 꺾임·갈라짐이 프레임 안에서 절대 안 생긴다.
  const sourceFrame = obstacles.find((r) => rectContains(r, source));
  const targetFrame = obstacles.find((r) => rectContains(r, target));
  const EXIT_GAP = 8;
  const exitY = (sourceFrame ? sourceFrame.y + sourceFrame.height : source.y) + collideMargin + EXIT_GAP;
  const entryY = (targetFrame ? targetFrame.y : target.y) - collideMargin - EXIT_GAP;
  if (exitY >= entryY) return simple(); // 소스·타깃 프레임이 너무 붙어 사이에 배선할 공간이 없음.

  const escapeS: Pt = { x: source.x, y: exitY }; // 소스 프레임 바로 아래(거터)
  const escapeT: Pt = { x: target.x, y: entryY }; // 타깃 프레임 바로 위(거터)
  // 격자선을 프레임에서 (lanePlacement + laneOffset)만큼 밖에 놓는다 — 특이점이 거터에서 생기고,
  // 소스별 laneOffset이 부모 다른 경로를 다른 레인으로 분리한다(피드백 2). 이제 자기 프레임도
  // 장애물이라 A*가 어떤 프레임 안으로도 안 들어간다.
  const inset = lanePlacement + laneOffset;
  const mid = aStarRoute(escapeS, escapeT, obstacles, collideMargin, inset);
  if (!mid) return simple();
  return simplifyCollinear([source, ...mid, target]);
}

/** 소스(부모) 키에서 결정론적 레인 오프셋을 고른다 — 같은 부모는 같은 레인(공유=버스), 다른
 * 부모는 (대개) 다른 레인으로 분리된다(피드백 2). 좌표 순수성 유지(전역 상태 없음). */
export function laneOffsetForKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return LANE_OFFSETS[Math.abs(h) % LANE_OFFSETS.length];
}

/** 점열을 라운드 코너가 있는 SVG path d 문자열로. radius=0이면 각진 직교. */
export function pointsToPath(points: Pt[], radius = 6): string {
  if (points.length === 0) return '';
  if (points.length <= 2 || radius <= 0) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const p1 = { x: cur.x - ((cur.x - prev.x) / (inLen || 1)) * r, y: cur.y - ((cur.y - prev.y) / (inLen || 1)) * r };
    const p2 = { x: cur.x + ((next.x - cur.x) / (outLen || 1)) * r, y: cur.y + ((next.y - cur.y) / (outLen || 1)) * r };
    d += ` L${p1.x},${p1.y} Q${cur.x},${cur.y} ${p2.x},${p2.y}`;
  }
  const last = points[points.length - 1];
  d += ` L${last.x},${last.y}`;
  return d;
}
