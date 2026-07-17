import { useMemo, useRef, useState } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow.css';
import { sampleSmall } from './data/sampleSmall';
import { sampleLarge, sampleXLarge2000, sampleXLarge5000, sampleManyGroups } from './data/generateLargeTree';
import { preprocessFiberTree, type AnonymousMode } from './lib/preprocess';
import { toFlow } from './lib/toFlow';
import { GroupNode } from './components/GroupNode';
import { ComponentNode } from './components/ComponentNode';
import { SemanticZoomController } from './components/SemanticZoomController';

const nodeTypes = { group: GroupNode, component: ComponentNode };

type Dataset = 'small' | 'large' | 'xlarge2000' | 'xlarge5000' | 'manyGroups';

const DATASETS: Record<Dataset, () => import('./data/types').RawFiberNode[]> = {
  small: () => sampleSmall,
  large: () => sampleLarge,
  xlarge2000: () => sampleXLarge2000,
  xlarge5000: () => sampleXLarge5000,
  manyGroups: () => sampleManyGroups,
};

function App() {
  const [dataset, setDataset] = useState<Dataset>('small');
  const [includeHostNodes, setIncludeHostNodes] = useState(false);
  const [anonymousMode, setAnonymousMode] = useState<AnonymousMode>('filter');
  const canvasRef = useRef<HTMLDivElement>(null);

  const raw = DATASETS[dataset]();

  // roadmap.md의 "초기 로드/전체 재배치 시간이 노드 수에 비례해서 늘어나는지" 검증용 계측.
  // preprocess+layout+toFlow는 전부 동기 계산이라 Date.now() 래핑만으로 충분하다.
  const { flowNodes, flowEdges, visibleCount, totalCount, computeMs } = useMemo(() => {
    const t0 = performance.now();
    const normalized = preprocessFiberTree(raw, { includeHostNodes, anonymousMode });
    const { flowNodes, flowEdges } = toFlow(normalized);
    const computeMs = performance.now() - t0;
    return {
      flowNodes,
      flowEdges,
      visibleCount: normalized.length,
      totalCount: raw.length,
      computeMs,
    };
  }, [raw, includeHostNodes, anonymousMode]);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar__group">
          <span className="toolbar__label">데이터셋</span>
          <select value={dataset} onChange={(e) => setDataset(e.target.value as Dataset)}>
            <option value="small">small (exp1 재현, {sampleSmall.length}개)</option>
            <option value="large">large (대규모, {sampleLarge.length}개)</option>
            <option value="xlarge2000">xlarge2000 (스트레스, {sampleXLarge2000.length}개)</option>
            <option value="xlarge5000">xlarge5000 (스트레스, {sampleXLarge5000.length}개)</option>
            <option value="manyGroups">manyGroups (그룹 120개, {sampleManyGroups.length}개)</option>
          </select>
        </div>

        <div className="toolbar__group">
          <span className="toolbar__label">익명 Fiber</span>
          <select value={anonymousMode} onChange={(e) => setAnonymousMode(e.target.value as AnonymousMode)}>
            <option value="filter">걸러내고 재연결 (기본)</option>
            <option value="dim">남기고 흐리게 표시</option>
          </select>
        </div>

        <label className="toolbar__checkbox">
          <input
            type="checkbox"
            checked={includeHostNodes}
            onChange={(e) => setIncludeHostNodes(e.target.checked)}
          />
          host 노드(div/span 등) 표시
        </label>

        <span className="toolbar__count">
          {visibleCount} / {totalCount} 노드 표시 중 · <span className="toolbar__compute-ms">{computeMs.toFixed(1)}ms 계산</span>
        </span>
      </header>

      <div className="canvas" ref={canvasRef}>
        <ReactFlowProvider>
          <ReactFlow
            key={dataset}
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.05}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} />
            <Controls />
            <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'group' ? '#33415520' : '#6366f1')} />
            <SemanticZoomController targetRef={canvasRef} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}

export default App;
