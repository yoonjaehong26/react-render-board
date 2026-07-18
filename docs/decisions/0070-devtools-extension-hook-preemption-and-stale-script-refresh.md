# 0070. DevTools 확장의 훅 선점 대응(기존 훅 wrap) + 조기 스크립트 stale 갱신

- 날짜: 2026-07-19
- 상태: 승인됨
- 관련: [ADR-0065](0065-hook-this-binding-bug-fix.md)(this 바인딩·다중 리스너 폐기), [ADR-0068](0068-next-devtools-root-pollution-fix.md)(root 오염·버퍼 키), [ADR-0036](0036-distribution-connection-implementation.md)(조기 스크립트 아키텍처), [ADR-0062](0062-postinstall-automation.md)(postinstall 자동 init)

## 맥락 — 실사용자가 근본 원인까지 규명해 제보

0.2.2 설치 후에도 실사용 프로젝트(greedy-homepage-fe, Next 16 + Turbopack + React 19.2, App Router)에서 보드 패널은 뜨는데(`__RRB_BOOTED__ true`, `[rrb] render-board injected` 로그 정상) 노드 트리가 항상 **"0 / 0 노드 표시"** 로 비어 있었다. 사용자가 `<head>` 스크립트에 임시 로그를 심어 확진했다:

> `console.log('[rrb-debug] hook already present:', !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__)` → **확장 켜진 상태에서 `true`**. `renderer injected`/`onCommitFiberRoot fired`는 한 번도 안 찍힘. 확장을 끄고 하드 리프레시하니 정상 작동(`roots size: 3`).

## 진단 — 두 개의 별개 문제

### 문제 1(근본): 브라우저 DevTools/React Scan **확장**의 훅 선점

조기 스크립트(`cli/early-hook-script.cjs`)는 `if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__)`일 때만 훅을 설치했다. 그런데 **브라우저 확장의 콘텐츠 스크립트는 `document_start`에 실행돼 페이지의 `<head>` 인라인 스크립트보다도 먼저 훅을 심는다.** 그러면 이 조건이 항상 거짓 → rrb의 버퍼링 훅이 아예 안 걸림 → `__RRB_ROOTS__`가 계속 비어 있음 → 런타임이 부팅해 재생해도 그릴 게 없음. Next는 하이드레이션 커밋이 런타임 부팅보다 먼저 끝나고, 이 페이지처럼 이후 리렌더가 없는 정적 화면이면 라이브 커밋도 없어 **영구 0/0**.

- **ADR-0068(root 오염)과는 별개 문제다.** 0068은 "도구 root의 트리를 잘못 그림", 0070은 "아예 아무 트리도 못 잡음". 0068 수정만으론 확장 환경에서 여전히 0/0.
- **react-scan `<script>` 태그는 무죄**(사용자 실측): 확장을 끈 채 react-scan 스크립트만 켜면 정상. 이번 건 스크립트 레벨이 아니라 **확장 레벨** 경합이라 ADR-0065의 "react-scan 공존 보류"와도 분리해서 본다.
- Vite/webpack이 멀쩡했던 이유: Vite는 런타임(inject)이 앱보다 먼저 떠 bippy `instrument()`가 기존 훅을 감싸 전 커밋을 잡고, webpack도 유사. Next만 "하이드레이션이 런타임보다 먼저"라 조기 스크립트 버퍼가 필수인데 그게 확장에 막혔다.

### 문제 2: 조기 스크립트가 layout에 **박제**돼 업데이트가 안 흘러듦

`init`은 `EARLY_HOOK_SCRIPT_BODY` **전문**을 layout.tsx에 심고, 재실행 시 마커(`data-rrb-inject`) **존재 여부만** 보고 "이미 설정됨"으로 스킵한다. 그래서 패키지가 스크립트를 고쳐도(예: ADR-0068의 `set(root,root)`, 이번 wrap 수정) 이미 설치된 프로젝트의 layout엔 **구버전이 영구히 남는다.** 사용자가 관측한 "layout 사본만 구버전(rendererID 키)"이 정확히 이것.

## 결정

1. **기존 훅이 있으면 `onCommitFiberRoot`를 한 번만 wrap한다**(`cli/early-hook-script.cjs`). `if (!hook)` → 자체 설치, `else if (!hook.__rrbPatched__)` → 원본 보존하며 재할당해 우리 버퍼(`rrbBufferRoot`)도 채우고 원본을 `apply`로 이어 호출. 확장의 Components 패널 등도 그대로 동작.
   - **ADR-0065의 무한 재귀 폐기 시도와 다른 점**: 그건 `onCommitFiberRoot`를 get/set 접근자(다중 리스너 디스패처)로 만든 구조라, 다른 도구의 "capture-and-rewrap" 패턴과 물려 무한 루프가 났다. 이번은 **평범한 함수 프로퍼티를 딱 한 번 재할당**하는 단순 wrap이고 `__rrbPatched__`로 중복도 막는다. React가 매 커밋 `hook.onCommitFiberRoot`를 프로퍼티로 새로 읽어 호출하므로(캐싱 안 함) 한 번 감싸면 이후 전부 걸린다. 타이밍도 안전(인라인 동기 실행 vs 하이드레이션은 훨씬 뒤).
   - 이 설계·검증은 **실사용자가 로컬에서 먼저 구현·확인**해 제보한 것을 패키지에 정식 반영한 것이다.
2. **조기 스크립트에 내용 해시 마커 + stale 갱신**(`cli/next.mjs`). 마커를 `data-rrb-inject="<SCRIPT_HASH>"`(본문 sha256 앞 8자)로 바꾸고, `patchNextLayout`이 (a) 최신 해시 있음 → 스킵, (b) 마커는 있는데 해시 다름/구형 빈 마커 → **그 블록만** 최신으로 교체(`refreshed-script`), (c) 없음 → 신규 삽입. 정규식은 우리 가드(`&& ( <script data-rrb-inject`)에만 매칭돼 `RenderBoardClient` 렌더·앱 코드는 안 건드린다.
   - **핵심 효과**: postinstall이 init을 자동 실행(ADR-0062)하므로, 기존 사용자는 **`npm install react-render-board@latest`만으로 layout의 구버전 스크립트가 자동 갱신**된다 — 이번 wrap 수정이 재설치만으로 전파된다. 내용 안 바뀐 버전업은 해시가 같아 재작성 안 함(불필요한 diff churn 없음).

## 검증

- `patchNextLayout` node 스모크: 신규 삽입 / 재실행 스킵 / 구버전(빈 마커+구본문) 갱신(구본문 제거·해시 반영·RenderBoardClient 가드 보존·rrb 블록 1개) / 갱신 후 재실행 스킵 — 전부 통과.
- `verify:init-next-canvas`에 **확장 선점 케이스** 추가: Playwright `addInitScript`로 `document_start`에 가짜 훅을 미리 심어(확장 모사) → 보드가 앱 트리를 그리고(노드>0), `__rrbPatched__` 설정, **가짜 훅 원본 onCommitFiberRoot도 체이닝 호출**(확장 공존)까지 실측. 확장 없는 기존 경로도 함께 통과.
- `typecheck` + vitest 342개 통과.

## 남은 것

- `verify-init-next` 등 다른 스크립트가 조기 스크립트 본문을 직접 비교하진 않아 해시 변경에 영향 없음.
- react-scan `<script>`(확장 아닌 태그)와의 완전 공존은 여전히 ADR-0065대로 보류 — 이번 wrap이 그 경합까지 푸는 건 아니다(사용자 실측상 태그 단독은 원래 무해).
