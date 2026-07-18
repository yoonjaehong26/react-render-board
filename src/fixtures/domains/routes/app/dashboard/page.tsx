import { RouteHome } from './RouteHome';

// Next.js App Router 관례를 흉내낸 라우트 진입 파일. 도형 어휘(ADR-0028/0035)의 "라우트 6각형"을
// 데모에서 실제로 보여주기 위한 fixture다 — Vite 데모엔 원래 page.tsx 그룹이 없어 6각형이 화면에
// 나타날 일이 없었다. 이 파일 안에서 렌더된 컴포넌트(RouteHome)는 getSource가 page.tsx를 돌려줘
// 라우트 그룹으로 잡히고, 그 진입 노드가 6각형이 된다.
export function DashboardPage() {
  return <RouteHome />;
}
