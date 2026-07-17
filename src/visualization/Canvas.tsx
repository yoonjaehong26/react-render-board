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
import { paletteHex } from './lib/groupColor';
import { getStoredColorMode, setStoredColorMode } from './lib/colorModePreference';
import { loadStickyNotes, saveStickyNotes, createStickyNoteId, type StickyNote } from './lib/stickyNotes';
import { GroupNode } from './components/GroupNode';
import { ComponentNode } from './components/ComponentNode';
import { StickyNoteNode, type StickyNoteNodeData } from './components/StickyNoteNode';
import { ContextMenu, type ContextMenuState } from './components/ContextMenu';
import { SemanticZoomController, MAP_MODE_THRESHOLD } from './components/SemanticZoomController';

const nodeTypes = { group: GroupNode, component: ComponentNode, sticky: StickyNoteNode };

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

  const { flowNodes, flowEdges, visibleCount, totalCount, groupNames, visibleIds, matchedIds } = useMemo(() => {
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
      if (group === highlightedGroup || matchedGroups.has(group)) return true;
      if (manuallyCollapsedGroups.has(group)) return false; // 그룹 접기/펼치기 (ADR-0029)
      if (isMapMode) return false;
      if (!viewRect) return true; // 아직 팬 크기를 모르는 첫 렌더는 안전하게 전부 펼친다.
      return rectsIntersect(frame, viewRect);
    };

    const { flowNodes, flowEdges } = toFlow(visible, engine, {
      shouldExpandGroup,
      highlightedNodeId,
      matchedIds,
      manuallyCollapsedGroups,
      onToggleGroupCollapse: toggleGroupCollapse,
    });
    return {
      flowNodes,
      flowEdges,
      visibleCount: visible.length,
      totalCount: snapshot.nodes.length,
      groupNames,
      visibleIds,
      matchedIds,
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
    manuallyCollapsedGroups,
  ]);

  useAutoRefit(groupNames);

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

  // 정방향 인터랙션(ADR-0024/0025): 보드 노드 클릭 → 대응하는 실제 DOM 요소를 하이라이트한다.
  // 도킹 패널(ADR-0025)이라 보드를 닫을 필요가 없다 — 계측 대상 앱은 패널이 열려 있는 동안에도
  // 항상 화면에 보이고 조작 가능하다. 그룹 프레임 클릭(node.type !== 'component')은 무시한다
  // — ADR-0024 결정 5가 DOM 오버레이를 요소 단위로 제한했다.
  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    setContextMenu(null);
    if (node.type !== 'component') return;
    highlightComponentNode(Number(node.id));
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

  return (
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
          edges={flowEdges}
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
      </div>
      <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
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
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [includeHostNodes, setIncludeHostNodes] = useState(false);
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
      />
    </ReactFlowProvider>
  );
}
