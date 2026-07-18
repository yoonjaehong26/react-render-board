import { useViewport, type NodeProps } from '@xyflow/react';
import type { FolderNodeData } from '../lib/toFlow';

// 폴더 프레임(폴더 단위 2단 중첩, ADR-0053) — 파일 그룹(GroupNode) 여러 개를 감싸는 바깥 프레임.
// GroupNode와 별도 노드 타입이라 파일 프레임 고유 관심사(rough 테두리/경계 링/heat/팔레트)를 안
// 섞는다. 시각적으로는 파일 프레임보다 뒤(zIndex:-2)에서 은은한 실선 테두리로 "이 파일들이 한
// 폴더"임만 표시한다. 라벨은 GroupNode처럼 캔버스 줌의 역수를 곱해(지도 모드에서도) 읽을 수 있는
// 화면 기준 크기를 유지한다(GroupNode.tsx의 counterScale과 같은 기법).
export function FolderNode({ data }: NodeProps) {
  const { label, path, count } = data as FolderNodeData;
  const { zoom } = useViewport();
  const counterScale = 1 / Math.max(zoom, 0.001);
  const labelStyle = { transform: `scale(${counterScale})`, transformOrigin: 'left center' };

  return (
    <div className="folder-node" title={path}>
      <div className="folder-node__header">
        <span className="folder-node__icon" aria-hidden="true" style={labelStyle}>
          📁
        </span>
        <span className="folder-node__label" style={labelStyle}>
          {label}
        </span>
        <span className="folder-node__count" style={labelStyle}>
          {count}
        </span>
      </div>
    </div>
  );
}
