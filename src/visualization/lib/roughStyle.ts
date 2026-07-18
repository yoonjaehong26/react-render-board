// Excalidraw풍 "손그림" 시각 정체성(ADR-0030)을 컴포넌트 노드·크롬·그룹 프레임에 입힌다.
// 그룹 프레임(GroupNode.tsx)은 사용자 피드백("손그림 느낌이 크게 안 든다")으로 ADR-0030 축3의
// 유보를 풀어 펼쳐진(상세) 그룹에만 적용한다 — 접힌/지도 모드 프레임은 여전히 깔끔한 CSS 대시로
// 둔다(groupFrameImage는 크기 버킷 메모이즈라 지도 모드 수백 프레임에 rough를 안 그린다).
//
// 성능 원칙(ADR-0017/0030) — 정적 이미지 공유(O(1)):
// NODE_WIDTH/NODE_HEIGHT(layout.ts)가 모든 컴포넌트 노드에 공통인 고정 상수라는 점을 이용해,
// 이 파일이 모듈 로드 시 딱 유한 횟수만 rough.js로 경로를 계산해 SVG data URI로 굳혀 둔다.
// 노드가 수천 개여도 이 계산은 "변형 개수"만큼만(노드 수와 무관) 실행되고, 이후로는 모든 노드가
// 같은 정적 이미지를 background-image로 공유한다 — P1(ADR-0017)이 잡아낸 "개수 비례 비용"을
// 원천적으로 피하는 설계다. 크롬(버튼/툴바)도 노드 수와 무관(ADR-0030 성능 3레이어 분석의 O(1)
// 레이어)이라 같은 정적-이미지 방식을 쓰되, 크기가 제각각이므로 background-size로 늘린다.
import rough from 'roughjs';
import { NODE_WIDTH, NODE_HEIGHT } from './layout';

export type BorderMode = 'light' | 'dark';

// seed를 고정해 리로드해도 항상 같은 모양이 나오게 한다(매번 미세하게 달라지면 정적 이미지로
// 캐싱하는 의미도 없고 산만하다). ADR-0030의 "역할별 세기": 노드=artist, 크롬=볼펜(낮은 roughness),
// 그룹=artist보다 살짝 세게. 처음엔 노드를 0.8/0.6으로 잡았으나 160×48 박스에선 흔들림이 너무
// 작아 깔끔한 사각형과 구분이 안 된다는 사용자 피드백을 받아 "손그림으로 읽히게" 세게 조정했다.
const NODE_ROUGH = { roughness: 1.3, bowing: 1.6, strokeWidth: 1.8, seed: 7 } as const;
const CHROME_ROUGH = { roughness: 0.3, bowing: 0.6, strokeWidth: 1.3, seed: 7 } as const;
// 그룹 프레임(GroupNode)용 — 프레임이 커서 흔들림이 상대적으로 작게 보이므로 노드보다 살짝 세게.
const GROUP_ROUGH = { roughness: 1.4, bowing: 1.4, strokeWidth: 1.8, seed: 7 } as const;

const INSET = 2; // 선이 노드 경계에 걸쳐 잘리지 않도록 살짝 안쪽에 그린다.
// 6각형(라우트 진입점, ADR-0028)의 좌우 뾰족한 모서리가 파고드는 가로 비율. flow.css의
// `.component-node--route` clip-path 폴리곤 %와 반드시 일치해야 한다(하나 바꾸면 둘 다).
export const HEX_CUT_RATIO = 0.18;

// 다크 변형 색은 groupColor.ts/flow.css가 이미 검증한 다크 인디고(#818cf8, 대비 5.5:1)를
// 재사용한다(ADR-0030). host는 라이트/다크 모두 중립 슬레이트.
const STROKE: Record<BorderMode, { composite: string; host: string; route: string }> = {
  light: { composite: '#6366f1', host: '#94a3b8', route: '#6366f1' },
  dark: { composite: '#818cf8', host: '#64748b', route: '#818cf8' },
};

// rough drawable → SVG data URI. rough가 돌려준 각 경로를 그 자신의 stroke/fill 속성 그대로
// 렌더한다 — 그래야 테두리(fill:none)든 hachure 채움(stroke=채움색 선들)이든 마커(solid 채움)든
// 한 함수로 충실히 굳힐 수 있다.
function drawableToDataUrl(
  generator: ReturnType<typeof rough.generator>,
  drawable: ReturnType<ReturnType<typeof rough.generator>['rectangle']>,
): string {
  const paths = generator
    .toPaths(drawable)
    .map(
      (p) =>
        `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill}" stroke-linecap="round" />`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" viewBox="0 0 ${NODE_WIDTH} ${NODE_HEIGHT}">${paths}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function hexPoints(): [number, number][] {
  const cut = NODE_WIDTH * HEX_CUT_RATIO;
  const midY = NODE_HEIGHT / 2;
  const l = INSET;
  const r = NODE_WIDTH - INSET;
  const t = INSET;
  const b = NODE_HEIGHT - INSET;
  return [
    [l + cut, t],
    [r - cut, t],
    [r, midY],
    [r - cut, b],
    [l + cut, b],
    [l, midY],
  ];
}

function buildRectBorder(stroke: string, dashed = false): string {
  const generator = rough.generator();
  const drawable = generator.rectangle(INSET, INSET, NODE_WIDTH - INSET * 2, NODE_HEIGHT - INSET * 2, {
    ...NODE_ROUGH,
    stroke,
    fill: 'none',
    strokeLineDash: dashed ? [5, 4] : undefined,
  });
  return drawableToDataUrl(generator, drawable);
}

function buildHexBorder(stroke: string): string {
  const generator = rough.generator();
  const drawable = generator.polygon(hexPoints(), { ...NODE_ROUGH, stroke, fill: 'none' });
  return drawableToDataUrl(generator, drawable);
}

// 강조 채움(ADR-0030 축3 "형광펜으로 짚은 순간") — 테두리와 별개로 노드 배경 위에 얹는다.
// 검색 매치=햇칭(녹색), 픽/역방향 착지=마커(solid 인디고). 둘 다 노드 크기 고정이라 딱 1회씩만 계산.
function buildFill(color: string, style: 'hachure' | 'solid'): string {
  const generator = rough.generator();
  const drawable = generator.rectangle(INSET, INSET, NODE_WIDTH - INSET * 2, NODE_HEIGHT - INSET * 2, {
    ...NODE_ROUGH,
    stroke: 'none',
    fill: color,
    fillStyle: style,
    fillWeight: style === 'hachure' ? 1.2 : undefined,
    hachureGap: style === 'hachure' ? 5 : undefined,
  });
  return drawableToDataUrl(generator, drawable);
}

/** (mode, kind, route) → 손그림 테두리 정적 이미지. 모듈 로드 시 6회만 계산해 공유한다. */
const BORDERS: Record<BorderMode, { composite: string; host: string; route: string }> = {
  light: {
    composite: buildRectBorder(STROKE.light.composite),
    host: buildRectBorder(STROKE.light.host, true),
    route: buildHexBorder(STROKE.light.route),
  },
  dark: {
    composite: buildRectBorder(STROKE.dark.composite),
    host: buildRectBorder(STROKE.dark.host, true),
    route: buildHexBorder(STROKE.dark.route),
  },
};

/** 검색 매치 강조 — 햇칭(형광펜) 채움. 모듈 로드 시 1회 계산. */
export const ROUGH_FILL_MATCHED = buildFill('#16a34a', 'hachure');
/** 픽/역방향 착지 강조 — 햇칭(형광펜) 채움(인디고). 사용자 요청으로 solid 마커 채움에서 햇칭으로
 *  통일(ADR-0035의 "픽=마커/검색=햇칭" 구분을 기법이 아니라 색으로만 구분하도록 변경) — solid
 *  채움이 노드 텍스트를 덮어 가독성을 해쳤다. 이제 검색=녹색 햇칭, 픽/역방향=인디고 햇칭. */
export const ROUGH_FILL_HIGHLIGHTED = buildFill('#6366f1', 'hachure');

// 역방향 착지 강조 링 — 네온 box-shadow 글로우(사용자가 "구리다"고 지적) 대신 "마커로 한 번
// 둘러친" 손그림 표현. 노드보다 살짝 크게(inset 음수, flow.css) 얹혀 손으로 동그라미 친 느낌을
// 준다. 굵고(strokeWidth 3) 흔들림 큰(roughness 1.7) 진한 인디고. 모듈 로드 시 라이트/다크 2회 계산.
const HIGHLIGHT_ROUGH = { roughness: 1.7, bowing: 1.8, strokeWidth: 3, seed: 4 } as const;

function buildRing(stroke: string): string {
  const generator = rough.generator();
  const inset = 3;
  const drawable = generator.rectangle(inset, inset, NODE_WIDTH - inset * 2, NODE_HEIGHT - inset * 2, {
    ...HIGHLIGHT_ROUGH,
    stroke,
    fill: 'none',
  });
  const paths = generator
    .toPaths(drawable)
    .map(
      (p) =>
        `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round" />`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" viewBox="0 0 ${NODE_WIDTH} ${NODE_HEIGHT}" preserveAspectRatio="none">${paths}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** 역방향 착지 강조 링(라이트/다크). flow.css의 `.component-node--highlighted::after`가 쓴다. */
export const HIGHLIGHT_RING: Record<BorderMode, string> = {
  light: buildRing('#4f46e5'),
  dark: buildRing('#a5b4fc'),
};

/**
 * 컴포넌트 노드가 background-image로 쓸 손그림 테두리를 고른다. 역할(route)이 kind(host/composite)
 * 보다 우선한다 — 라우트 진입점은 6각형(ADR-0028), 그 외에는 kind별 사각형.
 */
export function nodeBorderImage(
  kind: 'host' | 'composite',
  mode: BorderMode,
  isRouteEntry: boolean,
): string {
  const set = BORDERS[mode];
  if (isRouteEntry) return set.route;
  return kind === 'host' ? set.host : set.composite;
}

// --- 크롬(버튼/툴바) 볼펜 세기 rough (ADR-0030 축2) ---
// 노드와 달리 크기가 제각각이라 고정 기준 크기(아래)로 한 번 그려 background-size:100% 100%로
// 늘린다. roughness가 낮아(0.2) 늘려도 손맛만 남고 뭉개지지 않는다("볼펜 끝으로 그린 버튼").
const CHROME_W = 140;
const CHROME_H = 40;
const CHROME_INSET = 2;

function buildChromeBorder(stroke: string): string {
  const generator = rough.generator();
  const drawable = generator.rectangle(
    CHROME_INSET,
    CHROME_INSET,
    CHROME_W - CHROME_INSET * 2,
    CHROME_H - CHROME_INSET * 2,
    { ...CHROME_ROUGH, stroke, fill: 'none' },
  );
  const paths = generator
    .toPaths(drawable)
    .map(
      (p) =>
        `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round" />`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CHROME_W}" height="${CHROME_H}" viewBox="0 0 ${CHROME_W} ${CHROME_H}">${paths}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** 크롬 볼펜 테두리(라이트/다크). 모듈 로드 시 2회 계산. */
export const CHROME_BORDER: Record<BorderMode, string> = {
  light: buildChromeBorder('#6366f1'),
  dark: buildChromeBorder('#818cf8'),
};

// 원형 플로팅 버튼(ADR-0037)용 볼펜 세기 rough 원. 사각 CHROME_BORDER와 같은 손그림 언어를
// 원형 셰이프로 확장한 것 — border-radius:50%로 사각 테두리를 자르면 모서리 스케치가 잘려
// 어색하므로, 원 자체를 rough로 그린다. preserveAspectRatio:none으로 버튼 크기에 맞춰 늘린다.
const CHROME_CIRCLE_SIZE = 48;

function buildChromeCircle(stroke: string): string {
  const generator = rough.generator();
  const drawable = generator.circle(
    CHROME_CIRCLE_SIZE / 2,
    CHROME_CIRCLE_SIZE / 2,
    CHROME_CIRCLE_SIZE - CHROME_INSET * 2,
    { ...CHROME_ROUGH, stroke, fill: 'none' },
  );
  const paths = generator
    .toPaths(drawable)
    .map(
      (p) =>
        `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round" />`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CHROME_CIRCLE_SIZE}" height="${CHROME_CIRCLE_SIZE}" viewBox="0 0 ${CHROME_CIRCLE_SIZE} ${CHROME_CIRCLE_SIZE}" preserveAspectRatio="none">${paths}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** 원형 크롬 볼펜 테두리(원형 플로팅 버튼용, ADR-0037). 모듈 로드 시 2회 계산. */
export const CHROME_CIRCLE: Record<BorderMode, string> = {
  light: buildChromeCircle('#6366f1'),
  dark: buildChromeCircle('#818cf8'),
};

// --- 그룹 프레임 손그림 테두리 (ADR-0030 축3 — 사용자 피드백으로 유보 해제) ---
// 그룹 프레임은 크기가 제각각이라 노드처럼 "이미지 1장 공유"가 안 된다. 대신 크기를 4px 버킷으로
// 반올림한 키로 메모이즈해, 같은(≈) 크기의 프레임은 rough 계산을 재사용한다. 펼쳐진(상세 모드)
// 그룹에만 쓰고, 접힌/지도 모드 그룹은 기존 CSS(깔끔한 대시)를 유지한다 — 지도에서 프레임이 수백
// 개여도 rough를 안 그린다. 배경 이미지는 background-size:100% 100%로 실제 크기에 늘려 200ms
// 크기 전환 애니메이션 동안에도 프레임과 어긋나지 않는다(버킷이라 흔들림 재계산은 드물다).
const groupFrameCache = new Map<string, string>();

export function groupFrameImage(width: number, height: number, stroke: string): string {
  const w = Math.max(48, Math.round(width / 4) * 4);
  const h = Math.max(48, Math.round(height / 4) * 4);
  const key = `${w}x${h}x${stroke}`;
  const cached = groupFrameCache.get(key);
  if (cached) return cached;

  const generator = rough.generator();
  const inset = 3;
  const drawable = generator.rectangle(inset, inset, w - inset * 2, h - inset * 2, {
    ...GROUP_ROUGH,
    stroke,
    fill: 'none',
  });
  const paths = generator
    .toPaths(drawable)
    .map(
      (p) =>
        `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="none" stroke-linecap="round" />`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${paths}</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  groupFrameCache.set(key, url);
  return url;
}

// 하위 호환: ADR-0030 이전 이름을 참조하던 코드/테스트가 있으면 깨지지 않게 남겨 둔다(라이트 기준).
export const ROUGH_BORDER_COMPOSITE = BORDERS.light.composite;
export const ROUGH_BORDER_HOST = BORDERS.light.host;
