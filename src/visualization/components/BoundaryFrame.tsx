import type { NodeProps } from '@xyflow/react';
import type { BoundaryFrameData } from '../lib/boundaryFrames';

// 경계(포탈/Suspense/에러 바운더리)를 감싸는 "이름표 붙은 프레임"(도형 어휘, ADR-0028). 개발자가
// 이미 아는 단어(Suspense/Error boundary)를 그대로 이름표로 써서 범례 없이 바로 읽히게 한다
// (React DevTools가 특수 컴포넌트를 이름으로 보여주는 것과 같은 결). 클릭을 가로채지 않도록
// pointer-events는 CSS에서 none, React Flow 노드로도 selectable/draggable:false(boundaryFrames.ts).
const BOUNDARY_LABEL: Record<BoundaryFrameData['kind'], string> = {
  portal: 'Portal → 다른 DOM 위치',
  suspense: 'Suspense',
  errorBoundary: 'Error boundary',
};

export function BoundaryFrame({ data }: NodeProps) {
  const { kind } = data as BoundaryFrameData;
  return (
    <div className={`boundary-frame boundary-frame--${kind}`}>
      <span className="boundary-frame__label">{BOUNDARY_LABEL[kind]}</span>
    </div>
  );
}
