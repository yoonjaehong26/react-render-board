import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useViewport,
  type Node,
  type Edge,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow.css';
import type { RenderStore } from '../data/store';
import { resolveHostElements } from '../hooking/domInteraction';
import { normalizeForCanvas, PENDING_GROUP, resolveVisibleId } from './lib/normalize';
import { coalesceListSiblings } from './lib/coalesce';
import { createLayoutEngine, type Rect } from './lib/layout';
import { toFlow, type ComponentNodeData, type GroupNodeData } from './lib/toFlow';
import { worldRectFromViewport, expandRect, rectsIntersect } from './lib/geometry';
import { createInteractionStore, type InteractionStore } from './lib/interactionStore';
import { computeSearchMatches } from './lib/search';
import { deriveBoundaryMemberships } from './lib/roleMarkers';
import {
  buildBoundaryFrames,
  insertBoundaryFrames,
  computeGroupBoundaryKinds,
  withGroupBoundaryKinds,
} from './lib/boundaryFrames';
import { paletteHex, colorIndexForGroup } from './lib/groupColor';
import { getStoredColorMode, setStoredColorMode } from './lib/colorModePreference';
import { loadStickyNotes, saveStickyNotes, createStickyNoteId, type StickyNote } from './lib/stickyNotes';
import { OrthoEdge } from './components/OrthoEdge';
import { EdgeObstaclesContext, EdgeLanesContext, EdgeBusPathsContext } from './components/edgeObstaclesContext';
import { routeCrossGroupBuses, laneOffsetForKey, assignGutterTracks, type RoutingRect, type Pt, type BusEdgeInput } from './lib/edgeRouting';
import { GroupNode } from './components/GroupNode';
import { FolderNode } from './components/FolderNode';
import { ComponentNode } from './components/ComponentNode';
import { BoundaryFrame } from './components/BoundaryFrame';
import { StickyNoteNode, type StickyNoteNodeData } from './components/StickyNoteNode';
import { ContextMenu, type ContextMenuState } from './components/ContextMenu';
import { SemanticZoomController, MAP_MODE_THRESHOLD } from './components/SemanticZoomController';
import { shouldSuppressMapModeDetail } from './lib/mapModeDetail';
// props 흐름 추적 + 변경 잔상 (ADR-0032) — 아래 "ADR-0032" 주석이 붙은 코드 조각들이 이 기능이다.
import { PropsPanel } from './components/PropsPanel';
import {
  AfterglowContext,
  TrackedNodesContext,
  LineageNodesContext,
  PageHoveredNodeContext,
} from './components/AfterglowContext';
import { createAfterglowStore, type AfterglowStore } from './lib/afterglowStore';
import {
  readFiberProps,
  isTrackable,
  fiberPropsChanged,
  representativeChangedProp,
  trackReferenceInDescendants,
  type PropRow,
} from './lib/propsFlow';

const nodeTypes = {
  group: GroupNode,
  folder: FolderNode,
  component: ComponentNode,
  boundary: BoundaryFrame,
  sticky: StickyNoteNode,
};
// 크로스-그룹 간선은 그룹 프레임을 피해 배선하는 커스텀 직교 간선(ADR-0029 §5). 같은-그룹은
// smoothstep(이미 버스 정렬), 집계 엣지는 smoothstep 유지.
const edgeTypes = { ortho: OrthoEdge };

// prop 참조 추적(ADR-0032)이 비어 있을 때 재사용하는 안정된 빈 집합 — 매번 새 Set을 만들어
// useMemo/context가 불필요하게 갱신되지 않게 한다.
const EMPTY_TRACKED_IDS: ReadonlySet<number> = new Set();

// 안 바뀐 노드는 이전 커밋의 객체 참조를 재사용하기 위한 얕은 비교(ADR-0050). toFlow는 매 커밋
// 노드 객체를 새로 만들어, 데이터가 그대로여도 React Flow가 그 노드를 재렌더한다 — 각 노드가
// 손그림 테두리를 SVG data-URI 배경으로 다시 칠하며 sub-frame 흰 깜빡임과 jank를 낸다(실측:
// 고빈도 앱에서 ComponentNode가 초당 수백 회 재렌더). 콜백(함수)은 동작이 안정적이라 비교에서
// 제외해, onToggleCollapse 같은 매번 새로 만들어지는 핸들러 때문에 그룹 노드가 불필요히 갱신되지
// 않게 한다.
function nodesShallowEqual(a: Node, b: Node): boolean {
  if (a.type !== b.type || a.parentId !== b.parentId) return false;
  if (a.position.x !== b.position.x || a.position.y !== b.position.y) return false;
  if (a.style?.width !== b.style?.width || a.style?.height !== b.style?.height) return false;
  const ad = a.data as Record<string, unknown>;
  const bd = b.data as Record<string, unknown>;
  const keys = Object.keys(ad);
  if (keys.length !== Object.keys(bd).length) return false;
  for (const k of keys) {
    const av = ad[k];
    const bv = bd[k];
    if (typeof av === 'function' && typeof bv === 'function') continue;
    if (av !== bv) return false;
  }
  return true;
}

// 잔상 켰을 때 간선을 발광시킬 양끝 heat 임계값(ADR-0032 앰비언트 활동). 노드 발광(heat>0)보다
// 높게 잡아, 갓 식어가는 잔열까지 간선으로 번지지 않고 "지금 확실히 바쁜" 경로만 잡는다.
const AFTERGLOW_EDGE_HOT = 0.15;

// 스티키노트(ADR-0029) 고정 크기 — NODE_WIDTH/HEIGHT(layout.ts)와 달리 이건 레이아웃 엔진이
// 관리하지 않는 자유 배치 노드라 여기서 직접 상수로 둔다.
const STICKY_NOTE_WIDTH = 180;
const STICKY_NOTE_HEIGHT = 140;

/** 다크모드 토글(ADR-0027). 'system'은 스코프에서 뺀다 — xyflow의 colorMode prop과 우리
 * 자신의 body 클래스(document.body에 붙여 `.react-flow` 밖 크롬까지 스타일을 도달시키는
 * 용도, BoardOverlay.tsx의 rrb-board-open과 같은 패턴)를 항상 같은 리터럴로 동기화하기
 * 위함이다. */
type BoardColorMode = 'light' | 'dark';

// 검색어가 바뀐 뒤 이만큼 잠잠해지면 매치된 노드로 카메라를 옮긴다 — 타이핑 중간중간마다
// 카메라가 튀지 않게 하기 위함이다(REFIT_DEBOUNCE_MS와 같은 계열의 판단, 값만 다르다).
const SEARCH_REFIT_DEBOUNCE_MS = 300;

// 뷰포트가 안정된(패닝/줌이 멈춘) 뒤 이만큼 기다렸다가 "어느 그룹을 펼칠지"를 다시 계산한다.
// 드래그 도중 매 프레임 재계산하면 뷰포트 기반 최적화의 의미가 없어지므로, 제스처가 끝난
// 뒤 한 번만 반영한다 (ADR-0009/0012의 커밋 디바운스와 같은 방향의 판단).
const VIEWPORT_SETTLE_MS = 200;
// 뷰포트 경계에서 이 비율만큼 안쪽/바깥쪽 그룹까지 미리 펼쳐 둔다 — 패닝하자마자 그룹이
// 갑자기 나타나는 팝인을 줄이기 위한 여유분이다.
const VIEWPORT_EXPAND_MARGIN = 0.5;

/** 패닝/줌이 멈춘 뒤에만 갱신되는 "안정된" 뷰포트 (뷰포트 기반 부분 재계산의 트리거). */
function useSettledViewport() {
  const live = useViewport();
  const [settled, setSettled] = useState(live);
  useEffect(() => {
    const handle = setTimeout(() => setSettled(live), VIEWPORT_SETTLE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.x, live.y, live.zoom]);
  return settled;
}

// 이전 커밋의 그룹 중 이 비율 미만만 살아남으면(=대부분 새 그룹으로 교체됨) "카메라가
// 못 따라갈 만큼 크게 바뀌었다"고 보고 다시 fitView한다. 라우트 전환처럼 서브트리 전체가
// 교체되는 경우 생존율은 0에 가깝고, "항목 추가"처럼 기존 그룹에 노드 하나 더하는 경우
// 생존율은 1이다 — 매 커밋 자동 refit이 사용자의 수동 팬/줌을 계속 덮어쓰지 않도록
// (ADR-0015 백로그 ①) 이 임계값 아래일 때만 반응한다.
const REFIT_SURVIVAL_THRESHOLD = 0.3;
// 라우트 전환 도중 Suspense fallback -> 실제 콘텐츠처럼 그룹 집합이 짧은 시간에 연달아
// 크게 바뀌는 경우, 그때마다 fitView를 호출하면 카메라가 여러 번 튄다 — 마지막 변화
// 이후 이만큼 잠잠해지면 한 번만 반영한다.
const REFIT_DEBOUNCE_MS = 250;

/** 그룹 집합이 크게 바뀌었을 때만 fitView를 다시 트리거한다 (ADR-0015 카메라 정체 백로그 ①). */
function useAutoRefit(groupNames: Set<string>) {
  const { fitView } = useReactFlow();
  const previousRef = useRef<Set<string> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = groupNames;
    // 첫 커밋은 <ReactFlow fitView />가 이미 처리하므로 건너뛴다.
    if (!previous || previous.size === 0 || groupNames.size === 0) return;

    let survived = 0;
    for (const name of previous) {
      if (groupNames.has(name)) survived++;
    }
    const survivalRatio = survived / previous.size;

    if (survivalRatio < REFIT_SURVIVAL_THRESHOLD) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fitView({ duration: 400 }), REFIT_DEBOUNCE_MS);
    }
  }, [groupNames, fitView]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
}

interface BoardContentProps {
  store: RenderStore;
  interactionStore: InteractionStore;
  snapshot: ReturnType<RenderStore['getSnapshot']>;
  includeHostNodes: boolean;
  onIncludeHostNodesChange: (value: boolean) => void;
  engine: ReturnType<typeof createLayoutEngine>;
  colorMode: BoardColorMode;
  onColorModeChange: (mode: BoardColorMode) => void;
  // 변경 잔상 (ADR-0032) — store/enabled/paused 셋은 Canvas가 소유하고(pause가 snapshot 자체를
  // 얼리므로, 여기 오는 snapshot은 이미 "일시정지 중이면 고정된" 값이다), 토글 UI만 여기서 그린다.
  afterglowStore: AfterglowStore;
  afterglowEnabled: boolean;
  afterglowPaused: boolean;
  onAfterglowEnabledChange: (enabled: boolean) => void;
  onAfterglowPausedChange: (paused: boolean) => void;
}

function BoardContent({
  store,
  interactionStore,
  snapshot,
  includeHostNodes,
  onIncludeHostNodesChange,
  engine,
  colorMode,
  onColorModeChange,
  afterglowStore,
  afterglowEnabled,
  afterglowPaused,
  onAfterglowEnabledChange,
  onAfterglowPausedChange,
}: BoardContentProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewport = useSettledViewport();
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);
  const isMapMode = viewport.zoom < MAP_MODE_THRESHOLD;
  const { fitView } = useReactFlow();
  const { navigateToNodeId, navigateRequestId, hoverNodeId } = useSyncExternalStore(
    interactionStore.subscribe,
    interactionStore.getSnapshot,
  );
  // 역방향 인터랙션(ADR-0024/0025)이 착지시킨 노드 — toFlow가 ComponentNode에 강조 스타일을
  // 입히는 데 쓴다. interactionStore가 아니라 로컬 state인 이유: "화면에 실제로 보이는 id로
  // 해석된 뒤"의 결과라서(navigateToNodeId는 아직 해석 전 raw id) 이 Canvas 인스턴스만의 관심사다.
  const [highlightedNodeId, setHighlightedNodeId] = useState<number | null>(null);
  // 검색 하이라이트 + 자동 이동(ADR-0027). interactionStore가 아니라 로컬 state인 이유는
  // navigateRequestId 절 설명과 대칭적이다 — domInteraction.ts 같은 경계 너머 소비자가 검색어를
  // 알아야 할 이유가 없고, 영속화도 필요 없는 이 Canvas 인스턴스만의 관심사다.
  const [searchQuery, setSearchQuery] = useState('');
  // 그룹+개별 동시 필터 — 검색과 같은 매치 계산을 재사용하되, 강조+흐림(기본값) 대신 매치
  // 안 된 그룹/노드를 아예 안 만든다(research 2절 "그룹 필터 + 개별 필터 동시 지원"). 검색
  // 자체와 독립된 상태라 검색어를 지워도 필터 선택은 유지된다 — 재검색할 때 다시 체크할
  // 필요가 없다.
  const [filterToMatches, setFilterToMatches] = useState(false);
  // 지도 모드(줌아웃)에서도 그룹 내부 컴포넌트를 보여줄지(ADR-0049). 기본은 off(지도=영역만).
  // 켜면 지도 모드여도 화면에 걸치는 그룹은 내부를 펼친다 — 뷰포트 컬링은 그대로라(ADR-0017)
  // 화면 밖 그룹은 여전히 안 그려 성능은 화면 안 개수에 묶인다. "줌아웃하면 보던 게 사라진다"는
  // 불편의 해소책. 세션 탐색 보조라 영속화하지 않는다.
  const [wideDetail, setWideDetail] = useState(false);
  // 폴더 단위 2단 중첩(ADR-0053). 기본 off(파일 단위 평면). 켜면 파일 그룹을 상위 폴더 프레임으로
  // 묶는다. 폴더 경로는 파이버 _debugStack에서 파싱(dev 전용)하고, 못 얻으면 파일 그룹핑으로 폴백.
  // 세션 탐색 보조라 wideDetail과 같이 영속화하지 않는다.
  const [nestFolders, setNestFolders] = useState(false);
  // 그룹 접기/펼치기(ADR-0029). 세션 안에서만 유지되는 탐색 보조 상태라 localStorage에
  // 영속화하지 않는다(다크모드처럼 "장기 선호"가 아니라 "지금 이 화면을 정리해서 보는" 용도).
  const [manuallyCollapsedGroups, setManuallyCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroupCollapse = (group: string) => {
    setManuallyCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // ── props 흐름 추적 + 변경 잔상 (ADR-0032) 상태 ─────────────────────────────
  // 선택된 노드(=props 패널이 열린 노드). 클릭 시점에 store.getFiber로 memoizedProps를
  // 읽으므로(커밋마다 전체 순회가 아니라 이 노드 1개만 O(1)) 이건 그 대상 id일 뿐이다.
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedDisplayName, setSelectedDisplayName] = useState('');
  const [propRows, setPropRows] = useState<PropRow[]>([]);
  // 지금 참조 추적 중인 prop 키(패널에서 객체/콜백 행을 클릭). null이면 추적 안 함.
  const [trackedPropKey, setTrackedPropKey] = useState<string | null>(null);
  // 추적 결과: 클릭한 노드의 자손 중 같은 참조를 가진 노드 id들(raw). ComponentNode가
  // TrackedNodesContext로 읽어 하이라이트한다 — 새 간선 없이 기존 트리 서브체인만 강조.
  const [trackedIds, setTrackedIds] = useState<ReadonlySet<number>>(EMPTY_TRACKED_IDS);

  // hover 혈통 점등(ADR-0041 후속, 연구문서 7절 c). 컴포넌트 노드에 hover하면 그 노드의 조상
  // 체인 + 자손 서브트리 "간선"만 남기고 나머지를 죽인다. 상시 감쇠(ADR-0041 a·b)로 못 없앤
  // 마지막 클러터를 인터랙션으로 해소 — "지금 관심 있는 혈통만 잉크"라는 같은 원칙의 연장이다.
  // 간선만 대상이라(프리스크립션 "조상 체인+직계 자손 간선") flowNodes를 재생성하지 않고,
  // 기존 간선 장식 파이프라인(flowEdgesDecorated)에 클래스만 얹으며 dimming은 CSS가 맡는다
  // (검색 dimming ADR-0027과 같은 메커니즘 재사용).
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  // 공유 UI 레인(pillar ②) 호버: 공유 그룹 프레임을 호버하면 그걸 쓰는 모든 사용처로 on-demand
  // 직선을 점등한다(상시 선 폐지의 짝). 사용처 노드 호버는 hoveredNodeId로 잡아 그 노드가 쓰는
  // 공유 그룹으로 선을 그린다. 둘 다 좌표 순수라 flowNodes 불변(hover 상태만).
  const [hoveredSharedGroup, setHoveredSharedGroup] = useState<string | null>(null);

  // 노드를 새로 선택하면, 그 노드의 대표 prop(방금 바뀐 추적 가능한 것 우선, 없으면 첫 추적
   // 가능한 것)을 자동으로 추적해 흐름(간선)을 한 번의 클릭으로 보여준다(ADR-0032 UX 후속).
   // props 패널 읽기 이펙트가 이 플래그를 보고 rows를 읽은 직후 자동 선택한다 — 이후 사용자가
   // 수동으로 토글한 선택은 절대 덮어쓰지 않는다(이 플래그는 선택 순간에만 켜진다).
  const autoTrackPendingRef = useRef(false);
  const selectComponentNode = (id: number, displayName: string) => {
    setSelectedNodeId(id);
    setSelectedDisplayName(displayName);
    setTrackedPropKey(null); // 새 노드를 고르면 이전 추적은 무의미하므로 리셋
    setTrackedIds(EMPTY_TRACKED_IDS);
    autoTrackPendingRef.current = true;
  };
  const closePropsPanel = () => {
    setSelectedNodeId(null);
    setTrackedPropKey(null);
    setTrackedIds(EMPTY_TRACKED_IDS);
  };
  // 추적 가능 prop 행 클릭 → 같은 키를 다시 누르면 해제(토글).
  const handleTrackProp = (row: PropRow) => {
    setTrackedPropKey((prev) => (prev === row.key ? null : row.key));
  };
  // ───────────────────────────────────────────────────────────────────────────

  // 경계 소속 파생(도형 어휘, ADR-0028) — 포탈/Suspense/에러 바운더리. fibersById 사이드채널로
  // 원본 fiber 트리를 커밋마다 1회 훑어 각 노드의 소속 경계를 구한다(RenderNode 스키마 무관).
  // snapshot(커밋)에만 의존시켜, 팬/줌 같은 뷰포트 변화엔 fiber 트리를 다시 안 훑게 한다.
  const boundaryMemberships = useMemo(() => {
    const sampleId = snapshot.nodes[0]?.id;
    const sample = sampleId !== undefined ? store.getFiber(sampleId) : undefined;
    return deriveBoundaryMemberships(sample);
  }, [snapshot, store]);

  const { flowNodes, flowEdges, visibleCount, totalCount, groupNames, visibleIds, matchedIds, visibleNodes } =
    useMemo(() => {
    // 리스트 접기(ADR-0045): normalize가 만든 화면 노드 위에서 같은 종류 형제 N개(리스트)를
    // 대표 하나 + "×N"으로 접는다. 데이터/인터랙션은 그대로(대표는 실제 fiber id 유지).
    const visible = coalesceListSiblings(normalizeForCanvas(snapshot.nodes, { includeHostNodes }));
    // PENDING_GROUP은 groupHint가 아직 비동기로 안 채워졌을 뿐인 "임시" 상태라, 이 그룹의
    // 등장/소멸만으로 카메라를 다시 맞추면 안 된다 — 실제 그룹 집합 변화만 추적한다.
    const groupNames = new Set(visible.map((n) => n.group).filter((g) => g !== PENDING_GROUP));
    const visibleIds = new Set(visible.map((n) => n.id));

    // 검색 하이라이트(ADR-0027) — displayName/그룹 매칭은 normalizeForCanvas 이후의 "화면에
    // 보일 수 있는" 노드 집합 기준이다(host 노드 토글이 꺼져 있으면 애초에 이 목록에 없다).
    const matchedIds = computeSearchMatches(visible, searchQuery);
    const matchedGroups = new Set(visible.filter((n) => matchedIds.has(n.id)).map((n) => n.group));
    // 역방향 인터랙션(ADR-0024/0025)이 착지시킨 노드가 지금 속한 그룹 — 뷰포트 밖/지도 모드로
    // 접혀 있어도 강제로 펼쳐야 "그 그룹 안에 실제로 노드가 있는" 상태를 만들 수 있다(아래
    // shouldExpandGroup 참고). 검색과 똑같은 메커니즘 재사용.
    const highlightedGroup =
      highlightedNodeId !== null ? visible.find((n) => n.id === highlightedNodeId)?.group : undefined;
    // prop 참조 추적(ADR-0032)이 하이라이트한 노드가 속한 그룹 — 검색/역방향과 같은 이유로
    // (아래 shouldExpandGroup) 강제로 펼친다. 안 그러면 추적 대상 노드가 flowNodes 배열에
    // 아예 없어(ADR-0017) 하이라이트가 조용히 실패한다.
    const trackedGroups = new Set(
      trackedIds.size > 0 ? visible.filter((n) => trackedIds.has(n.id)).map((n) => n.group) : [],
    );

    // 뷰포트 기반 부분 재계산 (ADR-0016 ①). 프로파일링 결과 normalizeForCanvas/toFlow 자체는
    // 5,000노드 규모에서도 수 ms에 불과했다 — 진짜 비용은 그 결과물(flowNodes 배열)의
    // "크기"에 비례해 React Flow가 치르는 내부 처리였다. 그래서 여기서는 "무엇을 계산할지"가
    // 아니라 "얼마나 큰 배열을 만들어 React Flow에 넘길지"를 뷰포트로 줄인다: 화면 밖 그룹은
    // 프레임(라벨+개수)만 만들고 자식 컴포넌트 노드/엣지는 만들지 않는다.
    // 지도 모드(줌아웃)에서는 애초에 개별 노드가 안 보이므로(semantic zoom, ui-philosophy.md)
    // 뷰포트와 무관하게 전부 접는다 — P2(LOD)와 같은 방향.
    // wideDetail(ADR-0049)이 켜져 있으면 지도 모드에서도 뷰포트 컬링으로 화면 안 그룹만 펼치려고
    // viewRect를 계산한다(지도 모드에선 원래 null이라 전부 접혔다).
    const viewRect =
      (!isMapMode || wideDetail) && paneWidth > 0 && paneHeight > 0
        ? expandRect(worldRectFromViewport(viewport, paneWidth, paneHeight), VIEWPORT_EXPAND_MARGIN)
        : null;

    const shouldExpandGroup = (frame: Rect, group: string) => {
      // 검색 매치나 역방향 착지 지점을 담은 그룹은 뷰포트/지도 모드는 물론 사용자의 수동
      // 접기보다도 우선해 강제로 펼친다 — 안 그러면 매치/착지된 노드가 flowNodes 배열에
      // 아예 없어(ADR-0017) 하이라이트도 fitView도 대상이 존재하지 않는 조용한 실패가 된다.
      // "검색은 언제나 이긴다"는 ui-philosophy.md의 탈출구 원칙을 그룹 접기에도 그대로 적용한다.
      if (group === highlightedGroup || matchedGroups.has(group) || trackedGroups.has(group)) return true;
      if (manuallyCollapsedGroups.has(group)) return false; // 그룹 접기/펼치기 (ADR-0029)
      // 지도 모드 = 영역만(wideDetail이면 예외, ADR-0049) — 단 작은 트리는 지도 모드라도 항상
      // 디테일을 보여준다(ADR-0066). 원래 이 억제는 노드 수천/그룹 100개+에서만 의미 있는
      // 최적화(ADR-0018)였는데 노드 수와 무관하게 순수 줌 배율로만 걸려 있어, 수십 노드짜리
      // 작은 앱도 초기 fitView가 우연히 그 배율 밑이면 화면이 통째로 비어 보이는 실사용 버그가
      // 있었다(43노드 앱에서 실측).
      if (shouldSuppressMapModeDetail(isMapMode, wideDetail, snapshot.nodes.length)) return false;
      if (!viewRect) return true; // 아직 팬 크기를 모르는 첫 렌더는 안전하게 전부 펼친다.
      return rectsIntersect(frame, viewRect);
    };

    const { flowNodes, flowEdges } = toFlow(visible, engine, {
      shouldExpandGroup,
      highlightedNodeId,
      matchedIds,
      filterToMatches,
      manuallyCollapsedGroups,
      onToggleGroupCollapse: toggleGroupCollapse,
      // 손그림 테두리 라이트/다크 변형 선택(ADR-0030) — 인라인 background-image는 CSS 다크
      // 스코프로 못 바꿔 data로 내려줘야 한다. colorMode를 useMemo 의존성에도 추가한다.
      colorMode,
      nestFolders, // 폴더 단위 2단 중첩(ADR-0053) — useMemo 의존성에도 추가.
    });
    // 경계 프레임(도형 어휘, ADR-0028) — 포탈/Suspense/에러 바운더리를 이름표 붙은 박스로 두른다.
    // 렌더된 컴포넌트 노드의 바운딩 박스에서 프레임을 만들고, 각 그룹 프레임 바로 뒤에 끼워 넣어
    // z-순서를 잡는다(그룹 프레임 위·컴포넌트 노드 아래). 경계 소속은 fibersById 파생(아래 별도
    // useMemo, 뷰포트 변화엔 재계산 안 함)이라 RenderNode 스키마와 무관하다.
    const boundaryFrames = buildBoundaryFrames(flowNodes, boundaryMemberships);
    const nodesWithBoundaries = insertBoundaryFrames(flowNodes, boundaryFrames);
    // 그룹 wideview 링(ADR-0028) — 각 그룹이 품은 경계 종류를 그룹 노드 data에 채워, GroupNode가
    // 지도 모드에서도 보이는 경계 색 동심 링을 그린다(개별 경계 프레임은 상세 모드 전용).
    const groupBoundaryKinds = computeGroupBoundaryKinds(
      boundaryMemberships,
      new Map(visible.map((n) => [n.id, n.group])),
    );
    const finalNodes = withGroupBoundaryKinds(nodesWithBoundaries, groupBoundaryKinds);
    return {
      flowNodes: finalNodes,
      flowEdges,
      visibleCount: visible.length,
      totalCount: snapshot.nodes.length,
      groupNames,
      visibleIds,
      matchedIds,
      visibleNodes: visible, // ADR-0032 Q2: 지도 모드 그룹 흐름 집계용(id+group)
    };
  }, [
    snapshot,
    includeHostNodes,
    engine,
    viewport,
    paneWidth,
    paneHeight,
    isMapMode,
    wideDetail,
    nestFolders,
    highlightedNodeId,
    searchQuery,
    filterToMatches,
    manuallyCollapsedGroups,
    colorMode,
    boundaryMemberships, // ADR-0028: 경계 프레임
    trackedIds, // ADR-0032: 추적 대상 그룹 강제 확장 반영
  ]);

  // 안 바뀐 노드는 이전 커밋의 객체 참조를 재사용한다(ADR-0050 흰 깜빡임 수정). React Flow는 노드
  // 객체 참조가 그대로면 그 노드를 재렌더하지 않으므로(내부 memo), 데이터가 안 바뀐 노드는 매
  // 커밋 재렌더+SVG 배경 재래스터를 건너뛴다 — 고빈도 앱에서 초당 수백 회 재렌더하던 걸 실제
  // 변경분으로 좁힌다.
  const stableNodesRef = useRef<Map<string, Node>>(new Map());
  const stableFlowNodes = useMemo(() => {
    const prev = stableNodesRef.current;
    const next = new Map<string, Node>();
    const out = flowNodes.map((n) => {
      const key = String(n.id);
      const previous = prev.get(key);
      const reuse = previous && nodesShallowEqual(previous, n) ? previous : n;
      next.set(key, reuse);
      return reuse;
    });
    stableNodesRef.current = next;
    return out;
  }, [flowNodes]);

  useAutoRefit(groupNames);

  // ── props 흐름 추적 + 변경 잔상 (ADR-0032) 이펙트들 ────────────────────────────
  // (1) props 패널 읽기 — 선택된 노드 1개에 대해서만 store.getFiber로 memoizedProps를 읽는다.
  //     selectedNodeId가 바뀌거나(다른 노드 선택) 이 노드가 다시 렌더돼 커밋이 갱신될 때
  //     다시 읽어 "이번 커밋 변경 키"(b1)까지 최신으로 유지한다. 전체 노드 순회가 아니라
  //     선택 노드 1개라 커밋당 O(1)다(ADR-0032의 on-demand read 원칙). 일시정지 중에는
  //     snapshot.commitId가 얼어 있어 이 이펙트가 다시 돌지 않는다 = 패널도 고정된다.
  useEffect(() => {
    if (selectedNodeId === null) {
      setPropRows([]);
      return;
    }
    const fiber = store.getFiber(selectedNodeId);
    const rows = fiber ? readFiberProps(fiber) : [];
    setPropRows(rows);
    // 선택 직후 1회: 대표 prop 자동 추적(방금 바뀐 추적 가능한 것 우선 → 없으면 첫 추적 가능한
    // 것). 커밋 갱신(같은 노드)에는 다시 안 걸려 사용자의 수동 토글을 덮어쓰지 않는다.
    if (autoTrackPendingRef.current) {
      autoTrackPendingRef.current = false;
      const auto = rows.find((r) => r.changed && r.trackable) ?? rows.find((r) => r.trackable);
      if (auto) setTrackedPropKey(auto.key);
    }
  }, [selectedNodeId, snapshot.commitId, store]);

  // (2) 참조 추적 — 추적 중인 prop 키가 있으면, 그 prop의 최신 참조를 다시 읽어 자손 트리를
  //     한 번 walk한다(클릭당/커밋당 O(자손 수), 추적 중일 때만). 참조는 커밋마다 바뀔 수
  //     있으므로 커밋 갱신 시 재계산해 스테일 하이라이트를 피한다.
  useEffect(() => {
    if (selectedNodeId === null || trackedPropKey === null) {
      setTrackedIds(EMPTY_TRACKED_IDS);
      return;
    }
    const fiber = store.getFiber(selectedNodeId);
    const props = fiber?.memoizedProps as Record<string, unknown> | undefined;
    const ref = props ? props[trackedPropKey] : undefined;
    if (!isTrackable(ref)) {
      setTrackedIds(EMPTY_TRACKED_IDS);
      return;
    }
    setTrackedIds(trackReferenceInDescendants(snapshot.nodes, selectedNodeId, ref, store.getFiber));
  }, [selectedNodeId, trackedPropKey, snapshot.nodes, snapshot.commitId, store]);

  // (3) 흐름 감지 — 흐름 모드가 켜져 있으면 이번 커밋에 props가 바뀐(b1) 것을 heat로 올린다.
  //   - 상세 모드: 지금 flowNodes에 있는 컴포넌트 노드(=뷰포트 안)만 검사해 노드 heat를 올린다
  //     (ADR-0017 일관, 뷰포트 한정).
  //   - 지도 모드(ADR-0032 Q2): 개별 노드가 flowNodes에 없으므로, 전체 visible 컴포넌트를 훑어
  //     "멤버가 바뀐 그룹"을 그룹 heat로 집계한다("활동 기상도"). 이건 뷰포트 한정이 아니라
  //     커밋마다 전체를 훑는 비용이지만, 흐름 켰을 때만 드는 opt-in "토글 모드"라 ADR-0032가
  //     허용한 스코핑 안이다(뷰포트 한정 OR 토글 모드). 후보 목록은 매 렌더 새 ref로 읽어
  //     이펙트 의존성 churn을 막는다. 일시정지 중엔 commitId가 얼어 안 돌고 setPaused도 이중 가드.
  const componentIdsRef = useRef<number[]>([]);
  componentIdsRef.current = flowNodes.filter((n) => n.type === 'component').map((n) => Number(n.id));
  const visibleNodesRef = useRef(visibleNodes);
  visibleNodesRef.current = visibleNodes;
  useEffect(() => {
    if (!afterglowEnabled) return;
    if (isMapMode) {
      const changedGroups = new Set<string>();
      for (const n of visibleNodesRef.current) {
        if (n.kind !== 'composite') continue; // host는 역할이 아니라 배관이라 흐름 집계 제외
        const fiber = store.getFiber(n.id);
        if (fiber && fiberPropsChanged(fiber)) changedGroups.add(`group:${n.group}`);
      }
      if (changedGroups.size > 0) afterglowStore.bumpGroups(changedGroups);
      return;
    }
    const changed: number[] = [];
    for (const id of componentIdsRef.current) {
      const fiber = store.getFiber(id);
      if (fiber && fiberPropsChanged(fiber)) changed.push(id);
    }
    if (changed.length > 0) afterglowStore.bump(changed);
  }, [snapshot.commitId, afterglowEnabled, isMapMode, afterglowStore, store]);
  // ───────────────────────────────────────────────────────────────────────────

  // 역방향 인터랙션(ADR-0024/0025): DOM 클릭이 domInteraction.ts를 거쳐 interactionStore에
  // 남긴 "이 raw id로 이동해줘" 요청을 처리한다. navigateRequestId(호출마다 증가하는 nonce)를
  // 의존성으로 쓴다 — 도킹 패널(ADR-0025)에서는 보드가 이미 열린 채로 같은 DOM 요소를 다시
  // 클릭하는 게 실제로 가능한데, 그 경우 navigateToNodeId 값 자체는 이전과 같아서 그것만
  // 의존성으로 쓰면 두 번째 요청을 놓친다. fitView는 여기서 바로 부르지 않는다 — 이 시점의
  // flowNodes는 아직 이전 렌더의 것이라, 지금 막 resolve한 그룹이 뷰포트 밖/지도 모드로 접혀
  // 있었다면 그 안의 노드가 flowNodes에 없을 수 있다(ADR-0027이 발견한 gap). 아래 별도
  // 이펙트가 강제 확장이 실제로 반영된 뒤에 fitView한다.
  // 역방향 착지 시 카메라를 옮겨야 하는 "대기 중 fitView 대상"(노드 id). navigateRequestId 카운터
  // 가드 대신 "대상 자체"를 들고 있어, 더블클릭(#3)이 쓰는 fitView와 절대 섞이지 않는다(예전엔
  // firedForRequestRef를 공유해, 더블클릭이 그 값을 건드리면 다음 역방향의 fitView가 막히는
  // 취약점이 있었다 — 사용자 리포트: 하이라이트는 되는데 카메라 전환이 안 됨).
  const pendingFitRef = useRef<number | null>(null);
  useEffect(() => {
    if (navigateToNodeId === null) return;
    const visibleId = resolveVisibleId(snapshot.nodes, visibleIds, navigateToNodeId);
    if (visibleId !== null) {
      setHighlightedNodeId(visibleId);
      pendingFitRef.current = visibleId; // 노드가 flowNodes에 나타나면 이 노드로 카메라를 옮긴다.
    }
    interactionStore.consumeNavigate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateRequestId]);

  // 위 이펙트가 setHighlightedNodeId로 그 노드 그룹을 강제 확장시키면(shouldExpandGroup) 다음
  // 렌더에서 노드가 flowNodes에 나타난다. 이 이펙트는 노드가 실제로 나타나는 순간(그때까지
  // flowNodes/navigateRequestId 변화마다 재시도) 딱 한 번 fitView하고 pendingFitRef를 비운다.
  // 더블클릭(#3)은 pendingFitRef를 안 건드리므로 이 이펙트가 그 fitView를 이중으로 부르지 않는다.
  useEffect(() => {
    const target = pendingFitRef.current;
    if (target === null) return;
    if (!flowNodes.some((n) => n.id === String(target))) return; // 아직 안 펼쳐짐 → 다음 렌더에 재시도
    pendingFitRef.current = null;
    fitView({ nodes: [{ id: String(target) }], duration: 400 });
  }, [flowNodes, navigateRequestId, fitView]);

  // 검색 하이라이트 + 자동 이동(ADR-0027): 검색어가 바뀌고 이만큼 잠잠해지면 매치된 노드(들)로
  // 카메라를 옮긴다. matchedIds(매 렌더 새 Set)가 아니라 searchQuery(문자열)에만 의존한다 —
  // 라이브 앱이 고빈도로 커밋해도(ADR-0013) matchedIds 참조가 계속 바뀌어 타이머가 리셋되는
  // 일이 없게 하기 위함이다. 최신 매치는 ref로 읽는다. 검색은 같은 useMemo 패스 안에서
  // matchedGroups 강제 확장까지 동기로 끝나므로(위 shouldExpandGroup), 역방향과 달리 "다음
  // 렌더까지 기다렸다가 fitView"할 필요가 없다.
  const matchedIdsRef = useRef<Set<number>>(matchedIds);
  matchedIdsRef.current = matchedIds;

  useEffect(() => {
    if (!searchQuery.trim()) return;
    const handle = setTimeout(() => {
      const ids = matchedIdsRef.current;
      if (ids.size === 0) return;
      fitView({ nodes: [...ids].map((id) => ({ id: String(id) })), duration: 400 });
    }, SEARCH_REFIT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // 정방향 인터랙션(ADR-0024/0025)과 컨텍스트 메뉴(ADR-0029)의 "실제 화면에서 보기" 액션이
  // 공유하는 로직 — 대응하는 실제 DOM 요소를 하이라이트한다.
  const highlightComponentNode = (id: number) => {
    const fiber = store.getFiber(id);
    if (!fiber) return;
    const elements = resolveHostElements(fiber);
    if (elements.length === 0) return;
    interactionStore.highlight(elements);
  };

  // 정방향 hover 프리뷰(사용자 요청): 보드 노드에 마우스를 올리면 대응하는 실제 DOM 요소에
  // 픽 모드 hover-follow와 똑같은 엣칭(테두리 + 대각선 헷칭)을 잠깐 얹는다 — 픽 모드의 역방향
  // (요소 hover → 노드 햇칭)과 대칭이고, 같은 setHoverElements/DomHighlightOverlay 경로를
  // 그대로 재사용한다(타이머 없이 leave에서 비움). 클릭 하이라이트(highlight, 타이머 자동 소멸)와
  // 달리 hover하는 동안만 유지된다. 픽 모드와 무관하게 동작한다(DomHighlightOverlay는 hoverElements를
  // 픽 모드와 상관없이 그린다).
  const previewComponentNode = (id: number) => {
    const fiber = store.getFiber(id);
    if (!fiber) {
      interactionStore.setHoverElements([]);
      return;
    }
    interactionStore.setHoverElements(resolveHostElements(fiber));
  };

  // 더블클릭(ADR-0043): 단일 클릭 하이라이트보다 강한 "여기로 데려가줘" — 대응하는 실제 DOM
  // 요소를 화면 안으로 스크롤한 뒤 하이라이트한다. 오버레이 패널(ADR-0040)이 앱 일부를 덮거나
  // 요소가 스크롤로 밀려나 안 보일 때, 더블클릭 한 번으로 그 요소를 실제 화면에 데려온다.
  // (라우터 이동은 하지 않는다 — 노드로 보인다 = 지금 마운트돼 있다 = 이미 현재 라우트다.)
  const revealComponentNode = (id: number) => {
    const fiber = store.getFiber(id);
    if (!fiber) return;
    const elements = resolveHostElements(fiber);
    if (elements.length === 0) return;
    // instant(smooth 아님) 스크롤 — smooth는 비동기라 스크롤이 끝나기 전에 highlight가 요소
    // 위치를 측정해(DomHighlightOverlay는 요청 시점 1회 측정, ADR-0026) 하이라이트 박스가 스크롤
    // "전" 위치(화면 밖)에 그려지는 문제가 있었다(사용자 리포트: 스크롤 필요할 때 하이라이트 누락).
    // instant면 이 호출 직후 요소가 이미 최종 위치라 측정이 정확하다.
    elements[0].scrollIntoView({ block: 'center', inline: 'center' });
    interactionStore.highlight(elements);
  };

  // 정방향 인터랙션(ADR-0024/0025): 보드 노드 클릭 → 대응하는 실제 DOM 요소를 하이라이트한다.
  // 도킹 패널(ADR-0025)이라 보드를 닫을 필요가 없다 — 계측 대상 앱은 패널이 열려 있는 동안에도
  // 항상 화면에 보이고 조작 가능하다. 그룹 프레임 클릭(node.type !== 'component')은 무시한다
  // — ADR-0024 결정 5가 DOM 오버레이를 요소 단위로 제한했다.
  // 더블클릭 감지를 React Flow의 onNodeDoubleClick에 맡기지 않고 클릭 타이밍으로 직접 한다
  // (ADR-0043): 첫 클릭이 props 패널을 열며 노드 배열을 리렌더해 DOM 노드가 교체되면, 네이티브
  // dblclick(같은 요소를 두 번 눌러야 성립)이 안 잡히기 때문이다. React Flow의 onNodeClick은
  // 노드 id 기준이라 DOM이 바뀌어도 두 번 다 발화하므로, 같은 id를 짧은 간격에 두 번 누르면
  // 더블클릭으로 취급한다.
  const lastNodeClickRef = useRef<{ id: number; time: number } | null>(null);
  const DOUBLE_CLICK_MS = 400;

  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    setContextMenu(null);
    if (node.type !== 'component') return;
    const id = Number(node.id);

    const last = lastNodeClickRef.current;
    const now = performance.now();
    if (last && last.id === id && now - last.time < DOUBLE_CLICK_MS) {
      // 더블클릭 = 한 번에 세 가지(ADR-0043, 사용자 요청으로 통합). 예전엔 확대(React Flow 기본)/
      // 스크롤/하이라이트가 더블클릭 횟수마다 따로 걸려 헷갈렸다 — 한 동작으로 합친다:
      //   (1) 보드를 이 노드로 확대, (2) 대응 실제 요소를 화면으로 스크롤, (3) 실제 요소 + 다이어그램
      //   노드를 햇칭 하이라이트.
      lastNodeClickRef.current = null;
      fitView({ nodes: [{ id: String(id) }], duration: 400 }); // (1) 확대(이 fitView가 유일 — 역방향
      // pendingFitRef를 안 건드리므로 역방향 fitView 이펙트와 안 섞인다)
      revealComponentNode(id); // (2) 스크롤 + (3a) 실제 요소 햇칭(DomHighlightOverlay)
      setHighlightedNodeId(id); // (3b) 다이어그램 노드 햇칭(--highlighted)
      return;
    }
    lastNodeClickRef.current = { id, time: now };

    highlightComponentNode(id);
    // ADR-0032: 노드 선택 → props 패널을 연다(정방향 DOM 하이라이트와 함께 일어난다 — "이 노드,
    // 실제 화면에선 여기 + 이 노드의 props"라는 한 동작이다).
    selectComponentNode(id, (node.data as ComponentNodeData).displayName);
  };

  // 우클릭 컨텍스트 메뉴(ADR-0029) — 그룹은 접기/펼치기 토글 + 이 그룹으로 확대, 컴포넌트는
  // 클릭과 같은 하이라이트 + 검색창에 이 이름 채우기(검색 기능과의 연동). 스티키노트는 자유
  // 배치 주석일 뿐이라 컨텍스트 메뉴 액션이 없다(우클릭 시 아무 일도 안 함).
  const handleNodeContextMenu: NodeMouseHandler = (event, node) => {
    event.preventDefault();
    if (node.type === 'group') {
      const group = node.id.replace(/^group:/, '');
      const isCollapsed = manuallyCollapsedGroups.has(group);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        actions: [
          { label: isCollapsed ? '그룹 펼치기' : '그룹 접기', onSelect: () => toggleGroupCollapse(group) },
          { label: '이 그룹으로 확대', onSelect: () => fitView({ nodes: [{ id: node.id }], duration: 400 }) },
        ],
      });
    } else if (node.type === 'component') {
      const id = Number(node.id);
      const displayName = (node.data as ComponentNodeData).displayName;
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        actions: [
          { label: '실제 화면에서 보기', onSelect: () => highlightComponentNode(id) },
          { label: '실제 화면으로 이동(스크롤)', onSelect: () => revealComponentNode(id) },
          // ADR-0032: props 패널 열기 — 클릭 선택과 같은 동작을 컨텍스트 메뉴에도 얹는다.
          { label: 'props 보기', onSelect: () => selectComponentNode(id, displayName) },
          { label: '이 이름으로 검색', onSelect: () => setSearchQuery(displayName) },
        ],
      });
    }
  };

  // 캔버스 스티키노트(ADR-0029) — RenderNode 데이터와 무관한 순수 UI 주석이라 localStorage에
  // 직접 영속화한다(최초 1회 하이드레이션 + 변경마다 저장).
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>(() => loadStickyNotes());
  useEffect(() => {
    saveStickyNotes(stickyNotes);
  }, [stickyNotes]);

  const addStickyNote = () => {
    // 지금 보이는 뷰포트의 중앙에 새 메모를 놓는다 — 뷰포트 기반 부분 재계산(ADR-0016 ①)이
    // 이미 계산해 둔 worldRectFromViewport를 그대로 재사용한다.
    const rect = worldRectFromViewport(viewport, paneWidth || 800, paneHeight || 600);
    setStickyNotes((prev) => [
      ...prev,
      {
        id: createStickyNoteId(),
        x: rect.x + rect.width / 2 - STICKY_NOTE_WIDTH / 2,
        y: rect.y + rect.height / 2 - STICKY_NOTE_HEIGHT / 2,
        text: '',
      },
    ]);
  };

  // useMemo로 stickyNotes 자체가 바뀔 때만 재계산한다 — 안 그러면 고빈도 앱(store 30Hz 알림 등)이
  // 유발하는, stickyNotes와 무관한 BoardContent 재렌더마다 이 배열과 콜백이 매번 새로 만들어져
  // React Flow가 매번 새 data 객체로 StickyNoteNode를 다시 그리고, 그때마다 controlled textarea의
  // value가 강제로 재적용돼 한글 IME 조합(자음/모음)이 깨지고 타이핑이 끊기는 원인이 됐다.
  const stickyFlowNodes: Node[] = useMemo(
    () =>
      stickyNotes.map((note) => ({
        id: note.id,
        type: 'sticky',
        position: { x: note.x, y: note.y },
        style: { width: STICKY_NOTE_WIDTH, height: STICKY_NOTE_HEIGHT },
        draggable: true,
        zIndex: 1000,
        data: {
          text: note.text,
          onTextChange: (text: string) =>
            setStickyNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, text } : n))),
          onDelete: () => setStickyNotes((prev) => prev.filter((n) => n.id !== note.id)),
        } satisfies StickyNoteNodeData,
      })),
    [stickyNotes],
  );

  // 스티키노트만 draggable이라(그룹/컴포넌트 노드는 toFlow.ts에서 draggable:false) 여기 오는
  // position 변경은 전부 스티키노트 것이다 — id로 대조해 두는 건 방어적 확인일 뿐이다.
  const handleNodesChange: OnNodesChange = (changes) => {
    const stickyIds = new Set(stickyNotes.map((n) => n.id));
    const positionChanges = changes.filter(
      (c): c is Extract<NodeChange, { type: 'position' }> =>
        c.type === 'position' && c.position !== undefined && stickyIds.has(c.id),
    );
    if (positionChanges.length === 0) return;
    setStickyNotes((prev) =>
      prev.map((note) => {
        const change = positionChanges.find((c) => c.id === note.id);
        return change?.position ? { ...note, x: change.position.x, y: change.position.y } : note;
      }),
    );
  };

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const searchActive = searchQuery.trim().length > 0;
  // 좁은 패널(좌/우 도킹을 줄였을 때)에서 툴바 버튼들이 여러 줄로 접히며 세로 공간을 먹고 텍스트가
  // 넘치는 걸 막는다(사용자 리포트) — 좁으면 검색창만 남기고 나머지 컨트롤을 "☰ 도구" 오버플로
  // 메뉴로 접는다(한 줄 유지). paneWidth(React Flow 캔버스 폭)로 판별한다.
  const compactToolbar = paneWidth > 0 && paneWidth < 460;
  const [toolMenuOpen, setToolMenuOpen] = useState(false);

  // Alt(⌥)-held 라이브 hover(ADR-0032 후속): 실제 요소 hover가 interactionStore에 남긴 raw 노드
  // id(host일 수 있음)를 지금 보드에 보이는 노드 id로 해석한다(resolveVisibleId — 역방향 착지와
  // 같은 기법). ComponentNode가 PageHoveredNodeContext로 받아 그 노드를 동시에 햇칭한다.
  const pageHoveredVisibleId = useMemo(() => {
    if (hoverNodeId === null) return null;
    return resolveVisibleId(snapshot.nodes, visibleIds, hoverNodeId);
  }, [hoverNodeId, snapshot.nodes, visibleIds]);

  // ── 간선 강조 (ADR-0032, 레퍼런스의 "props는 간선에" 관례) ───────────────────────────────
  // 두 가지를 후처리로 얹는다(toFlow.ts는 동시 세션 편집 중이라 안 건드리고 Canvas에서만):
  //  (1) 정밀 추적(edge-tracked): props는 부모→자식으로 흐르므로, 간선 "부모→자식"이 이 참조를
  //      나른다 ⟺ **자식(target)이 그 참조를 props로 받았다**. 그래서 추적 대상(보유자 = 선택
  //      노드 + 그 참조를 가진 자손)을 target으로 하는 기존 간선을 강조한다 — 이러면 참조가
  //      "처음 들어오는" origin 간선(부모→선택 노드)까지 자연히 포함된다(자식=선택 노드가 보유자).
  //      흐르는 prop 이름을 라벨로 얹는다. 새 간선·배선 없이 기존 트리 간선의 서브체인이다.
  //  (2) 앰비언트 흐름(edge-hot): 흐름 모드가 켜져 있으면, **자식(target)이 방금 바뀐** 간선을
  //      부모→자식 방향 애니메이션으로 흐르게 한다 — props는 부모→자식으로 흐르므로 자식의
  //      props가 바뀌었다는 건 "이 간선으로 방금 데이터가 흘러왔다"는 뜻이다(잔상은 프로프 변경만
  //      bump하므로 target이 뜨겁다 ⟺ 그 노드의 props가 바뀌었다 = 이 간선이 방금 날랐다). 클릭
  //      없이 "데이터가 트리를 타고 내려간다"를 보여주는 우리 어법의 주된 동적 표현이다. heat
  //      변화를 따라가려고 afterglowVersion을 의존성에 넣는다(흐름 켜졌을 때만 틱).
  // 지금 hover된 노드의 조상 체인 + 자손 서브트리 — 그에 속한 "간선 id"(점등)와 "노드 id"(비혈통
  // dimming)를 함께 낸다. flowEdges의 부모(source)→자식(target) 인접 리스트로 위(조상)·아래(자손)를
  // 탐색한다. flowEdges/hover가 바뀔 때만 재계산되고, 간선은 flowEdgesDecorated가 클래스로,
  // 노드는 LineageNodesContext가 ComponentNode로 나른다(flowNodes 재생성 없이, ADR-0017).
  const lineage = useMemo(() => {
    if (hoveredNodeId === null) return null;
    const childrenOf = new Map<number, { id: string; child: number }[]>();
    const parentOf = new Map<number, { id: string; parent: number }>();
    for (const e of flowEdges) {
      if (e.source.startsWith('group:') || e.target.startsWith('group:')) continue; // 집계 엣지 제외
      const s = Number(e.source);
      const t = Number(e.target);
      (childrenOf.get(s) ?? childrenOf.set(s, []).get(s)!).push({ id: e.id, child: t });
      parentOf.set(t, { id: e.id, parent: s });
    }
    const edgeIds = new Set<string>();
    const nodeIds = new Set<number>([hoveredNodeId]);
    // 조상 체인: 부모 간선을 타고 위로(순환 방어 seen).
    let up = hoveredNodeId;
    while (parentOf.has(up) && !nodeIds.has(parentOf.get(up)!.parent)) {
      const { id, parent } = parentOf.get(up)!;
      edgeIds.add(id);
      nodeIds.add(parent);
      up = parent;
    }
    // 자손 서브트리: 자식 간선을 타고 아래로(BFS).
    const queue: number[] = [hoveredNodeId];
    const seenDown = new Set<number>([hoveredNodeId]);
    while (queue.length) {
      const n = queue.shift()!;
      for (const { id, child } of childrenOf.get(n) ?? []) {
        edgeIds.add(id);
        nodeIds.add(child);
        if (!seenDown.has(child)) {
          seenDown.add(child);
          queue.push(child);
        }
      }
    }
    // 간선이 하나도 없으면(고립 노드) 점등할 게 없어 dimming도 안 켠다.
    return edgeIds.size > 0 ? { edgeIds, nodeIds } : null;
  }, [flowEdges, hoveredNodeId]);
  const lineageEdgeIds = lineage?.edgeIds ?? null;
  const lineageNodeIds = lineage?.nodeIds ?? EMPTY_TRACKED_IDS;
  const lineageActive = lineage !== null;

  // 공유 UI 레인 연결 맵(pillar ②): 사용처 노드 ↔ 공유 그룹. flowNodes에서 파생(component 노드
  // data.sharedUses + shared 그룹 프레임). 상시 선은 없고 호버 시에만 이 맵으로 on-demand 직선을 낸다.
  const sharedConnections = useMemo(() => {
    const usageToShared = new Map<string, string[]>(); // 노드 id → 공유 그룹 키들
    const sharedToUsages = new Map<string, string[]>(); // 공유 그룹 키 → 사용처 노드 id들
    const sharedGroupIds = new Set<string>(); // 공유 컨테이너 그룹 노드 id(`group:...`)
    for (const n of flowNodes) {
      if (n.type === 'group' && (n.data as GroupNodeData).shared) sharedGroupIds.add(n.id);
      if (n.type !== 'component') continue;
      const uses = (n.data as ComponentNodeData).sharedUses;
      if (!uses || uses.length === 0) continue;
      usageToShared.set(n.id, uses);
      for (const key of uses) {
        const arr = sharedToUsages.get(key);
        if (arr) arr.push(n.id);
        else sharedToUsages.set(key, [n.id]);
      }
    }
    return { usageToShared, sharedToUsages, sharedGroupIds };
  }, [flowNodes]);

  // 호버 시 on-demand 공유 연결선(직선). 사용처 노드 호버 → 그 노드가 쓰는 공유 그룹으로, 공유
  // 그룹 호버 → 그걸 쓰는 모든 사용처로. 색은 공유 그룹 팔레트(칩·레인과 통일). 트리(직교)와
  // 다른 기하(직선)라 "소유 아닌 사용"이 읽힌다. hover 상태에서만 생겨 평소 화면은 깨끗.
  const onDemandSharedEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    // 공유 그룹을 **항상 target**으로 둔다 → 선이 공유 UI의 top 핸들(위쪽 가장자리)로 들어온다
    // (사용자 요청 "공용 ui에 연결되는 선은 위쪽으로"). 사용처(source)에서 아래 레인 top으로.
    const line = (usage: string, key: string): Edge => ({
      id: `shared-od:${usage}->group:${key}`,
      source: usage,
      target: `group:${key}`,
      type: 'straight',
      className: 'edge-shared-ondemand',
      style: { stroke: paletteHex(colorIndexForGroup(key), colorMode), strokeWidth: 2 },
      animated: true,
      zIndex: 30,
      selectable: false,
      focusable: false,
    });
    if (hoveredNodeId !== null) {
      const uses = sharedConnections.usageToShared.get(String(hoveredNodeId));
      if (uses) for (const key of uses) edges.push(line(String(hoveredNodeId), key));
    }
    if (hoveredSharedGroup) {
      const key = hoveredSharedGroup.replace(/^group:/, '');
      for (const usage of sharedConnections.sharedToUsages.get(key) ?? []) edges.push(line(usage, key));
    }
    return edges;
  }, [hoveredNodeId, hoveredSharedGroup, sharedConnections, colorMode]);

  // 크로스-그룹 직교 배선(OrthoEdge, ADR-0029 §5)이 회피할 장애물 = 펼쳐진 그룹 프레임 rect들.
  // flowNodes에서 파생(그룹 프레임은 position+style로 크기를 안다). flowNodes가 바뀔 때만 재계산.
  const edgeObstacles = useMemo<RoutingRect[]>(() => {
    const rects: RoutingRect[] = [];
    for (const n of flowNodes) {
      if (n.type !== 'group') continue;
      const w = typeof n.style?.width === 'number' ? n.style.width : 0;
      const h = typeof n.style?.height === 'number' ? n.style.height : 0;
      if (w > 0 && h > 0) rects.push({ x: n.position.x, y: n.position.y, width: w, height: h });
    }
    return rects;
  }, [flowNodes]);

  // v3 중앙 coordination Phase 3(ADR-0060): corridor-local sticky 트랙. 크로스-그룹 간선의 출발을
  // "소스 그룹 프레임의 y-층(gutter)"별로 묶고, 각 층 안에서 출발 x 순으로 정렬해 트랙(barY 슬롯)을
  // 실제 간격(TRACK_GAP)으로 스택한다. → 같은 층의 여러 버스 바가 한 barY에 겹치지 않고 층층이 쌓여
  // (예: ProductSection.tsx의 ShopProductCard×5 버스), 좌→우 정렬로 교차를 줄인다. 워터풀(tidy-tree,
  // ADR-0058)이 층을 깨끗한 가로 밴드로 만들어, "거터별 1D 트랙 순서" 문제로 쪼개진 덕이다. 층 y·
  // 소스 x는 레이아웃에서 안정 → 결정적(sticky, ADR-0008 상속). 오프셋은 아래쪽(거터)으로만 키워
  // 프레임 안으로 안 들어가고(항상 barY = frameBottom+GUTTER+offset > frameBottom), 거터를 넘치면
  // 버스 폴백이 A*로 잡아 관통 0을 유지한다. 전역 pass라 flowNodes 불변 시 memoize.
  const edgeLanes = useMemo<ReadonlyMap<string, number>>(() => {
    const byId = new Map(flowNodes.map((n) => [n.id, n]));
    const absCache = new Map<string, { x: number; y: number } | undefined>();
    const absPos = (id: string): { x: number; y: number } | undefined => {
      if (absCache.has(id)) return absCache.get(id);
      const node = byId.get(id);
      if (!node) {
        absCache.set(id, undefined);
        return undefined;
      }
      let x = node.position.x;
      let y = node.position.y;
      if (node.parentId) {
        const p = absPos(node.parentId);
        if (p) {
          x += p.x;
          y += p.y;
        }
      }
      const r = { x, y };
      absCache.set(id, r);
      return r;
    };
    const sources = new Set<string>();
    for (const e of flowEdges) {
      if (typeof e.className === 'string' && e.className.includes('edge-cross-group')) sources.add(e.source);
    }
    // 각 출발의 층(소스 그룹 프레임 바닥 y = 거터 위치)과 중심 x를 구한다. 소스가 그룹 프레임(프레임
    // 폴백)이면 자기 자신, 컴포넌트면 그 부모 그룹(parentId).
    const info: Array<{ s: string; layer: number; x: number }> = [];
    for (const s of sources) {
      const sn = byId.get(s);
      if (!sn) continue;
      const frameId = sn.type === 'group' ? s : (sn.parentId ?? s);
      const fn = byId.get(frameId);
      const fp = absPos(frameId);
      const fh = fn && typeof fn.style?.height === 'number' ? fn.style.height : 0;
      const sp = absPos(s);
      const sw = typeof sn.style?.width === 'number' ? sn.style.width : 0;
      info.push({ s, layer: Math.round((fp?.y ?? 0) + fh), x: (sp?.x ?? 0) + sw / 2 });
    }
    return assignGutterTracks(info.map((it) => ({ id: it.s, layer: it.layer, x: it.x })));
  }, [flowNodes, flowEdges]);

  // v3 중앙 coordination Phase 2(ADR-0054): 크로스-그룹 간선을 출발별로 묶어 버스(트렁크+바+스텁)
  // 경로를 한 번에 낸다. OrthoEdge가 간선별로 A*를 돌리는 대신 여기서 낸 `id→점열` 맵을 읽기만
  // 한다(결정2 아키텍처 전환). 끝점은 노드의 절대 좌표에서 핸들 위치(소스=바닥 중앙, 타깃=상단
  // 중앙)로 구한다 — parentId 체인을 걸어 폴더 2단 중첩(ADR-0053)까지 정확히 절대화한다. 레이아웃
  // (flowNodes/장애물/레인)이 안 바뀌면 memoize돼 커밋마다 재배선하지 않는다(ADR-0017/0008).
  const edgeBusPaths = useMemo<ReadonlyMap<string, Pt[]>>(() => {
    const byId = new Map(flowNodes.map((n) => [n.id, n]));
    const absCache = new Map<string, { x: number; y: number } | undefined>();
    const absPos = (id: string): { x: number; y: number } | undefined => {
      if (absCache.has(id)) return absCache.get(id);
      const node = byId.get(id);
      if (!node) {
        absCache.set(id, undefined);
        return undefined;
      }
      let x = node.position.x;
      let y = node.position.y;
      if (node.parentId) {
        const p = absPos(node.parentId);
        if (p) {
          x += p.x;
          y += p.y;
        }
      }
      const r = { x, y };
      absCache.set(id, r);
      return r;
    };
    const sizeOf = (node: Node): { w: number; h: number } => ({
      w: typeof node.style?.width === 'number' ? node.style.width : 0,
      h: typeof node.style?.height === 'number' ? node.style.height : 0,
    });
    const inputs: BusEdgeInput[] = [];
    for (const e of flowEdges) {
      if (typeof e.className !== 'string' || !e.className.includes('edge-cross-group')) continue;
      const sn = byId.get(e.source);
      const tn = byId.get(e.target);
      if (!sn || !tn) continue;
      const sp = absPos(e.source);
      const tp = absPos(e.target);
      if (!sp || !tp) continue;
      const ss = sizeOf(sn);
      const ts = sizeOf(tn);
      // 소스 = 바닥 중앙 핸들(Position.Bottom), 타깃 = 상단 중앙 핸들(Position.Top).
      inputs.push({ id: e.id, source: e.source, sx: sp.x + ss.w / 2, sy: sp.y + ss.h, tx: tp.x + ts.w / 2, ty: tp.y });
    }
    return routeCrossGroupBuses(inputs, edgeObstacles, (s) => edgeLanes.get(s) ?? laneOffsetForKey(s));
  }, [flowNodes, flowEdges, edgeObstacles, edgeLanes]);

  const afterglowVersion = useSyncExternalStore(afterglowStore.subscribe, afterglowStore.getVersion);
  const flowEdgesDecorated = useMemo(() => {
    const tracking = trackedIds.size > 0 && selectedNodeId !== null && trackedPropKey !== null;
    const holders = tracking ? new Set<number>([...trackedIds, selectedNodeId]) : null;
    if (!holders && !afterglowEnabled && !lineageActive) return flowEdges;
    // afterglowVersion은 heat 스냅샷을 갱신시키는 트리거로만 참조한다(값 자체는 안 씀).
    void afterglowVersion;
    // 혈통 간선이면 어느 장식 위에도 edge-lineage를 덧붙인다(추적/흐름 간선도 혈통이면 함께 점등).
    // 부모 도메인 색 클래스(edge-parent-palette-N)는 이미 toFlow가 모든 간선에 상시로 붙였으므로
    // 여기서는 edge-lineage만 얹으면 된다 — hover 시 CSS(.lineage-active)가 그 색을 강조로 키운다.
    const withLineage = (edge: Edge): Edge => {
      if (!lineageEdgeIds?.has(edge.id)) return edge;
      return { ...edge, className: `${edge.className ? `${edge.className} ` : ''}edge-lineage` };
    };
    return flowEdges.map((e) => {
      // 자식(target)이 참조를 받았으면 이 간선이 그 참조를 나른 것 — origin 간선(부모→선택 노드)도 포함.
      if (holders && holders.has(Number(e.target))) {
        return withLineage({
          ...e,
          className: `${e.className ? `${e.className} ` : ''}edge-tracked`,
          label: trackedPropKey,
          animated: true,
          zIndex: 20,
        });
      }
      // 흐름: 자식이 방금 바뀐 간선을 부모→자식으로 흐르게(animated=움직이는 점선, 방향 source→target).
      // 상세 모드는 노드 간선(target=노드 id), 지도 모드는 그룹↔그룹 집계 간선(target="group:...")이라
      // heat 채널을 target 종류로 나눠 조회한다(ADR-0032 Q2 "활동 기상도").
      if (afterglowEnabled) {
        const isGroupEdge = e.target.startsWith('group:');
        const targetHeat = isGroupEdge
          ? afterglowStore.getGroupHeat(e.target)
          : afterglowStore.getHeat(Number(e.target));
        if (targetHeat > AFTERGLOW_EDGE_HOT) {
          // 흐름 간선에 "지금 흐르는 대표 prop" 이름을 라벨로 얹는다(사용자 요청) — 노드 간선만.
          // 그룹 집계 간선(지도 모드)은 여러 노드가 섞여 대표 prop이 모호하므로 라벨 없음.
          let label: string | undefined;
          if (!isGroupEdge) {
            const fiber = store.getFiber(Number(e.target));
            label = fiber ? representativeChangedProp(fiber) : undefined;
          }
          return withLineage({
            ...e,
            className: `${e.className ? `${e.className} ` : ''}edge-hot`,
            label,
            animated: true,
            zIndex: 15,
          });
        }
      }
      return withLineage(e);
    });
  }, [flowEdges, trackedIds, selectedNodeId, trackedPropKey, afterglowEnabled, afterglowStore, afterglowVersion, lineageEdgeIds, lineageActive, store]);
  // ───────────────────────────────────────────────────────────────────────────

  return (
    // ADR-0032: ComponentNode가 자기 heat/추적 여부를 구독할 수 있도록 컨텍스트로 감싼다
    // (toFlow data가 아닌 이유는 AfterglowContext.tsx 상단 주석 참고 — decay 틱마다 flowNodes를
    // 다시 만들지 않기 위함).
    <AfterglowContext.Provider value={afterglowStore}>
      <TrackedNodesContext.Provider value={trackedIds}>
        <LineageNodesContext.Provider value={lineageNodeIds}>
          <PageHoveredNodeContext.Provider value={pageHoveredVisibleId}>
          <EdgeObstaclesContext.Provider value={edgeObstacles}>
          <EdgeLanesContext.Provider value={edgeLanes}>
          <EdgeBusPathsContext.Provider value={edgeBusPaths}>
        <div className="board">
      <header className={`toolbar${compactToolbar ? ' toolbar--compact' : ''}`}>
        {(() => {
          // 컨트롤들을 한 번만 정의해, 넓으면 인라인 / 좁으면 오버플로 메뉴 안에 같은 것을 넣는다
          // (중복 없음). 검색창과 카운트는 항상 툴바에 직접 둔다.
          const searchInput = (
            <input
              type="search"
              className="toolbar__search"
              placeholder="검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          );
          const controls = (
            <>
              <label className="toolbar__checkbox">
                <input
                  type="checkbox"
                  checked={includeHostNodes}
                  onChange={(e) => onIncludeHostNodesChange(e.target.checked)}
                />
                host 노드(div/span 등) 표시
              </label>
              <label className="toolbar__checkbox">
                <input type="checkbox" checked={filterToMatches} onChange={(e) => setFilterToMatches(e.target.checked)} />
                매치만 표시
              </label>
              {/* 지도 모드에서도 상세(ADR-0049) — 줌아웃해도 화면 안 그룹은 내부 컴포넌트를 보여준다.
                  뷰포트 컬링은 그대로라 화면 밖은 여전히 안 그림. "줌아웃하면 보던 게 사라진다" 해소책. */}
              <label className="toolbar__checkbox">
                <input type="checkbox" checked={wideDetail} onChange={(e) => setWideDetail(e.target.checked)} />
                지도에서도 상세
              </label>
              {/* 폴더 단위 2단 중첩(ADR-0053) — 파일 그룹을 상위 폴더 프레임으로 묶는다. 폴더 경로는
                  파이버 _debugStack에서 파싱(dev 전용), 못 얻으면 파일 그룹핑으로 폴백. */}
              <label className="toolbar__checkbox">
                <input type="checkbox" checked={nestFolders} onChange={(e) => setNestFolders(e.target.checked)} />
                폴더로 묶기
              </label>
              <button
                type="button"
                className="toolbar__theme-toggle"
                onClick={() => onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')}
              >
                {colorMode === 'dark' ? '라이트' : '다크'}
              </button>
              <button type="button" className="toolbar__sticky-add" onClick={addStickyNote}>
                메모 추가
              </button>
              {/* 흐름 토글 (ADR-0032) — props가 바뀌면 데이터가 부모→자식 간선을 타고 흐르는 걸
                  애니메이션으로 보여준다(주 동적 표현). 켜져 있을 때만 일시정지가 의미 있어 조건부. */}
              <button
                type="button"
                className={`toolbar__afterglow${afterglowEnabled ? ' toolbar__afterglow--on' : ''}`}
                onClick={() => onAfterglowEnabledChange(!afterglowEnabled)}
                title="props가 바뀌면 그 데이터가 간선을 타고 흐르는 걸 애니메이션으로 표시(ADR-0032)"
              >
                {afterglowEnabled ? 'props 흐름 보는 중' : 'props 흐름 보기'}
              </button>
              {afterglowEnabled && (
                <button
                  type="button"
                  className={`toolbar__afterglow-pause${afterglowPaused ? ' toolbar__afterglow-pause--on' : ''}`}
                  onClick={() => onAfterglowPausedChange(!afterglowPaused)}
                  title="보드 갱신을 멈추고 마지막 흐름 상태를 검사한다"
                >
                  {afterglowPaused ? '재생' : '일시정지'}
                </button>
              )}
            </>
          );
          if (compactToolbar) {
            return (
              <>
                {searchInput}
                <div className="toolbar__overflow">
                  <button
                    type="button"
                    className="toolbar__menu-btn"
                    aria-expanded={toolMenuOpen}
                    aria-label="도구 메뉴"
                    onClick={() => setToolMenuOpen((o) => !o)}
                  >
                    도구
                  </button>
                  {toolMenuOpen && (
                    <div className="toolbar__menu" role="menu" onClick={() => setToolMenuOpen(false)}>
                      {controls}
                    </div>
                  )}
                </div>
              </>
            );
          }
          return (
            <>
              {searchInput}
              {controls}
              {searchActive && <span className="toolbar__search-count">{matchedIds.size}건 일치</span>}
              <span className="toolbar__count">
                커밋 #{snapshot.commitId} · {visibleCount} / {totalCount} 노드 표시 중
              </span>
            </>
          );
        })()}
      </header>

      <div
        className={`canvas${searchActive ? ' search-active' : ''}${lineageActive ? ' lineage-active' : ''}${wideDetail ? ' wide-detail' : ''}`}
        ref={canvasRef}
      >
        {/* onlyRenderVisibleElements: 화면 밖 그룹/노드는 DOM에 렌더하지 않는다 (ADR-0009 ③,
            ADR-0010) — 위 뷰포트 기반 부분 재계산과는 다른 레이어의 방어다. 이건 "React Flow에
            얼마나 큰 nodes 배열을 넘기는가"를 줄이고, onlyRenderVisibleElements는 "그중 화면
            안쪽만 실제로 DOM에 그리는가"를 맡는다. */}
        <ReactFlow
          nodes={[...stableFlowNodes, ...stickyFlowNodes]}
          edges={onDemandSharedEdges.length ? [...flowEdgesDecorated, ...onDemandSharedEdges] : flowEdgesDecorated}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          // 더블클릭은 우리가 직접 "확대+스크롤+하이라이트"로 통합 처리하므로(handleNodeClick,
          // ADR-0043) React Flow 기본 더블클릭 줌은 끈다 — 안 그러면 커서 방향 줌과 fitView가 충돌한다.
          zoomOnDoubleClick={false}
          // hover 혈통 점등(연구문서 7절 c) — 컴포넌트 노드에만 반응(그룹/스티키는 무시).
          onNodeMouseEnter={(_, node) => {
            if (node.type === 'component') {
              setHoveredNodeId(Number(node.id));
              previewComponentNode(Number(node.id)); // 정방향 hover 프리뷰 → 실제 DOM 요소에 엣칭
              // 공유 컨테이너 "전체" 호버(pillar ②): 레인 컨테이너 내부 노드(예: DialogHeader)를
              // 호버해도 그 컨테이너의 사용처들로 on-demand 선이 뜬다 — 프레임 테두리뿐 아니라
              // UI 노드 전체가 트리거. 부모 그룹이 공유면 그 그룹으로 hover 설정.
              if (node.parentId && sharedConnections.sharedGroupIds.has(node.parentId)) {
                setHoveredSharedGroup(node.parentId);
              }
            } else if (node.type === 'group' && (node.data as GroupNodeData)?.shared) {
              // 공유 레인 그룹(프레임) 호버 → 사용처들로 on-demand 직선(pillar ②).
              setHoveredSharedGroup(node.id);
            }
          }}
          onNodeMouseLeave={() => {
            setHoveredNodeId(null);
            setHoveredSharedGroup(null);
            interactionStore.setHoverElements([]); // 실제 DOM 엣칭 프리뷰 해제
          }}
          onNodesChange={handleNodesChange}
          onPaneClick={() => {
            setContextMenu(null);
            setToolMenuOpen(false);
          }}
          onMoveStart={() => setContextMenu(null)}
          colorMode={colorMode}
          fitView
          // 0.05(5%) 바닥에 막히면 대규모(그룹 100+/노드 수천)에서 fitView가 요구하는 줌이
          // 그보다 낮아도 못 내려가 콘텐츠 대부분이 화면 밖에 남는다 (ADR-0014, P2). 순수
          // 레이아웃 계산은 5,000노드까지도 병목이 아니었고(ADR-0014), 낮은 줌에서 개별 노드는
          // 어차피 지도 모드로 접혀 그려지지 않으므로(ADR-0016 ①) 훨씬 낮춰도 비용이 들지 않는다.
          minZoom={0.001}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onlyRenderVisibleElements
        >
          <Background gap={24} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              if (n.type === 'group') {
                const idx = (n.data as GroupNodeData).colorIndex;
                return idx !== undefined ? `${paletteHex(idx, colorMode)}20` : '#33415520';
              }
              const idx = (n.data as ComponentNodeData).colorIndex;
              return idx !== undefined ? paletteHex(idx, colorMode) : '#6366f1';
            }}
          />
          <SemanticZoomController targetRef={canvasRef} />
        </ReactFlow>
        {/* ADR-0032: 노드 선택 시 뜨는 props 패널. .canvas 기준 우측에 절대 배치(flow.css). */}
        {selectedNodeId !== null && (
          <PropsPanel
            displayName={selectedDisplayName}
            rows={propRows}
            trackedKey={trackedPropKey}
            onTrackProp={handleTrackProp}
            onClose={closePropsPanel}
          />
        )}
      </div>
      <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
        </div>
          </EdgeBusPathsContext.Provider>
          </EdgeLanesContext.Provider>
          </EdgeObstaclesContext.Provider>
          </PageHoveredNodeContext.Provider>
        </LineageNodesContext.Provider>
      </TrackedNodesContext.Provider>
    </AfterglowContext.Provider>
  );
}

export interface CanvasProps {
  store: RenderStore;
  /**
   * 보드↔DOM 양방향 인터랙션(ADR-0024/0025) 공유 상태. 생략하면 내부에서 하나 만들어 쓴다 —
   * 정방향(노드 클릭 → DOM 하이라이트)은 그 자체로 동작하고, 역방향(DOM 클릭 → 보드 이동)은
   * 호출자가 별도로 startDomClickBridge를 안 붙였다면 자연히 비활성 상태로 남는다. 이 하위
   * 호환 경로는 experiments/real-app-validation의 검증용 사본처럼 interactionStore를 아직
   * 모르는 통합이 깨지지 않게 하기 위한 것이다.
   */
  interactionStore?: InteractionStore;
}

export function Canvas({ store, interactionStore }: CanvasProps) {
  const liveSnapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [includeHostNodes, setIncludeHostNodes] = useState(false);
  // 변경 잔상 (ADR-0032). enabled=토글 모드 on/off, paused=검사용 일시정지. 둘 다 여기(Canvas)에
  // 두는 이유: paused가 snapshot 자체를 얼려 "보드 갱신을 멈추고 검사"(ADR-0032)를 구현하는데,
  // 그 freeze를 데이터 진입점인 여기서 한 번에 하면 BoardContent의 snapshot 사용처를 하나도
  // 안 바꿔도 된다(공유 파일 변경 최소화).
  const [afterglowEnabled, setAfterglowEnabled] = useState(false);
  const [afterglowPaused, setAfterglowPaused] = useState(false);
  const afterglowStoreRef = useRef<AfterglowStore | null>(null);
  if (!afterglowStoreRef.current) afterglowStoreRef.current = createAfterglowStore();
  const afterglowStore = afterglowStoreRef.current;
  // 일시정지: 마지막 커밋 snapshot을 고정해 보드 전체(노드/패널/추적/잔상)를 한꺼번에 멈춘다.
  const frozenSnapshotRef = useRef(liveSnapshot);
  if (!afterglowPaused) frozenSnapshotRef.current = liveSnapshot;
  const snapshot = afterglowPaused ? frozenSnapshotRef.current : liveSnapshot;
  // afterglowStore와 UI 토글 상태 동기화: 일시정지 반영, 모드 끄면 heat 즉시 정리, 언마운트 정리.
  useEffect(() => {
    afterglowStore.setPaused(afterglowPaused);
  }, [afterglowStore, afterglowPaused]);
  useEffect(() => {
    if (!afterglowEnabled) afterglowStore.clear();
  }, [afterglowStore, afterglowEnabled]);
  useEffect(() => () => afterglowStore.dispose(), [afterglowStore]);
  // 다크모드(ADR-0027) — includeHostNodes와 같은 자리(단순 토글, 최초 1회 localStorage
  // 하이드레이션)에 lift한다. 'light'|'dark' 이진 토글만 지원 — 'system'까지 넣으면 xyflow의
  // colorMode prop과 우리 자신의 body 클래스(아래 이펙트) 두 트리거를 항상 같은 리터럴로
  // 동기화하기 번거로워져 스코프를 좁혔다.
  const [colorMode, setColorMode] = useState<BoardColorMode>(() => getStoredColorMode() ?? 'light');
  const handleColorModeChange = (mode: BoardColorMode) => {
    setColorMode(mode);
    setStoredColorMode(mode);
  };
  // xyflow의 colorMode prop은 `.react-flow` 루트에만 dark/light 클래스를 붙여 그 안의 커스텀
  // 노드는 스코프하지만, `.toolbar`/`.board-panel`(BoardOverlay.tsx)처럼 `.react-flow` "밖"에
  // 있는 조상 요소는 CSS로 못 내려온다 — BoardOverlay.tsx가 이미 rrb-board-open/rrb-pick-mode에
  // 쓰는 것과 같은 방식으로 document.body에 클래스를 달아 그 크롬까지 스타일을 도달시킨다.
  useEffect(() => {
    document.body.classList.toggle('rrb-dark-mode', colorMode === 'dark');
    return () => {
      document.body.classList.remove('rrb-dark-mode');
    };
  }, [colorMode]);
  // 레이아웃 엔진은 커밋을 넘나들며 그룹 순서/그룹별 내부 배치를 기억해야 하므로 ref에 한 번만 만든다
  // (layout.ts 참고 — 매 렌더마다 새로 만들면 "그룹 순서 고정 + 그룹 단위 메모이제이션"이 무의미해진다).
  const engineRef = useRef<ReturnType<typeof createLayoutEngine> | null>(null);
  if (!engineRef.current) engineRef.current = createLayoutEngine();
  const interactionStoreRef = useRef<InteractionStore | null>(null);
  if (!interactionStoreRef.current) interactionStoreRef.current = interactionStore ?? createInteractionStore();

  return (
    // BoardContent가 뷰포트(useViewport/useStore)를 읽어야 해서 ReactFlowProvider 안에 있어야
    // 한다 — Provider 자체는 DOM을 만들지 않으므로 .board/.toolbar/.canvas 구조는 그대로다.
    <ReactFlowProvider>
      <BoardContent
        store={store}
        interactionStore={interactionStoreRef.current}
        snapshot={snapshot}
        includeHostNodes={includeHostNodes}
        onIncludeHostNodesChange={setIncludeHostNodes}
        engine={engineRef.current}
        colorMode={colorMode}
        onColorModeChange={handleColorModeChange}
        afterglowStore={afterglowStore}
        afterglowEnabled={afterglowEnabled}
        afterglowPaused={afterglowPaused}
        onAfterglowEnabledChange={setAfterglowEnabled}
        onAfterglowPausedChange={setAfterglowPaused}
      />
    </ReactFlowProvider>
  );
}
