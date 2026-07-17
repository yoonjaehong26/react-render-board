// 판단 지점 검증: 라우팅 기반 대형 서브트리 마운트/언마운트 + 라우트 단위 코드 스플리팅을
// 실제 제3자 오픈소스 앱(berry-free-react-admin-template)에서 확인한다. (ADR-0015 참고)
//
// ADR-0009(excalidraw)는 라우팅이 없는 단일 페이지 앱이었고, ADR-0011(React.lazy+Suspense)은
// 자체 fixture로만 검증했다 — "실제 앱에서 라우트 전환이 유발하는 대형 서브트리 교체 +
// 라우트 단위 lazy 청크 로딩"은 이번이 처음이다.
//
// 사전 준비 (재현 방법):
//   experiments/real-app-validation/berry-admin/vite/ 에 berry-free-react-admin-template의
//   vite/ 서브디렉터리를 clone하고, bippy + @xyflow/react를 추가한 뒤,
//   src/_react-render-board/ 에 이 레포의 src/{hooking,data,visualization}를 복사하고,
//   src/index.jsx에서 mountReactRenderBoard(container)를 호출하도록 두 줄을 추가한다
//   (ADR-0015에 정확한 절차 기록). framer-motion 12.23.25가 요구하는 motion-dom(^12.23.23)과
//   실제 설치되는 최신 motion-dom(12.42.2)이 호환되지 않아(activeAnimations export 누락)
//   package.json에 "overrides": { "motion-dom": "12.23.23" }를 추가해야 dev 서버가 뜬다.
//   그 상태로 dev 서버를 띄운 뒤(base path가 /free로 고정돼 있음에 주의):
//     BASE_URL=http://localhost:5196 node scripts/verify-routing.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5196';
const ROUTE_BASE = '/free'; // berry-admin의 VITE_APP_BASE_NAME (.env) — 포트와 무관하게 고정.
const OUT_DIR = fileURLToPath(new URL('../verify-output/routing/', import.meta.url));
const outPath = (name) => path.join(OUT_DIR, name);

const url = (p) => `${BASE_URL}${ROUTE_BASE}${p}`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // ── 1. 초기 로드 + 보드 오버레이 열기 ────────────────────────────────────
  await page.goto(url('/dashboard/default'), { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: outPath('01-initial-load.png') });

  const overlayButton = page.getByRole('button', { name: /render-board/ });
  if ((await overlayButton.count()) === 0) {
    console.error('[verify-routing] 실패: 오버레이 버튼을 찾을 수 없음');
    await browser.close();
    process.exit(1);
  }
  await overlayButton.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: outPath('02-board-opened-dashboard.png') });
  console.log('[verify-routing] 오버레이 열림 확인 완료');

  // ── 상태 스냅샷 헬퍼 ──────────────────────────────────────────────────────
  // onlyRenderVisibleElements(ADR-0012)가 켜져 있어 .react-flow__node DOM 개수는 "현재 뷰포트
  // 안에 있는 노드"만 센다 — 데이터 레이어의 실제 노드 수(toolbar__count, "N / M 노드 표시 중")
  // 와는 다를 수 있다. 라우트 전환처럼 레이아웃이 크게 움직이는 경우 이 둘의 괴리 자체가
  // 신호이므로(카메라가 안 따라가면 데이터는 맞는데 화면엔 0개만 보임) 둘 다 기록한다.
  async function readToolbarCounts() {
    const text = await page.locator('.toolbar__count').textContent().catch(() => null);
    const m = text?.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { visible: Number(m[1]), total: Number(m[2]) } : { visible: null, total: null };
  }

  async function fitViewNow() {
    const btn = page.locator('.react-flow__controls-fitview');
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForTimeout(500);
    }
  }

  async function snapshot(label) {
    const domNodeCountBeforeFit = await page.locator('.react-flow__node').count();
    const toolbarCounts = await readToolbarCounts();
    await fitViewNow();
    const domNodeCountAfterFit = await page.locator('.react-flow__node').count();
    const groupLabels = await page.locator('.group-node__label').allTextContents();
    // 뷰포트 기반 부분 재계산(ADR-0016 ①)이 들어간 뒤로는 fit-view만으로는(=대개 지도 모드)
    // 개별 컴포넌트 노드가 전혀 만들어지지 않는다 — 그룹 프레임만 존재한다. 이 앱은 그룹이
    // 50개 이상이라 fit-view는 항상 지도 모드로 떨어지므로, 아래 componentNames는 "0개일 수
    // 있다"는 전제로만 참고용으로 남긴다 — 라우트 간 실제 콘텐츠 교체 검증(4/5번)은 항상
    // 존재하는 그룹 라벨 집합(groupLabels) 기준으로 한다.
    const componentNames = await page.locator('.component-node__name').allTextContents();
    const anonymousCount = await page.locator('.component-node--anonymous').count();
    const pendingCount = await page.locator('text=그룹 확인 중').count();
    const dupeCheck = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('.react-flow__node')].map((el) => el.dataset.id);
      return { total: ids.length, unique: new Set(ids).size };
    });
    const s = {
      label,
      domNodeCountBeforeFit,
      domNodeCountAfterFit,
      toolbarCounts,
      groupLabels: [...new Set(groupLabels)],
      componentNameSet: new Set(componentNames),
      anonymousCount,
      pendingCount,
      dupeCheck,
    };
    console.log(
      `[verify-routing] [${label}] toolbar 기준 ${toolbarCounts.visible}/${toolbarCounts.total}개, ` +
        `DOM 렌더 노드 fit-view 전 ${domNodeCountBeforeFit}개 → 후 ${domNodeCountAfterFit}개, ` +
        `그룹 ${s.groupLabels.length}개(${s.groupLabels.slice(0, 8).join(', ')}${s.groupLabels.length > 8 ? ', …' : ''}), ` +
        `익명 ${anonymousCount}개, pending ${pendingCount}개, id 유일성 ${dupeCheck.unique}/${dupeCheck.total}`,
    );
    return s;
  }

  // 라우트 전환은 History API(pushState + popstate)로 직접 유발한다. 두 가지 이유로
  // 실제 sidebar 링크 클릭보다 이 방법이 더 신뢰성 있다:
  //   1. 보드 오버레이가 전체화면(inset:0)으로 sidebar 위를 덮어 Playwright의 locator.click()이
  //      pointer event를 가로채여 실패한다(보드를 연 채로 전환을 관찰해야 하므로 오버레이를
  //      매번 닫았다 열 수 없다).
  //   2. Login/Register 메뉴 항목은 react-router-dom `<Link target>` prop이 true라 원래 새 탭으로
  //      열리도록 설계됐다(데모 목적) — DOM의 target 속성만 지워도 Link의 onClick 핸들러는 여전히
  //      "target이 있다"고 판단해 클라이언트 사이드 내비게이션을 건너뛰고 실제 풀 리로드가
  //      일어난다(실측 확인: page 'load' 이벤트가 두 번째로 발생). pushState+popstate는 이
  //      React 컴포넌트 상태와 무관하게 라우터의 history 구독만 직접 건드리므로 두 문제를 모두
  //      피하면서 실제 브라우저 뒤로/앞으로가기와 동일한 코드 경로(라우터의 popstate 리스너)를
  //      그대로 태운다 — 여전히 완전한 클라이언트 사이드 전환이다(풀 리로드 아님, 보드 세션 유지).
  async function navigate(routePath) {
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, ROUTE_BASE + routePath);
  }

  async function gotoRoute(routePath, label, screenshotName) {
    await navigate(routePath);
    await page.waitForTimeout(1200);
    if (screenshotName) await page.screenshot({ path: outPath(screenshotName) });
    return snapshot(label);
  }

  // ── 2. MainRoutes 내부 전환: dashboard → typography → color(지연) → shadow → sample-page ──
  const sDashboard = await snapshot('dashboard');

  const sTypography = await gotoRoute('/typography', 'typography', '03-typography.png');

  // ── 3. lazy 청크 지연 전환 — Suspense fallback 구간을 실측 가능하게 만든다.
  // Vite dev 서버의 import()는 로컬 모듈이라 거의 즉시 resolve되므로(ADR-0011과 동일한 문제),
  // color 라우트의 모듈 요청에 네트워크 레벨 지연(1200ms)을 걸어 fallback 구간을 붙잡는다.
  // (excalidraw/berry-admin 소스를 건드리지 않고 Playwright page.route()로만 구현 — ADR-0011의
  // "400ms 인위 지연"을 소스 수정 대신 네트워크 인터셉션으로 옮긴 버전.)
  await page.route('**/src/views/utilities/Color.jsx*', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    // Vite dev 서버가 같은 URL로 중복/재시도 요청을 보내는 경우 두 번째 continue()가
    // "Route is already handled" 예외를 던질 수 있다 — 목적(지연 유발)은 첫 호출로 이미
    // 달성됐으므로 무시한다.
    await route.continue().catch(() => {});
  });
  const colorClickAt = Date.now();
  await navigate('/color');
  // fallback 구간 한가운데(클릭 후 ~500ms)에서 캡처 — 라우트 자체의 Loader(LinearProgress)와
  // 보드가 동시에 정상 상태인지 확인한다.
  await page.waitForTimeout(500);
  const fallbackVisible = (await page.locator('.MuiLinearProgress-root').count()) > 0;
  const nodeCountDuringFallback = await page.locator('.react-flow__node').count();
  await page.screenshot({ path: outPath('04-color-suspense-fallback.png') });
  console.log(
    `[verify-routing] color 전환 클릭 후 500ms 시점 — Suspense fallback(LinearProgress) 노출: ${fallbackVisible}, ` +
      `그 순간 보드 노드 수: ${nodeCountDuringFallback} (캔버스가 깨지지 않았는지 확인용)`,
  );
  // 나머지 지연(700ms) + 안정화 대기 후 resolve 확인.
  await page.waitForTimeout(1000);
  await page.unroute('**/src/views/utilities/Color.jsx*');
  const colorResolvedMs = Date.now() - colorClickAt;
  await page.screenshot({ path: outPath('05-color-resolved.png') });
  const sColor = await snapshot('color(지연 전환 이후)');
  console.log(`[verify-routing] color 전환 총 소요(클릭→안정화 대기 종료): ${colorResolvedMs}ms`);

  const sShadow = await gotoRoute('/shadow', 'shadow', '06-shadow.png');
  const sSamplePage = await gotoRoute('/sample-page', 'sample-page', '07-sample-page.png');

  // ── 4. 이전 페이지 그룹/노드가 실제로 사라지는지 교차 확인 ────────────────────────
  // 뷰포트 기반 부분 재계산(ADR-0016 ①) 이후로는 fit-view 상태(대개 지도 모드)에서 개별
  // 컴포넌트 노드가 아예 만들어지지 않으므로, "이름 집합" 비교는 더 이상 컴포넌트 이름이
  // 아니라 항상 존재하는 그룹(파일) 라벨 집합으로 한다 — dashboard 전용 그룹이 typography로
  // 넘어간 뒤 사라지고, typography 전용 그룹이 새로 나타나는지를 확인한다.
  const dashboardOnly = sDashboard.groupLabels.filter((g) => !sTypography.groupLabels.includes(g));
  const typographyOnly = sTypography.groupLabels.filter((g) => !sDashboard.groupLabels.includes(g));
  console.log(
    `[verify-routing] dashboard→typography 전환: dashboard 전용 그룹 ${dashboardOnly.length}개 사라짐, ` +
      `typography 전용 그룹 ${typographyOnly.length}개 새로 등장 (예시: ${typographyOnly.slice(0, 5).join(', ')})`,
  );

  // ── 5. Authentication 라우트 트리로 이동 (MainLayout 전체가 MinimalLayout으로 교체 —
  // "분리된 대형 서브트리 교체" 시나리오). fit-view 이전 스크린샷을 따로 남겨 "카메라가 이전
  // 위치에 멈춰 있어 화면이 빈 것처럼 보이는" 현상(예상 밖 발견 참고)을 시각적으로 남긴다. ──
  await navigate('/pages/login');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: outPath('08a-login-before-fitview.png') });
  const nodeCountLoginBeforeFit = await page.locator('.react-flow__node').count();
  const toolbarLogin = await readToolbarCounts();
  console.log(
    `[verify-routing] login 진입 직후(fit-view 전) — DOM 렌더 노드 ${nodeCountLoginBeforeFit}개, ` +
      `toolbar 기준 ${toolbarLogin.visible}/${toolbarLogin.total}개 (괴리가 있으면 카메라 정체 현상)`,
  );
  const sLogin = await snapshot('login(Auth 트리)');
  await page.screenshot({ path: outPath('08b-login-after-fitview.png') });
  // "Header/Sidebar/Footer 컴포넌트 이름"으로 직접 확인하는 건 이제 신뢰할 수 없다: 이
  // 저장소에서 실제로 확인해 보면 그 세 컴포넌트가 전부 `.../Header/index.jsx`,
  // `.../Footer/index.jsx`처럼 "index.jsx"라는 같은 basename을 쓴다 — groupHint가 basename
  // 단위라(위에서 보이는 "index.jsx" 그룹 자체가 그 증거) 이름만으로는 앱 엔트리 index.jsx나
  // 다른 컴포넌트의 index.jsx와 구별할 수 없다(정규식을 느슨히 하면 "CardHeader.js"처럼
  // 무관한 파일까지 오탐된다 — 직접 시도해서 확인함). 대신 이미 확실한 신호를 쓴다: 데이터
  // 레벨 노드 수 자체가 MainLayout 유무에 따라 뚜렷하게 갈린다(로그인 226/288 vs 대시보드
  // 1716) — MainLayout(사이드바/헤더 포함)이 실제로 마운트/언마운트됐다는 걸 이 수치 낙차가
  // 이미 강하게 뒷받침한다.
  console.log(
    `[verify-routing] login 진입 시 데이터 노드 수 급감(MainLayout 서브트리 언마운트 방증): ` +
      `${toolbarLogin.total} (dashboard의 ${sDashboard.toolbarCounts.total} 대비 ${((toolbarLogin.total / sDashboard.toolbarCounts.total) * 100).toFixed(0)}%)`,
  );

  const sBackToDashboard = await gotoRoute('/dashboard/default', 'dashboard(복귀)', '09-back-to-dashboard.png');
  const mainLayoutBackAfterReturn = sBackToDashboard.toolbarCounts.total === sDashboard.toolbarCounts.total;
  console.log(
    `[verify-routing] dashboard 복귀 후 데이터 노드 수가 최초 진입과 정확히 일치(MainLayout 재마운트 방증): ${mainLayoutBackAfterReturn} ` +
      `(${sBackToDashboard.toolbarCounts.total} vs ${sDashboard.toolbarCounts.total})`,
  );

  // ── 6. 연타 스트레스: 청크 하나를 지연시켜 놓고 그게 resolve되기 전에 다른 라우트로
  // 빠르게 연속 이동 — 지연된 lazy import가 이미 언마운트된 뒤 resolve되는 레이스를 유발한다. ──
  await page.route('**/src/views/dashboard/Default/index.jsx*', async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue().catch(() => {});
  });
  const rapidSequence = ['/typography', '/color', '/shadow', '/dashboard/default', '/sample-page', '/dashboard/default'];
  for (const routePath of rapidSequence) {
    await navigate(routePath);
    await page.waitForTimeout(120); // 각 청크가 resolve되기 훨씬 전에 다음 이동 — 의도적 레이스.
  }
  // 지연 걸어둔 dashboard 청크(2000ms)가 resolve될 때까지 넉넉히 대기.
  await page.waitForTimeout(2500);
  await page.unroute('**/src/views/dashboard/Default/index.jsx*');
  await page.screenshot({ path: outPath('10-after-rapid-fire.png') });
  const sAfterRapid = await snapshot('연타 스트레스 이후');

  // ── 7. 최종 안정화 + 고아 노드/중복 id 확인 ────────────────────────────────
  await page.waitForTimeout(1000);
  const finalSnapshot = await snapshot('최종 안정화');
  await page.screenshot({ path: outPath('11-final-state.png') });

  const idsHealthy = finalSnapshot.dupeCheck.total === finalSnapshot.dupeCheck.unique;
  console.log(`[verify-routing] 최종 상태 — 중복 id 없음: ${idsHealthy} (${finalSnapshot.dupeCheck.unique}/${finalSnapshot.dupeCheck.total})`);
  console.log(
    `[verify-routing] 연타 스트레스 직후 toolbar 기준 노드 수: ${sAfterRapid.toolbarCounts.visible}/${sAfterRapid.toolbarCounts.total}, ` +
      `최종(1초 후) toolbar 기준 노드 수: ${finalSnapshot.toolbarCounts.visible}/${finalSnapshot.toolbarCounts.total}`,
  );

  console.log('[verify-routing] 콘솔/페이지 에러 개수:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log('[verify-routing] 에러 내용 (최대 30개):', consoleErrors.slice(0, 30));
  }

  await browser.close();
  console.log(`[verify-routing] 완료. 스크린샷: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[verify-routing] 실패', err);
  process.exit(1);
});
