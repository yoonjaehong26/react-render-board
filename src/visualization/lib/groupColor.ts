// 도메인별 커스텀 팔레트 (research/2026-07-17-react-flow-ux-capabilities.md 5절). 그룹 등장
// 순서에 기대지 않고 그룹 "이름" 문자열의 해시만으로 색을 정한다 — layout.ts가 이미 밝히듯
// 그룹 순서는 커밋마다 바뀔 수 있어서, "처음 본 순서대로 다음 팔레트 칸 배정" 방식은 커밋마다
// 색이 재배정/깜빡이는 문제를 낳는다. 순수 이름 해시는 그 문제가 없다.
//
// 8색 고정 팔레트 + 정적 CSS 클래스(component-node--palette-N / group-node--palette-N)로
// 구현한다 — 인라인 style로 임의 hex를 주입하지 않는다. 이 프로젝트는 "인라인 style은 동적
// 값에만"이라는 규칙을 GroupNode의 counter-scale 하나만 예외로 두고 있는데, 8개짜리 고정
// 팔레트는 진짜 임의값이 아니라 열거 가능한 집합이라 새 예외를 만들 필요가 없다. 다크모드
// 변형도 CSS(`.react-flow.dark .component-node--palette-N`)로만 선언한다 — paletteHex()는
// MiniMap의 nodeColor처럼 실제 CSS 문자열이 필요한 자리(React Flow가 요구)에만 쓴다.
// matched(초록 계열)/cross-group(호박색)과 색상이 겹치지 않도록 순수 녹색·호박색 계열은
// 팔레트에서 뺐다.
export type ColorMode = 'light' | 'dark';

interface PaletteEntry {
  light: string;
  dark: string;
}

const PALETTE: readonly PaletteEntry[] = [
  { light: '#6366f1', dark: '#818cf8' }, // indigo — 기존 기본 accent와 같은 계열
  { light: '#2563eb', dark: '#60a5fa' }, // blue
  { light: '#0e7490', dark: '#22d3ee' }, // cyan
  { light: '#0f766e', dark: '#2dd4bf' }, // teal
  { light: '#7c3aed', dark: '#a78bfa' }, // violet
  { light: '#a21caf', dark: '#e879f9' }, // fuchsia
  { light: '#db2777', dark: '#f472b6' }, // pink
  { light: '#e11d48', dark: '#fb7185' }, // rose
];

export const PALETTE_SIZE = PALETTE.length;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function colorIndexForGroup(group: string): number {
  return hashString(group) % PALETTE_SIZE;
}

export function paletteHex(colorIndex: number, colorMode: ColorMode = 'light'): string {
  return PALETTE[colorIndex % PALETTE_SIZE][colorMode];
}
