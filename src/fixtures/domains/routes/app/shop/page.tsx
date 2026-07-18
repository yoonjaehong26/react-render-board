import { ShopSitePage } from './ShopSitePage';

// Next.js App Router 관례를 흉내낸 라우트 진입 파일(dashboard/page.tsx와 같은 패턴, ADR-0028).
// DemoApp.tsx가 실제 URL(/shop)로 라우팅됐을 때만 이 트리를 마운트한다 — 항상 떠 있는 다른
// 패널들과 달리, 보드가 진짜 라우트 전환(마운트/언마운트)에 어떻게 반응하는지 보여준다.
export function ShopPage({ onNavigateHome }: { onNavigateHome: () => void }) {
  return <ShopSitePage onNavigateHome={onNavigateHome} />;
}
