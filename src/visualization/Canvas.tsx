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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow.css';
import type { RenderStore } from '../data/store';
import { normalizeForCanvas, PENDING_GROUP } from './lib/normalize';
import { createLayoutEngine, type Rect } from './lib/layout';
import { toFlow } from './lib/toFlow';
import { worldRectFromViewport, expandRect, rectsIntersect } from './lib/geometry';
import { GroupNode } from './components/GroupNode';
import { ComponentNode } from './components/ComponentNode';
import { SemanticZoomController, MAP_MODE_THRESHOLD } from './components/SemanticZoomController';

const nodeTypes = { group: GroupNode, component: ComponentNode };

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
  snapshot: ReturnType<RenderStore['getSnapshot']>;
  includeHostNodes: boolean;
  onIncludeHostNodesChange: (value: boolean) => void;
  engine: ReturnType<typeof createLayoutEngine>;
}

function BoardContent({ snapshot, includeHostNodes, onIncludeHostNodesChange, engine }: BoardContentProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewport = useSettledViewport();
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);
  const isMapMode = viewport.zoom < MAP_MODE_THRESHOLD;

  const { flowNodes, flowEdges, visibleCount, totalCount, groupNames } = useMemo(() => {
    const visible = normalizeForCanvas(snapshot.nodes, { includeHostNodes });
    // PENDING_GROUP은 groupHint가 아직 비동기로 안 채워졌을 뿐인 "임시" 상태라, 이 그룹의
    // 등장/소멸만으로 카메라를 다시 맞추면 안 된다 — 실제 그룹 집합 변화만 추적한다.
    const groupNames = new Set(visible.map((n) => n.group).filter((g) => g !== PENDING_GROUP));

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

    const shouldExpandGroup = (frame: Rect) => {
      if (isMapMode) return false;
      if (!viewRect) return true; // 아직 팬 크기를 모르는 첫 렌더는 안전하게 전부 펼친다.
      return rectsIntersect(frame, viewRect);
    };

    const { flowNodes, flowEdges } = toFlow(visible, engine, { shouldExpandGroup });
    return { flowNodes, flowEdges, visibleCount: visible.length, totalCount: snapshot.nodes.length, groupNames };
  }, [snapshot, includeHostNodes, engine, viewport, paneWidth, paneHeight, isMapMode]);

  useAutoRefit(groupNames);

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
        <span className="toolbar__count">
          커밋 #{snapshot.commitId} · {visibleCount} / {totalCount} 노드 표시 중
        </span>
      </header>

      <div className="canvas" ref={canvasRef}>
        {/* onlyRenderVisibleElements: 화면 밖 그룹/노드는 DOM에 렌더하지 않는다 (ADR-0009 ③,
            ADR-0010) — 위 뷰포트 기반 부분 재계산과는 다른 레이어의 방어다. 이건 "React Flow에
            얼마나 큰 nodes 배열을 넘기는가"를 줄이고, onlyRenderVisibleElements는 "그중 화면
            안쪽만 실제로 DOM에 그리는가"를 맡는다. */}
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
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
          <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'group' ? '#33415520' : '#6366f1')} />
          <SemanticZoomController targetRef={canvasRef} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function Canvas({ store }: { store: RenderStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [includeHostNodes, setIncludeHostNodes] = useState(false);
  // 레이아웃 엔진은 커밋을 넘나들며 그룹 순서/그룹별 내부 배치를 기억해야 하므로 ref에 한 번만 만든다
  // (layout.ts 참고 — 매 렌더마다 새로 만들면 "그룹 순서 고정 + 그룹 단위 메모이제이션"이 무의미해진다).
  const engineRef = useRef<ReturnType<typeof createLayoutEngine> | null>(null);
  if (!engineRef.current) engineRef.current = createLayoutEngine();

  return (
    // BoardContent가 뷰포트(useViewport/useStore)를 읽어야 해서 ReactFlowProvider 안에 있어야
    // 한다 — Provider 자체는 DOM을 만들지 않으므로 .board/.toolbar/.canvas 구조는 그대로다.
    <ReactFlowProvider>
      <BoardContent
        snapshot={snapshot}
        includeHostNodes={includeHostNodes}
        onIncludeHostNodesChange={setIncludeHostNodes}
        engine={engineRef.current}
      />
    </ReactFlowProvider>
  );
}
