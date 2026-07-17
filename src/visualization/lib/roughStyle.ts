// Excalidraw풍 "손그림" 느낌을 컴포넌트 노드 테두리에만 입힌다. 그룹 프레임(GroupNode.tsx)은
// 지도 모드에서도 항상 보이는 유일한 공유 요소라 손대지 않고 지금의 깔끔한 선 그대로 둔다 —
// "필요한 곳(상세 모드에서만 보이는 컴포넌트 노드)에만 쓰고 나머지는 깔끔하게" 판단에 따른 것.
//
// NODE_WIDTH/NODE_HEIGHT(layout.ts)가 모든 컴포넌트 노드에 공통인 고정 상수라는 점을 이용해,
// 이 파일이 모듈 로드 시 딱 한 번 rough.js로 경로를 계산해 SVG data URI로 굳혀 둔다. 노드가
// 수천 개여도 이 계산은 정확히 2회(변형 2개)만 실행되고, 이후로는 모든 노드가 같은 정적
// 이미지를 background-image로 공유한다(노드 수에 비례하는 런타임 비용이 없다) — P1(ADR-0017)이
// 잡아낸 것과 같은 종류(개수 비례 비용)의 리스크를 원천적으로 피하는 설계다.
import rough from 'roughjs';
import { NODE_WIDTH, NODE_HEIGHT } from './layout';

// roughness/bowing을 낮게 잡아 Excalidraw 기본값보다도 절제된, "마커로 한 번에 그은" 느낌을
// 노린다 — 흔들림을 과하게 쓰지 않고 깔끔한 인상을 우선한다. seed를 고정해 리로드해도 항상
// 같은 모양이 나오게 한다(매번 미세하게 달라지면 정적 이미지로 캐싱하는 의미도 없고 산만하다).
const ROUGH_OPTIONS = {
  roughness: 0.8,
  bowing: 0.6,
  strokeWidth: 1.5,
  seed: 7,
} as const;

const INSET = 2; // 선이 노드 경계에 걸쳐 잘리지 않도록 살짝 안쪽에 그린다.

function buildRoughRectDataUrl(stroke: string, dashed = false): string {
  const generator = rough.generator();
  const drawable = generator.rectangle(INSET, INSET, NODE_WIDTH - INSET * 2, NODE_HEIGHT - INSET * 2, {
    ...ROUGH_OPTIONS,
    stroke,
    fill: 'none',
    strokeLineDash: dashed ? [5, 4] : undefined,
  });
  const paths = generator
    .toPaths(drawable)
    .map((p) => `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round" />`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" viewBox="0 0 ${NODE_WIDTH} ${NODE_HEIGHT}">${paths}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** 기본(composite) 컴포넌트 노드 테두리 — 인디고, 실선 스케치. 모듈 로드 시 1회만 계산. */
export const ROUGH_BORDER_COMPOSITE = buildRoughRectDataUrl('#6366f1');
/** host(div/span 등) 노드 테두리 — 회색, 점선 스케치. 모듈 로드 시 1회만 계산. */
export const ROUGH_BORDER_HOST = buildRoughRectDataUrl('#94a3b8', true);
