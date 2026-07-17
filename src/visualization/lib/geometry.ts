// 뷰포트 기반 부분 재계산(ADR-0017)이 쓰는 순수 기하 계산. Canvas.tsx가 React 컴포넌트만
// export하도록(react-refresh 규칙) 별도 파일로 분리했다 — 로직은 원래 Canvas.tsx에 있던 것을
// 그대로 옮긴 것이라 동작 변화는 없다.
import type { Rect } from './layout';

export function worldRectFromViewport(
  viewport: { x: number; y: number; zoom: number },
  width: number,
  height: number,
): Rect {
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: width / viewport.zoom,
    height: height / viewport.zoom,
  };
}

export function expandRect(rect: Rect, marginRatio: number): Rect {
  const mx = rect.width * marginRatio;
  const my = rect.height * marginRatio;
  return { x: rect.x - mx, y: rect.y - my, width: rect.width + mx * 2, height: rect.height + my * 2 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
