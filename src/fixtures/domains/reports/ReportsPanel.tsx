import { Suspense, lazy, useState } from 'react';
import { Button } from '../shared/Button';

// lazy+Suspense 경계 검증용 fixture (ADR-0009 ④가 excalidraw로는 확인 못 한 항목, ADR-0010).
// excalidraw는 이 패턴을 안 써서 실제 앱 검증이 불가능했으므로, 자체 fixture로 먼저 확인한다.
// import() 직후 바로 resolve하면 dev 서버(로컬 모듈)에선 순식간에 끝나 Suspense fallback이
// 화면에 잡히지 않을 수 있어, 검증이 가능하도록 일부러 짧은 지연을 더한다.
const LazyReportView = lazy(() =>
  import('./LazyReportView').then(
    (mod) => new Promise<typeof mod>((resolve) => setTimeout(() => resolve(mod), 400)),
  ),
);

export function ReportsPanel() {
  const [showReport, setShowReport] = useState(false);

  return (
    <section>
      <h2>reports</h2>
      <Button
        label={showReport ? '보고서 닫기' : '보고서 열기'}
        onClick={() => setShowReport((v) => !v)}
      />
      {showReport && (
        <Suspense fallback={<p>보고서 로딩 중…</p>}>
          <LazyReportView />
        </Suspense>
      )}
    </section>
  );
}
