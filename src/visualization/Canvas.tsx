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
  type NodeChange,
  type NodeMouseHandler,
  type OnNodesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow.css';
import type { RenderStore } from '../data/store';
import { resolveHostElements } from '../hooking/domInteraction';
import { normalizeForCanvas, PENDING_GROUP, resolveVisibleId } from './lib/normalize';
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
import { paletteHex } from './lib/groupColor';
import { getStoredColorMode, setStoredColorMode } from './lib/colorModePreference';
import { loadStickyNotes, saveStickyNotes, createStickyNoteId, type StickyNote } from './lib/stickyNotes';
import { GroupNode } from './components/GroupNode';
import { ComponentNode } from './components/ComponentNode';
import { BoundaryFrame } from './components/BoundaryFrame';
import { StickyNoteNode, type StickyNoteNodeData } from './components/StickyNoteNode';
import { ContextMenu, type ContextMenuState } from './components/ContextMenu';
import { SemanticZoomController, MAP_MODE_THRESHOLD } from './components/SemanticZoomController';
// props 흐름 추적 + 변경 잔상 (ADR-0032) — 아래 "ADR-0032" 주석이 붙은 코드 조각들이 이 기능이다.
import { PropsPanel } from './components/PropsPanel';
import { AfterglowContext, TrackedNodesContext } from './components/AfterglowContext';
import { createAfterglowStore, type AfterglowStore } from './lib/afterglowStore';
import {
  readFiberProps,
  isTrackable,
  fiberPropsChanged,
  trackReferenceInDescendants,
  type PropRow,
} from './lib/propsFlow';

const nodeTypes = { group: GroupNode, component: ComponentNode, boundary: BoundaryFrame, sticky: StickyNoteNode };

// prop 참조 추적(ADR-0032)이 비어 있을 때 재사용하는 안정된 빈 집합 — 매번 새 Set을 만들어
// useMemo/context가 불필요하게 갱신되지 않게 한다.
const EMPTY_TRACKED_IDS: ReadonlySet<number> = new Set();

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
  const { navigateToNodeId, navigateRequestId } = useSyncExternalStore(
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
    const visible = normalizeForCanvas(snapshot.nodes, { includeHostNodes });
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
    const viewRect =
      !isMapMode && paneWidth > 0 && paneHeight > 0
        ? expandRect(worldRectFromViewport(viewport, paneWidth, paneHeight), VIEWPORT_EXPAND_MARGIN)
        : null;

    const shouldExpandGroup = (frame: Rect, group: string) => {
      // 검색 매치나 역방향 착지 지점을 담은 그룹은 뷰포트/지도 모드는 물론 사용자의 수동
      // 접기보다도 우선해 강제로 펼친다 — 안 그러면 매치/착지된 노드가 flowNodes 배열에
      // 아예 없어(ADR-0017) 하이라이트도 fitView도 대상이 존재하지 않는 조용한 실패가 된다.
      // "검색은 언제나 이긴다"는 ui-philosophy.md의 탈출구 원칙을 그룹 접기에도 그대로 적용한다.
      if (group === highlightedGroup || matchedGroups.has(group) || trackedGroups.has(group)) return true;
      if (manuallyCollapsedGroups.has(group)) return false; // 그룹 접기/펼치기 (ADR-0029)
      if (isMapMode) return false;
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
    highlightedNodeId,
    searchQuery,
    filterToMatches,
    manuallyCollapsedGroups,
    colorMode,
    boundaryMemberships, // ADR-0028: 경계 프레임
    trackedIds, // ADR-0032: 추적 대상 그룹 강제 확장 반영
  ]);

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
  useEffect(() => {
    if (navigateToNodeId === null) return;
    const visibleId = resolveVisibleId(snapshot.nodes, visibleIds, navigateToNodeId);
    if (visibleId !== null) setHighlightedNodeId(visibleId);
    interactionStore.consumeNavigate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateRequestId]);

  // 위 이펙트가 highlightedNodeId를 갱신하면 highlightedNodeId가 useMemo 의존성에 있어 다음
  // 렌더에서 shouldExpandGroup이 그 그룹을 강제로 펼친 flowNodes를 만든다 — 이 이펙트는 그
  // 노드가 실제로 flowNodes에 존재하는 걸 확인한 뒤에만 fitView한다. firedForRequestRef로
  // navigateRequestId 하나당 정확히 한 번만 fitView하도록 가드한다(이미 펼쳐져 있던 그룹이면
  // 첫 렌더에서 바로, 접혀 있었다면 강제 확장이 반영된 다음 렌더에서 발동한다).
  const firedForRequestRef = useRef<number>(-1);
  useEffect(() => {
    if (highlightedNodeId === null) return;
    if (firedForRequestRef.current === navigateRequestId) return;
    const present = flowNodes.some((n) => n.id === String(highlightedNodeId));
    if (!present) return;
    firedForRequestRef.current = navigateRequestId;
    fitView({ nodes: [{ id: String(highlightedNodeId) }], duration: 400 });
  }, [highlightedNodeId, flowNodes, navigateRequestId, fitView]);

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

  // 더블클릭(ADR-0043): 단일 클릭 하이라이트보다 강한 "여기로 데려가줘" — 대응하는 실제 DOM
  // 요소를 화면 안으로 스크롤한 뒤 하이라이트한다. 오버레이 패널(ADR-0040)이 앱 일부를 덮거나
  // 요소가 스크롤로 밀려나 안 보일 때, 더블클릭 한 번으로 그 요소를 실제 화면에 데려온다.
  // (라우터 이동은 하지 않는다 — 노드로 보인다 = 지금 마운트돼 있다 = 이미 현재 라우트다.)
  const revealComponentNode = (id: number) => {
    const fiber = store.getFiber(id);
    if (!fiber) return;
    const elements = resolveHostElements(fiber);
    if (elements.length === 0) return;
    elements[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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
      // 더블클릭 = 스크롤 이동 + 하이라이트(단일 클릭의 하이라이트보다 강한 "여기로 데려가줘").
      lastNodeClickRef.current = null;
      revealComponentNode(id);
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

  const stickyFlowNodes: Node[] = stickyNotes.map((note) => ({
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
  }));

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
  const afterglowVersion = useSyncExternalStore(afterglowStore.subscribe, afterglowStore.getVersion);
  const flowEdgesDecorated = useMemo(() => {
    const tracking = trackedIds.size > 0 && selectedNodeId !== null && trackedPropKey !== null;
    const holders = tracking ? new Set<number>([...trackedIds, selectedNodeId]) : null;
    if (!holders && !afterglowEnabled) return flowEdges;
    // afterglowVersion은 heat 스냅샷을 갱신시키는 트리거로만 참조한다(값 자체는 안 씀).
    void afterglowVersion;
    return flowEdges.map((e) => {
      // 자식(target)이 참조를 받았으면 이 간선이 그 참조를 나른 것 — origin 간선(부모→선택 노드)도 포함.
      if (holders && holders.has(Number(e.target))) {
        return {
          ...e,
          className: `${e.className ? `${e.className} ` : ''}edge-tracked`,
          label: trackedPropKey,
          animated: true,
          zIndex: 20,
        };
      }
      // 흐름: 자식이 방금 바뀐 간선을 부모→자식으로 흐르게(animated=움직이는 점선, 방향 source→target).
      // 상세 모드는 노드 간선(target=노드 id), 지도 모드는 그룹↔그룹 집계 간선(target="group:...")이라
      // heat 채널을 target 종류로 나눠 조회한다(ADR-0032 Q2 "활동 기상도").
      if (afterglowEnabled) {
        const targetHeat = e.target.startsWith('group:')
          ? afterglowStore.getGroupHeat(e.target)
          : afterglowStore.getHeat(Number(e.target));
        if (targetHeat > AFTERGLOW_EDGE_HOT) {
          return { ...e, className: `${e.className ? `${e.className} ` : ''}edge-hot`, animated: true, zIndex: 15 };
        }
      }
      return e;
    });
  }, [flowEdges, trackedIds, selectedNodeId, trackedPropKey, afterglowEnabled, afterglowStore, afterglowVersion]);
  // ───────────────────────────────────────────────────────────────────────────

  return (
    // ADR-0032: ComponentNode가 자기 heat/추적 여부를 구독할 수 있도록 컨텍스트로 감싼다
    // (toFlow data가 아닌 이유는 AfterglowContext.tsx 상단 주석 참고 — decay 틱마다 flowNodes를
    // 다시 만들지 않기 위함).
    <AfterglowContext.Provider value={afterglowStore}>
      <TrackedNodesContext.Provider value={trackedIds}>
        <div className="board">
      <header className="toolbar">
        <label className="toolbar__checkbox">
          <input
            type="checkbox"
            checked={includeHostNodes}
            onChange={(e) => onIncludeHostNodesChange(e.target.checked)}
          />
          host 노드(div/span 등) 표시
        </label>
        <input
          type="search"
          className="toolbar__search"
          placeholder="컴포넌트/도메인 검색…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <label className="toolbar__checkbox">
          <input
            type="checkbox"
            checked={filterToMatches}
            onChange={(e) => setFilterToMatches(e.target.checked)}
          />
          매치만 표시
        </label>
        {searchActive && <span className="toolbar__search-count">{matchedIds.size}건 일치</span>}
        <button
          type="button"
          className="toolbar__theme-toggle"
          onClick={() => onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')}
        >
          {colorMode === 'dark' ? '☀️ 라이트' : '🌙 다크'}
        </button>
        <button type="button" className="toolbar__sticky-add" onClick={addStickyNote}>
          🗒️ 메모 추가
        </button>
        {/* 흐름 토글 (ADR-0032) — props가 바뀌면 데이터가 부모→자식 간선을 타고 흐르는 걸 애니메이션
            으로 보여준다(우리 어법의 주 동적 표현). always-on이 아니라 opt-in 토글이고(ADR-0017
            일관), 켜져 있을 때만 일시정지가 의미 있어 조건부로 보여준다. */}
        <button
          type="button"
          className={`toolbar__afterglow${afterglowEnabled ? ' toolbar__afterglow--on' : ''}`}
          onClick={() => onAfterglowEnabledChange(!afterglowEnabled)}
          title="props가 바뀌면 그 데이터가 간선을 타고 흐르는 걸 애니메이션으로 표시(ADR-0032)"
        >
          {afterglowEnabled ? '🌊 흐름 켜짐' : '🌊 흐름'}
        </button>
        {afterglowEnabled && (
          <button
            type="button"
            className={`toolbar__afterglow-pause${afterglowPaused ? ' toolbar__afterglow-pause--on' : ''}`}
            onClick={() => onAfterglowPausedChange(!afterglowPaused)}
            title="보드 갱신을 멈추고 마지막 흐름 상태를 검사한다"
          >
            {afterglowPaused ? '▶ 재생' : '⏸ 일시정지'}
          </button>
        )}
        <span className="toolbar__count">
          커밋 #{snapshot.commitId} · {visibleCount} / {totalCount} 노드 표시 중
        </span>
      </header>

      <div className={`canvas${searchActive ? ' search-active' : ''}`} ref={canvasRef}>
        {/* onlyRenderVisibleElements: 화면 밖 그룹/노드는 DOM에 렌더하지 않는다 (ADR-0009 ③,
            ADR-0010) — 위 뷰포트 기반 부분 재계산과는 다른 레이어의 방어다. 이건 "React Flow에
            얼마나 큰 nodes 배열을 넘기는가"를 줄이고, onlyRenderVisibleElements는 "그중 화면
            안쪽만 실제로 DOM에 그리는가"를 맡는다. */}
        <ReactFlow
          nodes={[...flowNodes, ...stickyFlowNodes]}
          edges={flowEdgesDecorated}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onNodesChange={handleNodesChange}
          onPaneClick={() => setContextMenu(null)}
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
