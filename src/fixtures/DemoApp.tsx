import { useState } from 'react';
import { AppShell } from './domains/shell/AppShell';
import { Storefront } from './domains/shop/Storefront';
import { CheckoutPanel } from './domains/checkout/CheckoutPanel';
import { NotificationPanel } from './domains/notifications/NotificationPanel';
import { AdvancedPatterns } from './domains/advanced/AdvancedPatterns';
import { ReportsPanel } from './domains/reports/ReportsPanel';
import { LiveFeed } from './domains/livefeed/LiveFeed';
// props 흐름/변경 잔상 데모(ADR-0032) — 같은 객체 참조를 여러 단계로 drilling + 주기적 갱신.
import { DataFlowPanel } from './domains/dataflow/DataFlowPanel';
// props 흐름 데모 2종(ADR-0032) — 느린(5s) 상속 + 내부 상태 변화.
import { SlowFlowPanel, InternalStatePanel } from './domains/dataflow/StateFlowDemo';
import { DeepTree } from './domains/deeptree/DeepTree';
import { Button } from './domains/shared/Button';
import { StressGrid } from './domains/stress/StressGrid';
// 도형 어휘 라우트 6각형(ADR-0028/0035) 데모용 — page.tsx 그룹을 만들어 6각형이 실제로 보이게 한다.
import { DashboardPage } from './domains/routes/app/dashboard/page';
// 도형 어휘 포탈 표식(ADR-0028) 실측/시연용 — createPortal로 body에 순간이동하는 모달.
import { PortalModal } from './domains/portals/PortalModal';
// 실제 URL 전환(/shop)에 반응하는 독립 페이지(사용자 요청) — 아래 useRoute 주석 참고.
import { ShopPage } from './domains/routes/app/shop/page';
import { useRoute } from './router';

// 스트레스 테스트 전용, URL 쿼리로만 켠다(?stressCount=2000) — 기본 데모 흐름과 기존
// ADR들의 기준선(노드 수 등)을 건드리지 않기 위해서다.
const stressCount = Number(new URLSearchParams(window.location.search).get('stressCount') ?? 0);

// 계측 대상 앱(라이브 MVP의 "검증용 앱"). exp1의 Context/리스트/state 업데이트에
// 도메인 전체 마운트/언마운트 상호작용을 더했다 — 시각화 레이어의 그룹 추가/삭제와
// groupHint의 "사용 위치" 의미(같은 shared Button이 shell/checkout/notifications
// 어디서 쓰이느냐에 따라 다른 그룹으로 잡히는지, ADR-0007)를 실제 상호작용으로 확인한다.
// AdvancedPatterns(ADR-0010)는 class 컴포넌트/에러 바운더리/useTransition/Suspense —
// 지금까지 함수 컴포넌트 기준으로만 검증된 계측 로직의 사각지대 — 를 더한다.
// ReportsPanel(ADR-0011)은 React.lazy + Suspense(코드 스플리팅 경계) — excalidraw가 이
// 패턴을 안 써서 실제 앱으로는 미검증이었던 항목(ADR-0009 ④) — 을 확인한다.
// LiveFeed(ADR-0013)는 setInterval로 초당 N회 state를 갱신해 지속적 고빈도 커밋(애니메이션/
// 실시간 데이터/폴링/WebSocket) 부하를 재현한다 — 지금까지의 실 앱 검증(ADR-0009)은 "도형
// 몇 개를 수동으로 그리는" 짧은 상호작용뿐이었다.
// StressGrid(ADR-0014, ?stressCount= 쿼리로만 켜짐)는 roadmap.md의 "컴포넌트 수백~수천 개"
// 중 "수천" 쪽 — 실제 composite Fiber 수천 개가 마운트된 상태에서 커밋 하나당
// serializeFiberTree(전체 트리 재순회, ADR-0012는 이 비용을 debounce하지 않았다)가
// 얼마나 느려지는지, 그리고 보드 열림/닫힘 응답 배율이 646개(ADR-0012) 대비 어떻게
// 바뀌는지를 잰다. 버스트 버튼은 드래그 제스처의 연쇄 커밋(scripts/verify-real-app.mjs의
// drawFiveCircles)을 흉내내 rAF 간격으로 K번 state 업데이트를 발생시킨다.
// Storefront(domains/shop)는 위 캡슐형 fixture들과 목적이 다르다 — 특정 React 패턴을
// 검증하려는 게 아니라, 실제 서비스처럼 자연스러운 이름/깊이의 컴포넌트 트리(Storefront>
// ProductGrid>ProductCard>ProductInfo)를 보드에서 보여주기 위한 사용자 요청 데모다.
// ShopPage(domains/routes/app/shop)는 그 다음 요청 — Storefront는 항상 마운트된 패널 중
// 하나일 뿐이라 "진짜 페이지 전환"을 못 보여준다. /shop으로 실제 URL이 바뀌면 기존 패널
// 트리 전체가 언마운트되고 이 라우트가 그 자리를 대체한다 — 보드가 진짜 라우트 전환(ADR-0015가
// 지금까지 외부 앱으로만 검증했던 것)에 어떻게 반응하는지 이 레포 안에서도 볼 수 있다.
export function DemoApp() {
  const { path, navigate } = useRoute();
  const [showNotifications, setShowNotifications] = useState(false);
  const [burstStatus, setBurstStatus] = useState<'대기' | '진행 중' | '완료'>('대기');
  const [, setBurstTick] = useState(0);

  async function runBurst(steps: number) {
    setBurstStatus('진행 중');
    for (let i = 0; i < steps; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      setBurstTick((t) => t + 1);
    }
    setBurstStatus('완료');
  }

  if (path.startsWith('/shop')) {
    return <ShopPage onNavigateHome={() => navigate('/')} />;
  }

  return (
    <div className="demo-app">
      <Button
        label={showNotifications ? '알림 패널 숨기기' : '알림 패널 보이기'}
        onClick={() => setShowNotifications((v) => !v)}
      />
      <Button label="실제 쇼핑몰 사이트 보기 (/shop) →" onClick={() => navigate('/shop')} />
      <AppShell />
      <Storefront />
      <CheckoutPanel />
      <DashboardPage />
      <PortalModal />
      {showNotifications && <NotificationPanel />}
      <AdvancedPatterns />
      <ReportsPanel />
      <LiveFeed />
      <DataFlowPanel />
      <SlowFlowPanel />
      <InternalStatePanel />
      <DeepTree />
      {stressCount > 0 && (
        <div className="stress-panel">
          <Button label={`버스트 시작 (${stressCount}개 노드 상태에서 20커밋)`} onClick={() => runBurst(20)} />
          <span data-testid="burst-status">{burstStatus}</span>
          <StressGrid count={stressCount} />
        </div>
      )}
    </div>
  );
}
