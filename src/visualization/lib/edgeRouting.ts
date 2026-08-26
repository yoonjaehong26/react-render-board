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

// --- Phase 2: 명시적 버스 병합 (ADR-0054) ---
// 같은 출발(부모)의 크로스-그룹 간선들을 하나의 트렁크(수직 공유) + 바(수평) + 타깃별 스텁(수직)
// 으로 합친다("회로도풍"). 바는 소스 프레임 바로 아래 거터에 놓고, 소스별 레인 오프셋(Phase 1
// 중앙 테이블)으로 다른 부모의 바와 분리한다 — 같은 출발은 한 줄기, 다른 출발은 다른 y로 안 겹침.
//
// 안전장치: 트렁크/바/스텁 세 선분 중 하나라도 (자기 소스·타깃 프레임을 뺀) 다른 프레임을 관통하면
// 그 간선만 버스에서 빼 개별 A*(routeOrthogonal)로 폴백한다 — v2의 "프레임 관통 0"을 안 깬다.
// 정밀 채널 회피(거터에 평행 트랙)는 Phase 3의 몫이다. 좌표의 순수 함수라 라이브 안정성 상속.

/** 버스 배선용 간선 입력. 끝점은 절대 좌표(소스=바닥 중앙 핸들, 타깃=상단 중앙 핸들). */
export interface BusEdgeInput {
  id: string;
  source: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

/** 같은 부모의 fan-out을 한 번만 그리기 위한 시각적 버스 골격. branches는 서로 독립 SVG subpath다. */
export interface BusVisual {
  /** 이 edge id만 골격을 실제로 그린다. 나머지 같은-source edge는 논리 연결로만 남긴다. */
  hidden?: boolean;
  branches?: Pt[][];
}

export interface CrossGroupRouteResult {
  paths: Map<string, Pt[]>;
  visuals: Map<string, BusVisual>;
}

// 바(수평 줄기)를 소스 프레임 바닥에서 이만큼 아래 거터에 놓는다. routeOrthogonal의 EXIT_GAP(8)+
// collideMargin(10)과 같은 수준이라 바가 v2 탈출 거터와 같은 빈 띠에 앉는다.
const BUS_GUTTER = 20;
// 서로 다른 부모 버스가 같은 거터를 지나야 할 때의 최소 중심선 간격. 일반 트랙 11px보다
// 1px 넓게 잡아 1.75px stroke와 라운드 코너가 시각적으로 붙지 않게 한다.
const BUS_ROUTE_GAP = 12;
const EDGE_RESERVATION_HALF_WIDTH = 5;
const EDGE_ENDPOINT_TRIM = 8;

/**
 * 이미 확정된 다른 부모 경로를 다음 경로가 피할 수 있는 얇은 장애물 띠로 바꾼다.
 *
 * 시작/끝점 바로 앞은 trim해, 같은 target으로 들어가는 특수 경우에는 노드 핸들에서만 합류할
 * 수 있게 한다. 그 외 구간은 10px 폭으로 예약하므로 다른 부모의 수평 바·수직 스텁·교차가
 * 모두 A* 후보에서 배제된다.
 */
function reservePathCorridors(points: Pt[]): RoutingRect[] {
  const out: RoutingRect[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.x === b.x) {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      const trim = Math.min(EDGE_ENDPOINT_TRIM, (hi - lo) / 3);
      if (hi - lo <= trim * 2) continue;
      out.push({
        x: a.x - EDGE_RESERVATION_HALF_WIDTH,
        y: lo + trim,
        width: EDGE_RESERVATION_HALF_WIDTH * 2,
        height: hi - lo - trim * 2,
      });
    } else if (a.y === b.y) {
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      const trim = Math.min(EDGE_ENDPOINT_TRIM, (hi - lo) / 3);
      if (hi - lo <= trim * 2) continue;
      out.push({
        x: lo + trim,
        y: a.y - EDGE_RESERVATION_HALF_WIDTH,
        width: hi - lo - trim * 2,
        height: EDGE_RESERVATION_HALF_WIDTH * 2,
      });
    }
  }
  return out;
}

function pathHitsReservedCorridor(points: Pt[], reserved: RoutingRect[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const rect of reserved) {
      if (a.y === b.y && hSegHitsRect(a.y, a.x, b.x, rect)) return true;
      if (a.x === b.x && vSegHitsRect(a.x, a.y, b.y, rect)) return true;
    }
  }
  return false;
}

/**
 * 크로스-그룹 간선들을 출발별로 묶어 버스(트렁크+바+스텁) 경로를, 병합이 프레임을 관통하는
 * 간선은 개별 A*로 폴백한 경로를 낸다. 반환은 `edgeId → 점열` 맵(모든 입력 간선을 포함).
 */
export function routeCrossGroupBuses(
  edges: BusEdgeInput[],
  obstacles: RoutingRect[],
  laneOf: (source: string) => number = () => 0,
): CrossGroupRouteResult {
  const out = new Map<string, Pt[]>();
  const visuals = new Map<string, BusVisual>();
  const bySource = new Map<string, BusEdgeInput[]>();
  for (const e of edges) {
    const arr = bySource.get(e.source);
    if (arr) arr.push(e);
    else bySource.set(e.source, [e]);
  }
  // 부모별로 하나의 버스를 만드는 건 유지하되, 다른 부모가 먼저 쓴 경로는 이후 부모에게
  // 장애물로 예약한다. source id 정렬은 live commit의 입력 배열 순서가 달라도 동일한 지도를
  // 만들기 위한 결정적 tie-breaker다.
  const reservedCorridors: RoutingRect[] = [];
  const sourceGroups = [...bySource.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, group] of sourceGroups) {
    const laneOffset = laneOf(group[0].source);
    const fallback = (e: BusEdgeInput): void => {
      out.set(
        e.id,
        routeOrthogonal(
          { x: e.sx, y: e.sy },
          { x: e.tx, y: e.ty },
          [...obstacles, ...reservedCorridors],
          { laneOffset },
        ),
      );
    };
    // 단일 타깃은 합칠 대상이 없으니 개별 배선(기존 v2와 동일).
    if (group.length < 2) {
      fallback(group[0]);
      reservedCorridors.push(...reservePathCorridors(out.get(group[0].id)!));
      continue;
    }
    const s0 = group[0];
    const sourceFrame = obstacles.find((r) => rectContains(r, { x: s0.sx, y: s0.sy }));
    const trunkX = s0.sx; // 같은 출발이라 sx 공유 = 트렁크 x
    const baseBarY = (sourceFrame ? sourceFrame.y + sourceFrame.height : s0.sy) + BUS_GUTTER + laneOffset;
    let busPaths: { barY: number; paths: Array<[string, Pt[]]> } | null = null;
    // span-aware lane은 대부분 첫 시도에서 해결한다. 다른 층의 경로와 만나면 조금 더 아래의
    // 동일 거터 트랙을 차례로 시도해, 부모가 다른 선끼리는 어떠한 선분도 공유하지 않게 한다.
    for (let attempt = 0; attempt < 8 && !busPaths; attempt++) {
      const barY = baseBarY + attempt * BUS_ROUTE_GAP;
      const trunkClear =
        barY > s0.sy &&
        !obstacles.some((r) => r !== sourceFrame && vSegHitsRect(trunkX, s0.sy, barY, r));
      if (!trunkClear) continue;
      const candidates: Array<[string, Pt[]]> = [];
      let clear = true;
      for (const e of group) {
        const targetFrame = obstacles.find((r) => rectContains(r, { x: e.tx, y: e.ty }));
        const barClear = !obstacles.some(
          (r) => r !== sourceFrame && r !== targetFrame && hSegHitsRect(barY, trunkX, e.tx, r),
        );
        const stubClear =
          e.ty > barY &&
          !obstacles.some((r) => r !== sourceFrame && r !== targetFrame && vSegHitsRect(e.tx, barY, e.ty, r));
        const path = simplifyCollinear([
          { x: trunkX, y: e.sy },
          { x: trunkX, y: barY },
          { x: e.tx, y: barY },
          { x: e.tx, y: e.ty },
        ]);
        if (!barClear || !stubClear || pathHitsReservedCorridor(path, reservedCorridors)) {
          clear = false;
          break;
        }
        candidates.push([e.id, path]);
      }
      if (clear) busPaths = { barY, paths: candidates };
    }
    if (busPaths) {
      for (const [id, path] of busPaths.paths) out.set(id, path);
      // 같은 source의 모든 edge에 동일한 트렁크+바를 각각 그리면 SVG가 N겹으로 쌓이고 타깃별
      // gradient까지 섞여 굵기·색이 불규칙해진다. leader 하나가 통일된 source 색의 버스 골격을
      // 한 번만 그리고, follower는 논리 edge만 유지한다(hover/선택 data는 그대로).
      const leader = [...group].sort((a, b) => a.id.localeCompare(b.id))[0];
      const minX = Math.min(trunkX, ...group.map((e) => e.tx));
      const maxX = Math.max(trunkX, ...group.map((e) => e.tx));
      visuals.set(leader.id, {
        branches: [
          [{ x: trunkX, y: s0.sy }, { x: trunkX, y: busPaths.barY }],
          [{ x: minX, y: busPaths.barY }, { x: maxX, y: busPaths.barY }],
          ...group.map((e) => [{ x: e.tx, y: busPaths.barY }, { x: e.tx, y: e.ty }]),
        ],
      });
      for (const e of group) if (e.id !== leader.id) visuals.set(e.id, { hidden: true });
    } else {
      // 같은 부모 버스가 다른 부모의 예약 경로까지 피할 충분한 거터를 못 찾은 경우에만, 각
      // 간선을 edge-aware A*로 우회한다. 프레임만 피하던 기존 폴백과 달리 예약 띠도 장애물이다.
      for (const e of group) fallback(e);
    }
    for (const e of group) reservedCorridors.push(...reservePathCorridors(out.get(e.id)!));
  }
  return { paths: out, visuals };
}

// --- Phase 3: span-aware corridor-local sticky 트랙 배정 (ADR-0082) ---
// 크로스-그룹 간선의 출발을 "소스 그룹 프레임의 y-층(gutter)"별로 묶는다. 같은 층 안에서는
// 버스의 실제 수평 span이 닿을 때만 다른 barY 슬롯을 배정하고, 닿지 않으면 한 트랙을 재사용한다.
// 따라서 다른 부모의 겹치는 버스에는 여백이 생기되, 멀리 떨어진 버스까지 불필요하게 아래로
// 밀리지 않는다. span 순서가 레이아웃에서 안정적이므로 결과도 결정적(sticky, ADR-0008)이다.

export interface TrackSource {
  /** 출발 노드/프레임 id */
  id: string;
  /** 소스 그룹 프레임 바닥 y(거터 위치). 같은 값 = 같은 거터를 공유하는 층. */
  layer: number;
  /** 버스 바가 차지하는 수평 구간의 왼쪽 끝. source→모든 target의 x 범위다. */
  spanStart: number;
  /** 버스 바가 차지하는 수평 구간의 오른쪽 끝. */
  spanEnd: number;
}

const TRACK_GAP = 11; // 트랙(바) 간 세로 간격 px
const TRACK_SPAN_GAP = 12; // 다른 부모 버스가 같은 y를 재사용하려면 이만큼 수평 여백이 필요

/**
 * 층별로 버스의 실제 수평 span을 interval-partitioning한다.
 *
 * 예전에는 출발 x 순서만 보고 무조건 새 y 트랙을 줬다가 44px에서 clamp했다. 그래서 5개가
 * 넘는 서로 다른 부모 버스가 같은 barY로 되돌아가, 정확히 구별해야 할 선이 포개졌다. 이제
 * span이 닿지 않는 버스만 같은 트랙을 재사용하고, 닿는 버스는 항상 다음 트랙으로 보낸다.
 * 트랙 수가 거터를 넘으면 routeCrossGroupBuses의 프레임 관통 검사에서 해당 간선만 A* 폴백한다.
 */
export function assignGutterTracks(sources: TrackSource[]): Map<string, number> {
  const byLayer = new Map<number, TrackSource[]>();
  for (const s of sources) {
    const arr = byLayer.get(s.layer);
    if (arr) arr.push(s);
    else byLayer.set(s.layer, [s]);
  }
  const out = new Map<string, number>();
  for (const [, arr] of byLayer) {
    arr.sort((a, b) => a.spanStart - b.spanStart || a.spanEnd - b.spanEnd || (a.id < b.id ? -1 : 1));
    // trackEnds[n] = n번 트랙에서 마지막으로 끝난 버스의 오른쪽 x. 현재 span이 이 값보다
    // TRACK_SPAN_GAP만큼 오른쪽에서 시작할 때만 같은 y를 재사용한다.
    const trackEnds: number[] = [];
    for (const source of arr) {
      let track = trackEnds.findIndex((end) => source.spanStart >= end + TRACK_SPAN_GAP);
      if (track < 0) {
        track = trackEnds.length;
        trackEnds.push(source.spanEnd);
      } else {
        trackEnds[track] = source.spanEnd;
      }
      out.set(source.id, track * TRACK_GAP);
    }
  }
  return out;
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
