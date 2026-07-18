import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComponentNodeData } from '../lib/toFlow';
import { nodeBorderImage, ROUGH_FILL_MATCHED, ROUGH_FILL_HIGHLIGHTED } from '../lib/roughStyle';
// props 흐름/변경 잔상(ADR-0032) — heat와 tracked는 toFlow data가 아니라 context로 받는다
// (AfterglowContext.tsx 상단 주석 참고: decay 틱마다 flowNodes를 다시 만들지 않기 위함).
import { useAfterglowHeat, useIsTracked } from './AfterglowContext';

export function ComponentNode({ id, data }: NodeProps) {
  const {
    displayName,
    kind,
    isAnonymous,
    crossGroup,
    pending,
    highlighted,
    matched,
    colorIndex,
    isRouteEntry,
    colorMode,
  } = data as ComponentNodeData;
  // ADR-0032: 이 노드의 변경 잔상 heat(0~1)와 참조 추적 강조 여부. 잔상 모드가 꺼져 있거나
  // 이 노드가 대상이 아니면 각각 0/false라 아무 것도 더 그리지 않는다.
  const heat = useAfterglowHeat(Number(id));
  const tracked = useIsTracked(Number(id));
  // 변경 잔상 색: heat가 낮을수록(가끔 바뀜) 차가운 파랑, 높을수록(지금 자주 리렌더) 뜨거운
  // 빨강 — React DevTools "Highlight updates"의 "빈도=색" 관례. 파랑→보라→마젠타→빨강 경로를
  // 써서(초록/청록을 피함) 검색 매치(초록 outline)·참조 추적(청록 링)과 색이 안 겹치게 한다.
  // 글로우가 아니라 또렷한 링으로 위치를 정확히 짚고, decay가 진행되며 색이 천천히 식는다.
  const heatColor =
    heat > 0 ? `hsl(${Math.round((240 + 120 * Math.min(1, heat)) % 360)} 85% 56%)` : undefined;
  const classes = ['component-node', `component-node--${kind}`];
  if (isAnonymous) classes.push('component-node--anonymous');
  if (crossGroup) classes.push('component-node--cross-group');
  if (pending) classes.push('component-node--pending');
  if (highlighted) classes.push('component-node--highlighted');
  if (matched) classes.push('component-node--matched');
  if (isRouteEntry) classes.push('component-node--route'); // 6각형 clip-path (ADR-0028)
  if (tracked) classes.push('component-node--tracked'); // prop 참조 추적 하이라이트(ADR-0032)
  if (colorIndex !== undefined) classes.push(`component-node--palette-${colorIndex}`);

  // Excalidraw풍 손그림 테두리(roughStyle.ts, ADR-0030) — 고정 크기라 미리 계산해 둔 정적
  // 이미지를 (역할/kind/다크모드)로 골라 공유한다(노드별 런타임 계산 없음). 강조 상태(검색
  // 매치=햇칭, 픽/역방향 착지=마커)는 테두리 아래에 채움 이미지를 겹쳐 "형광펜으로 짚은"
  // 느낌을 준다 — background-image는 앞에 오는 레이어가 위로 쌓이므로 [강조채움, 테두리] 순서로
  // 겹치면 테두리가 맨 위, 채움이 배경색 위에 온다.
  const border = nodeBorderImage(kind, colorMode, isRouteEntry);
  const emphasisFill = highlighted ? ROUGH_FILL_HIGHLIGHTED : matched ? ROUGH_FILL_MATCHED : null;
  const backgroundImage = emphasisFill ? `${border}, ${emphasisFill}` : border;

  return (
    <div className={classes.join(' ')} style={{ backgroundImage }}>
      {/* 변경 잔상(ADR-0032) — heat 색(파랑=가끔→빨강=자주)을 두른 또렷한 링. color를 인라인으로
          주면 flow.css의 border/box-shadow가 currentColor로 그 색을 따른다. pointer-events는 CSS에서 none. */}
      {heat > 0 && (
        <div
          className="component-node__afterglow"
          style={{ color: heatColor, opacity: Math.min(1, 0.5 + heat * 0.5) }}
          aria-hidden
        />
      )}
      <Handle type="target" position={Position.Top} />
      <span className="component-node__name">{displayName}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

