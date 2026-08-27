import { useState } from 'react';
import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import type { ComponentNodeData } from '../lib/toFlow';
import { nodeBorderImage, ROUGH_FILL_MATCHED, ROUGH_FILL_HIGHLIGHTED } from '../lib/roughStyle';
import { colorIndexForGroup, paletteHex } from '../lib/groupColor';
// props 흐름/변경 잔상(ADR-0032) — heat와 tracked는 toFlow data가 아니라 context로 받는다
// (AfterglowContext.tsx 상단 주석 참고: decay 틱마다 flowNodes를 다시 만들지 않기 위함).
import { useAfterglowHeat, useIsTracked, useLineageState, useIsPageHovered } from './AfterglowContext';

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
    coalescedCount,
    sharedUses,
    sharedMembers,
    hostDetails,
    hostDetailsOpen,
    compactSummary,
    compactControl,
  } = data as ComponentNodeData;
  // 공유 UI 칩 클릭 시 인라인 peek(접힌 실제 인스턴스 펼쳐보기) 토글. 어느 공유 그룹의 peek을 열었는지.
  const [openPeek, setOpenPeek] = useState<string | null>(null);
  // ADR-0032: 이 노드의 변경 잔상 heat(0~1)와 참조 추적 강조 여부. 잔상 모드가 꺼져 있거나
  // 이 노드가 대상이 아니면 각각 0/false라 아무 것도 더 그리지 않는다.
  const heat = useAfterglowHeat(Number(id));
  const tracked = useIsTracked(Number(id));
  // Alt(⌥)-held 라이브 hover(ADR-0032 후속): 실제 화면에서 커서 아래 요소에 대응하는 노드면
  // 다이어그램에서도 동시에 햇칭으로 밝힌다(실제 요소 hover 햇칭과 짝).
  const pageHovered = useIsPageHovered(Number(id));
  // hover 혈통 점등(ADR-0044/0047 후속): 다른 노드에 hover 중이고 이 노드가 그 혈통(조상+자손)에
  // 없으면 흐리게 죽여, 혈통 노드+간선이 하나의 경로로 도드라지게 한다. 간선(edge-lineage)과
  // 짝을 이루는 노드 쪽 dimming이다.
  const lineageState = useLineageState(Number(id));
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
  if (pageHovered) classes.push('component-node--page-hovered'); // Alt-held 라이브 hover 동시 햇칭
  if (matched) classes.push('component-node--matched');
  if (isRouteEntry) classes.push('component-node--route'); // 6각형 clip-path (ADR-0028)
  if (tracked) classes.push('component-node--tracked'); // prop 참조 추적 하이라이트(ADR-0032)
  if (lineageState === 'off') classes.push('component-node--lineage-off'); // hover 혈통 밖 → 흐리게
  else if (lineageState === 'on') classes.push('component-node--lineage-on'); // hover 혈통 안 → 강조
  if (compactSummary) classes.push('component-node--compact-summary');
  if (colorIndex !== undefined) classes.push(`component-node--palette-${colorIndex}`);

  // Excalidraw풍 손그림 테두리(roughStyle.ts, ADR-0030) — 고정 크기라 미리 계산해 둔 정적
  // 이미지를 (역할/kind/다크모드)로 골라 공유한다(노드별 런타임 계산 없음). 강조 상태(검색
  // 매치=햇칭, 픽/역방향 착지=마커)는 테두리 아래에 채움 이미지를 겹쳐 "형광펜으로 짚은"
  // 느낌을 준다 — background-image는 앞에 오는 레이어가 위로 쌓이므로 [강조채움, 테두리] 순서로
  // 겹치면 테두리가 맨 위, 채움이 배경색 위에 온다.
  // 테두리 색 = 부모 도메인 팔레트(색 언어 통일, ADR-0055) — 간선·그룹 프레임과 같은 색으로
  // "이 노드가 어느 도메인인가"를 맞춘다. pending(colorIndex undefined)이면 중립으로 폴백.
  const border = nodeBorderImage(kind, colorMode, isRouteEntry, colorIndex);
  const emphasisFill = highlighted ? ROUGH_FILL_HIGHLIGHTED : matched ? ROUGH_FILL_MATCHED : null;
  const backgroundImage = emphasisFill ? `${border}, ${emphasisFill}` : border;

  if (compactSummary) {
    return (
      <div className={classes.join(' ')} style={{ backgroundImage }}>
        <Handle type="target" position={Position.Top} />
        <button
          type="button"
          className="component-node__compact-summary-button nodrag"
          aria-label="밀집 요약 펼치기"
          title="이 부모의 직접 자식 가지를 strict waterfall으로 펼치기"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            compactSummary.onToggle();
          }}
        >
          <span className="component-node__compact-summary-title">자식 관계 요약</span>
          <span className="component-node__compact-summary-copy">
            직접 자식 {compactSummary.directChildCount}개 · 하위 컴포넌트 {compactSummary.descendantCount}개
          </span>
          <span className="component-node__compact-summary-open" aria-hidden>▸</span>
        </button>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

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
      {/* 리스트 접기(ADR-0046): 같은 종류 형제 N개를 이 노드로 접었으면 "×N" 배지로 알린다. */}
      {coalescedCount !== undefined && <span className="component-node__count-badge">×{coalescedCount}</span>}
      {/* 공유 UI 사용 칩(pillar ②): 이 노드가 렌더하는 공유 컨테이너를 칩으로 로컬 표식. 색은 그
          공유 컨테이너의 팔레트 색으로 통일해(멀리서 봐도 칩↔아래 레인 그룹이 같은 색으로 묶여
          보임) 솔리드 pill로 또렷하게. 상시 긴 선 대신 사용처에서 바로 읽힌다(전체 연결은 호버 점등, 후속). */}
      {sharedUses && sharedUses.length > 0 && (
        <span className="component-node__shared-uses nodrag">
          {sharedUses.map((g) => {
            const hex = paletteHex(colorIndexForGroup(g), colorMode);
            const name = g.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') ?? g;
            const members = sharedMembers?.[g] ?? [];
            const open = openPeek === g;
            return (
              <button
                key={g}
                type="button"
                className={`component-node__shared-chip${open ? ' component-node__shared-chip--open' : ''}`}
                style={{ background: hex, color: colorMode === 'dark' ? '#0f172a' : '#fff' }}
                title={`공유 컨테이너 ${name} — 클릭하면 내용 펼치기 / 노드 호버하면 연결선`}
                aria-expanded={open}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenPeek(open ? null : g);
                }}
              >
                <span className="component-node__shared-chip-glyph" aria-hidden>
                  ↗
                </span>
                {name}
                {/* 인라인 peek(pillar ②): 접힌 실제 인스턴스 내용을 로컬에서 펼쳐 본다("미리보기"). */}
                {open && (
                  <span className="component-node__shared-peek" style={{ borderColor: hex }}>
                    <span className="component-node__shared-peek-title" style={{ color: hex }}>
                      {name} · 미리보기
                    </span>
                    {members.map((m) => (
                      <span key={m} className="component-node__shared-peek-item">
                        {m}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </span>
      )}
      {/* host는 구조 간선·레이아웃에 참여시키지 않는다. 사용자가 host 상세를 켠 상태에서 선택한
          컴포넌트 하나에만 포탈 popover로 tag ×N을 보여, 수백 wrapper가 다른 그룹과 겹치는 일을
          막는다(ADR-0093). */}
      {hostDetailsOpen && hostDetails && hostDetails.length > 0 && (
        <NodeToolbar nodeId={id} isVisible position={Position.Bottom} offset={8} style={{ zIndex: 1000 }}>
          <div className="component-node__host-detail nodrag" aria-label={`${displayName} host 상세`}>
            <span className="component-node__host-detail-title">host 상세</span>
            {hostDetails.map(({ tag, count }) => (
              <span key={tag} className="component-node__host-detail-item">
                {tag} ×{count}
              </span>
            ))}
          </div>
        </NodeToolbar>
      )}
      {/* 요약 카드를 펼쳐도 접기 제어가 사라지지 않는다. 같은 부모 source에서 compact ↔ strict를
          왕복할 수 있어, 카드가 사라진 뒤 되돌릴 길이 없던 UX를 피한다. */}
      {compactControl && (
        <NodeToolbar nodeId={id} isVisible position={Position.Bottom} offset={5} style={{ zIndex: 1000 }}>
          <button
            type="button"
            className="component-node__compact-control nodrag"
            aria-label="밀집 요약으로 접기"
            title={`직접 자식 ${compactControl.directChildCount}개를 다시 요약`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              compactControl.onToggle();
            }}
          >
            자식 {compactControl.directChildCount}개 요약 ▾
          </button>
        </NodeToolbar>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
