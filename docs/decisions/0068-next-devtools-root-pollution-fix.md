# 0068. Next DevTools 오버레이 root 오염 수정 — "c8/eS" 이름의 진짜 정체와 역방향 이동 실패

- 날짜: 2026-07-18
- 상태: 승인됨
- 관련: [ADR-0036](0036-distribution-connection-implementation.md)(주입 런타임), [ADR-0065](0065-hook-this-binding-bug-fix.md)~[0067](0067-import-meta-env-dead-code-elimination-bug.md)(같은 실사용 라운드), [research/2026-07-18-turbopack-component-name-mangling.md](../research/2026-07-18-turbopack-component-name-mangling.md)(선행 조사)

## 맥락

0.2.1 재배포 후에도 실사용 프로젝트(greedy-homepage-fe, Next 16.2.10 + Turbopack)에서 두 증상이 계속됐다:

1. 보드의 컴포넌트 이름이 전부 "ui"·"ew"·"c8"·"eS"·"nd"·"na"·"ns" 같은 압축 식별자.
2. Alt+hover 햇칭(페이지 쪽)은 되는데, **Alt+클릭 → 보드 노드 이동이 안 되고**, 보드 노드 클릭 → 실제 요소 하이라이트도 안 됨. 같은 설치물이 Vite·webpack 소비자에선 전부 정상.

선행 조사(연구 문서)는 "기본 Turbopack dev는 이름을 망글링하지 않는다"까지 밝혔지만 그럼 저 이름들이 어디서 오는지는 가설로 남겨뒀었다.

## 진단 (스파이크 재현 — 추측이 아니라 실측)

`experiments/bundler-injection-spike/turbopack-nextjs`(최소 Next 16 앱)에 Playwright 진단 스크립트로 실측한 결과, **그리디와 글자까지 동일한 이름 집합("ui", "ew", "c8", "eS", "nd", "na", "ns", …)이 재현**됐다. 결정적 증거 두 가지:

- 압축 이름 함수들의 소스에 `enableCacheIndicator`, `shadowRoot`, `state.buildError`, `(0,S.c)(n)`(React Compiler 메모 캐시)가 들어 있다 — **Next.js 자체의 DevTools 오버레이 UI 컴포넌트들**이다(`next/dist/compiled/next-devtools/index.js`, 사전 미니파이 배포). 두 앱에서 이름이 똑같았던 이유 = 같은 Next 번들의 결정적 산출물.
- 관찰된 React root 덤프: ① `NEXTJS-PORTAL`(트리 헤드 `ui`) = Next DevTools root, ② `#document` = 진짜 앱 root, ③ 보드 자신. Next 소스도 확인 — `createRoot(document.createElement("nextjs-portal"))` 후 같은 엘리먼트에 `attachShadow`. 즉 **DevTools root 컨테이너는 ShadowRoot 안이 아니라 light DOM의 커스텀 엘리먼트**다.

증상 메커니즘은 두 결함의 합작:

1. **store는 latest-root-wins다** — `handleCommit(root)`이 커밋된 root 하나의 트리로 스냅샷·`fibersById`를 통째로 교체한다. Next DevTools root(FPS 인디케이터 등으로 계속 커밋)가 매번 마지막 커미터가 되어 **보드가 대상 앱 대신 Next 내부 UI 트리를 그렸다.** "이름 압축"으로 보였던 것의 정체는 컴파일 문제가 아니라 **엉뚱한 트리를 보여주고 있던 것.** Alt+클릭 역방향은 앱 root의 fiber id를 돌려주는데 그 id가 보드 트리(DevTools 트리)에 없으니 이동이 무시됐고, 페이지 쪽 햇칭(요소 직접 참조)만 살아 있었다 — 관찰된 비대칭과 정확히 일치.
2. **조기 훅 버퍼가 rendererID 키였다** — 한 renderer의 여러 root(앱 + DevTools + 보드) 중 마지막 커밋 root만 남아, 런타임 부팅 시 재생(drain)에서 앱 root가 유실될 수 있었다.

Vite/webpack 소비자가 멀쩡했던 이유: Next DevTools가 없어 root가 앱 하나뿐이다. **SSR과는 무관하다**(사용자 질문에 대한 답 — 같은 Next 앱에서 hover는 됐다는 것 자체가 SSR이 원인이 아니라는 증거였다).

## 결정

1. **도구 오버레이 root를 관찰에서 제외한다** (`src/inject.tsx`의 `isToolOverlayRoot`). 판별은 실측 패턴 기반: 컨테이너가 (a) 커스텀 엘리먼트(태그에 `-` — `NEXTJS-PORTAL` 등), (b) 자신이 shadow host, (c) ShadowRoot 내부, (d) `[data-nextjs-dev-overlay]` 아래. instrument 콜백과 버퍼 drain 양쪽에 적용.
   - 트레이드오프: 커스텀 엘리먼트/ShadowRoot 안에 **대상 앱**을 마운트하는 웹컴포넌트 임베드는 관찰에서 빠진다 — 원래도 지원한 적 없는 케이스로, 필요 증거가 나오면 옵션으로 연다.
2. **조기 훅 버퍼 키를 rendererID → FiberRoot 객체 자체로** (`cli/early-hook-script.cjs`) — 커밋마다 같은 FiberRoot 객체가 재사용되므로 root당 1엔트리가 유지된다.
3. **store의 latest-root-wins 자체는 유지한다** — 도구 root를 걸러낸 뒤 "관찰 대상 root가 여럿인 실제 앱" 증거가 아직 없다(과투자 금지 원칙). 다중 root 병합은 증거가 나오면 별도 ADR.
4. **진단 핸들 `window.__RRB_DEBUG__` 추가** (`src/inject.tsx`, dev 전용) — 이번 라운드 내내 배포된 번들 안을 들여다볼 방법이 없어 원인 격리가 느렸다. store/interactionStore를 노출해 실사용 현장에서 `__RRB_DEBUG__.store.getSnapshot()` 등으로 즉시 진단할 수 있게 한다.

## 검증

- 스파이크 진단 재실행(수정 빌드): 보드 스냅샷이 DevTools 트리(43노드, 전부 압축 이름) → **앱 트리로 교체**되고, Alt+클릭 → 보드 카메라 이동 + 하이라이트가 살아나는 것 확인(수치는 아래 실측 로그 참고 — 진단 스크립트는 1회용으로 커밋하지 않음, 재구성 절차는 본문 서술로 충분).
- 기존 게이트: `npm run typecheck` + vitest 342개 통과.

## 남는 것

- 그리디에는 react-scan도 병행 설치돼 있다 — react-scan 툴바 root가 커스텀 엘리먼트/shadow 패턴이 아니면 같은 오염이 남을 수 있다. 다음 실사용 세션에서 `__RRB_DEBUG__`로 확인.
- Next의 **앱 root 트리 안에도** Next 클라이언트 런타임 컴포넌트(AppRouter 등)가 섞인다 — 이건 정상 관찰 대상이고 이름도 온전하다. 다만 "프레임워크 내부 접기" 같은 표시 정책은 별도 논의.
