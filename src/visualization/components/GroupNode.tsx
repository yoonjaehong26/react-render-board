import { Handle, NodeToolbar, Position, useViewport, type NodeProps } from '@xyflow/react';
import type { GroupNodeData } from '../lib/toFlow';
import type { RoleMarker } from '../lib/roleMarkers';
import { groupFrameImage } from '../lib/roughStyle';
import { paletteHex } from '../lib/groupColor';
import { useGroupAfterglowHeat } from './AfterglowContext';

// 경계 wideview 링 색(라이트/다크) — 경계 프레임(flow.css .boundary-frame--*)과 같은 팔레트.
const RING_COLOR: Record<RoleMarker, { light: string; dark: string }> = {
  portal: { light: '#0d9488', dark: '#83c9ae' },
  suspense: { light: '#7c3aed', dark: '#b89ad9' },
  errorBoundary: { light: '#e11d48', dark: '#d89383' },
};
// 경계 wideview 링은 안쪽 경계 프레임(.boundary-frame, 점선)과 같은 "점선" 언어로 통일한다.
// box-shadow는 점선이 안 되므로 점선 outline을 쓴다(한 겹). 여러 종류면 우선순위 하나로 요약한다.
const RING_PRIORITY: RoleMarker[] = ['errorBoundary', 'suspense', 'portal'];
const RING_WIDTH = 2.5; // 화면 기준 링 두께(px)
const RING_OFFSET = 3; // 그룹 테두리 바깥으로 띄우는 거리(px, 화면 기준)
// 링 크기 배율(counterScale)의 상한 — 극단적 줌아웃에서 링이 폭발해 이웃 그룹과 뭉치는 걸 막는다.
const RING_MAX_SCALE = 8;
// rough SVG는 실제 프레임 비율로 생성해도 CSS background-size 전환 중 다시 맞춰 그려진다. 노드처럼
// 고정 비율인 대상과 달리 지나치게 넓은 그룹에서는 모서리의 손떨림이 긴 변을 따라 늘어나 중앙까지
// 내려온 선처럼 읽힌다. 이 한계를 넘으면 화면 두께 고정 연필 실선으로 전환한다(ADR-0095).
const MAX_ROUGH_FRAME_WIDTH_TO_HEIGHT = 8;

// ui-philosophy.md의 "영역(region) 기반 그룹핑" — 뭉쳐서 숨기지 않고 회색 박스 경계만 그어준다.
// 실제 컴포넌트 노드는 이 프레임 "안에" 그대로 남아 있다(React Flow parentId/extent:'parent').

// 지도 모드 LOD (ADR-0016 ②): minZoom을 크게 낮춰(0.05 → 0.001) fitView가 대규모 콘텐츠를
// 바닥에 막히지 않고 실제로 전부 담게 했더니, 이번엔 CSS `.zoom-far` 폰트 크기 고정값(20px)이
// 캔버스 자체의 transform: scale(zoom)에 함께 눌려 1~5% 줌에서는 사실상 안 보이는 크기가
// 됐다(ADR-0014가 지적한 "라벨 텍스트가 읽을 수 없어짐"). 라벨에 캔버스 줌의 역수를 곱해
// 화면 기준 크기를 고정한다 — 그룹 프레임 자체는 월드 좌표대로 계속 줄어들어(그래야 지도가
// 성립한다) fitView 배치는 그대로 유지하면서, 텍스트만 항상 읽을 수 있는 크기를 유지한다.
export function GroupNode({ id, data }: NodeProps) {
  const {
    label,
    count,
    pending,
    collapsed,
    colorIndex,
    manuallyCollapsed,
    onToggleCollapse,
    width,
    height,
    colorMode,
    boundaryKinds,
    shared,
    usageCount,
  } = data as GroupNodeData;
  const { zoom } = useViewport();
  // 지도 모드 그룹 흐름(ADR-0032 Q2 "활동 기상도") — 이 그룹 안 노드들이 바뀌면 프레임이 heat
  // 색으로 은은히 발광한다. 노드 heat와 같은 파랑→마젠타→빨강 스케일. 흐름 꺼짐/조용하면 0이라
  // 아무 것도 안 그린다(발광 중인 그룹만 리렌더).
  const groupHeat = useGroupAfterglowHeat(id);
  const heatColor =
    groupHeat > 0 ? `hsl(${Math.round((240 + 120 * Math.min(1, groupHeat)) % 360)} 85% 56%)` : undefined;
  const classes = ['group-node'];
  if (pending) classes.push('group-node--pending');
  if (collapsed) classes.push('group-node--collapsed');
  if (heatColor) classes.push('group-node--flowing');
  if (shared) classes.push('group-node--shared'); // 공유 UI 레인(pillar ②)
  if (colorIndex !== undefined) classes.push(`group-node--palette-${colorIndex}`);

  // 손그림 프레임 테두리(ADR-0030 축3) — 펼쳐진(상세) 그룹 중 비율이 안정적인 것에만. 접힌/
  // 지도 모드/pending/매우 넓은 그룹은 CSS 대시 테두리를 그대로 둔다. 후자는 rough SVG를 가로로
  // 늘릴 때 모서리 선이 중앙까지 처지는 시각 결함을 피하기 위한 의도적인 hybrid frame이다.
  // 크기는 4px 버킷으로 메모이즈되므로(roughStyle.groupFrameImage) 커밋마다 재계산하지 않는다.
  const showRough =
    !collapsed && !pending && width / Math.max(height, 1) <= MAX_ROUGH_FRAME_WIDTH_TO_HEIGHT;
  if (showRough) classes.push('group-node--rough');
  const wideFrameFallback = !collapsed && !pending && !showRough;
  if (wideFrameFallback) classes.push('group-node--rough-fallback');
  const roughStroke =
    colorIndex !== undefined ? paletteHex(colorIndex, colorMode) : colorMode === 'dark' ? '#706d65' : '#9aa3b5';

  // zoom은 minZoom(0.001) 아래로 내려가지 않지만, 짧은 전환 애니메이션 도중 관측치가
  // 그보다 살짝 흔들릴 수 있어 0으로 나누는 사고를 막는 하한을 둔다.
  const counterScale = 1 / Math.max(zoom, 0.001);
  const labelStyle = { transform: `scale(${counterScale})`, transformOrigin: 'left center' };

  // 경계 wideview 링(도형 어휘, ADR-0028) — 접힌(지도 모드/뷰포트 밖) 그룹에만 그룹 프레임 바깥에
  // 점선 색 링을 덧댄다. 펼쳐진(상세) 그룹은 안쪽 정밀 경계 프레임(.boundary-frame)이 이미 보이므로
  // 링을 빼 이중 표시를 없앤다 → "노드 보이면 정밀 프레임, 안 보이면 그룹 링" 딱 하나씩(semantic zoom).
  // 두께/오프셋에 counterScale을 곱해 라벨처럼 화면 기준 크기를 일정하게 유지하고(안 그러면 지도
  // 모드에서 캔버스 축소에 눌려 사라진다), 극단적 줌아웃에서 이웃과 뭉치지 않게 배율 상한을 둔다.
  // 여러 종류면 우선순위(에러>Suspense>포탈) 하나로 요약한다 — 정확한 종류는 줌인하면 프레임으로 보인다.
  const ringKind =
    collapsed && !pending && boundaryKinds && boundaryKinds.length > 0
      ? RING_PRIORITY.find((k) => boundaryKinds.includes(k))
      : undefined;
  const ringScale = Math.min(counterScale, RING_MAX_SCALE);

  const frameStyle =
    showRough || wideFrameFallback || ringKind || heatColor
      ? {
          ...(showRough ? { backgroundImage: groupFrameImage(width, height, roughStroke) } : {}),
          // CSS border는 캔버스 transform과 함께 가늘어져 줌아웃에서 거의 사라진다. 긴 프레임
          // 폴백은 counter-scale한 outline을 한 번 더 얹어, 화면 기준 1.8px 연필 실선이 항상
          // 남게 한다. 반복 rough 덧선은 타일 이음새가 더 눈에 띄어 채택하지 않는다. 접힌 그룹의
          // boundary ring과도 상태가 배타적이다.
          ...(wideFrameFallback
            ? {
                outline: `${1.8 * counterScale}px solid ${roughStroke}`,
                outlineOffset: `${-1 * counterScale}px`,
              }
            : {}),
          ...(ringKind
            ? {
                outline: `${RING_WIDTH * ringScale}px dashed ${RING_COLOR[ringKind][colorMode]}`,
                outlineOffset: `${RING_OFFSET * ringScale}px`,
              }
            : {}),
          // 그룹 흐름 발광(ADR-0032 Q2) — heat 색 링 + 은은한 글로우. currentColor 대신 직접 색을
          // 넣는 이유는 outline(경계 링)이 color를 다른 용도로 쓸 수 있어서다.
          ...(heatColor ? { boxShadow: `0 0 0 2px ${heatColor}, 0 0 16px 3px ${heatColor}` } : {}),
        }
      : undefined;

  return (
    <div className={classes.join(' ')} style={frameStyle}>
      {/* 지도 모드 전용 그룹↔그룹 집계 엣지(ADR-0034)가 붙는 앵커. 부모 그룹의 bottom(source)
          에서 자식 그룹의 top(target)으로 흘러 waterfall과 방향이 일치한다. 시각적으로는
          flow.css가 숨기고(엣지 앵커 역할만), 연결 상호작용은 막는다(isConnectable={false}). */}
      <Handle type="target" position={Position.Top} isConnectable={false} className="group-node__handle" />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="group-node__handle"
      />
      {/* 그룹 접기/펼치기(ADR-0029) 토글을 헤더 안의 평범한 버튼으로 넣었더니, 그룹 프레임과
          같은 위치를 지나는 엣지(특히 넓은 hit-test용 stroke를 가진 react-flow__edge-interaction
          경로)가 클릭을 가로챈다는 게 Playwright 실측으로 드러났다 — 그룹 프레임은 늘 배경에
          있도록 zIndex:-1(toFlow.ts)인데, 엣지는 zIndex 1(같은 그룹)/10(그룹 경계 횡단)이라
          프레임 안의 어떤 자식도 엣지보다 위로 올라올 수 없다(부모가 만든 stacking context를
          못 벗어난다). NodeToolbar는 포탈로 렌더되고 zIndex를 직접 지정할 수 있어 이 문제를
          피한다 — "줌 배율과 무관하게 항상 같은 크기"라는 덤도 얻는다(연구 문서의 NodeToolbar
          장점과 정확히 일치). */}
      <NodeToolbar nodeId={id} isVisible position={Position.Top} align="start" offset={2} style={{ zIndex: 1000 }}>
        <button
          type="button"
          className="group-node__toggle nodrag"
          onClick={onToggleCollapse}
          aria-label={manuallyCollapsed ? '그룹 펼치기' : '그룹 접기'}
        >
          {manuallyCollapsed ? '▸' : '▾'}
        </button>
      </NodeToolbar>
      <div
        className="group-node__header"
        data-declutter-header
        data-declutter-id={id}
        data-declutter-priority={count}
      >
        <span className="group-node__label" style={labelStyle}>
          {label}
        </span>
        <span className="group-node__count" style={labelStyle}>
          {count}
        </span>
        {/* 공유 UI 레인(pillar ②): 다중 부모라 "×N 사용" 배지로 사용처 수를 알린다(리스트 접기와 같은 언어). */}
        {shared && usageCount !== undefined && (
          <span className="group-node__usage" style={labelStyle} title={`${usageCount}곳에서 사용하는 공유 컨테이너`}>
            ×{usageCount} 사용
          </span>
        )}
      </div>
    </div>
  );
}
