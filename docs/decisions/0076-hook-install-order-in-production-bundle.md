# 0076. production 번들에서 devtools 훅을 react-dom보다 먼저 설치한다 (`bippy/install-hook-only` 최상단 import)

- 상태: 채택
- 날짜: 2026-07-31
- 관련: ADR-0005(bippy 채택), ADR-0067/0075(dev 게이트), Netlify 데모 배포

## 맥락

Netlify 데모 배포에서 `VITE_IS_DEMO` 플래그로 dev 게이트를 통과시켰는데도(직전 커밋) 보드가 "커밋 #0 · 0 / 0 노드"로 비어 있었다. 콘솔에는 인스펙터 시작 로그가 정상 출력됐다 — 게이트 문제가 아니었다.

node_modules에 트레이스를 심어 production 번들의 모듈 평가 순서를 실측한 결과:

```
[TRACE] react-dom-client module eval, hook present? false   ← react-dom이 먼저
[TRACE] rdt-hook.js module eval start                        ← bippy 훅 설치는 그 뒤
```

React는 **react-dom 모듈이 평가되는 순간 딱 한 번** `__REACT_DEVTOOLS_GLOBAL_HOOK__.inject(renderer)`를 시도하고, 훅이 없으면 조용히 건너뛴 뒤 다시 시도하지 않는다. production 번들에서는 번들러(rolldown)가 react-dom 청크를 bippy보다 먼저 평가해 renderer 등록이 영영 누락됐고, 커밋 이벤트가 0건이었다. **dev 서버는 모듈 제공 순서가 달라 우연히 동작**했기 때문에 로컬에서는 재현되지 않았다(배포에서만 터지는 순서 의존 버그).

## 결정

`src/main.tsx`(데모 진입점) 맨 위, 모든 import보다 앞에 bippy의 부수효과 전용 진입점을 둔다:

```ts
import 'bippy/install-hook-only';
```

이 진입점은 정확히 이 목적(react-dom 평가 전에 훅만 먼저 설치)을 위해 bippy가 제공한다.

## 결과

- production 빌드(`VITE_IS_DEMO=true npm run build` + `vite preview`)를 Playwright로 실측: 0/0 → **93/347 노드 정상 표시**.
- 라이브러리 소비자는 영향 없음 — 주입 레이어(cli/*)는 소비자 앱 진입 전에 로드되는 구조라 원래 이 순서 문제가 없고, 이 변경은 데모 진입점(main.tsx)에만 적용된다.
- 교훈: "훅 기반 계측이 조용히 0건"이면 게이트(dev 판별)보다 **훅 설치 vs react-dom 평가 순서**를 먼저 의심한다. dev에서 되고 배포에서만 안 되면 특히.
