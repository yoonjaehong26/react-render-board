# ADR-0065: 조기 훅 `inject`의 `this` 바인딩 버그 수정 — react-scan 충돌

- 상태: 채택됨(구현)
- 날짜: 2026-07-19

## 맥락

실사용 프로젝트(그리디 홈페이지, Next 16 + Turbopack, `react-scan` 병행 설치)에서 보드를 열면 캔버스가 "(그룹 확인 중…)"에서 멈춘 채 노드가 전혀 렌더되지 않는 문제가 보고됐다. 실제 브라우저 콘솔을 확인한 결과:

```
TypeError: Cannot read properties of undefined (reading 'size')
  at inject (조기 <head> 스크립트)
  at t.inject (react-scan/dist/auto.global.js)
  at hook.inject (Next 런타임)
```

원인: `cli/early-hook-script.cjs`의 조기 훅 스텁이 `inject: function (r) { var id = this.renderers.size + 1; ...}`처럼 **`this.renderers`에 의존**했다. react-scan의 `auto.global.js`는 이미 설치된 훅을 발견하면 `inject`를 **체이닝**하는데(원본을 저장해뒀다가 나중에 호출), 그 저장 방식이 `this` 바인딩 없이(참조만 복사해) 호출하는 패턴이라 `this`가 `undefined`가 되고 `this.renderers`에서 예외가 터졌다 — 매 커밋마다 이 예외가 반복돼 데이터 파이프라인 전체가 죽었다.

## 결정

`inject`가 `this`에 전혀 의존하지 않도록 고쳤다. `renderers` Map을 클로저 변수로 잡고, `inject` 함수는 그 클로저 변수를 직접 참조한다:

```js
var rrbRenderers = new Map();
window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  ...
  inject: function (r) { var id = rrbRenderers.size + 1; rrbRenderers.set(id, r); return id; },
  ...
};
```

이러면 `inject`가 어떤 `this`로 호출되든(바인딩 없이, `.call()`로, 다른 객체를 `this`로) 항상 올바르게 동작한다.

## 검증

react-scan이 하는 것과 동일한 패턴(참조만 복사해 `this` 없이 호출)을 재현하는 격리 HTML 테스트를 만들어:
- **수정 전 코드**: 정확히 실사용자가 본 것과 같은 에러(`Cannot read properties of undefined (reading 'size')`) 재현 확인.
- **수정 후 코드**: 같은 재현 시나리오에서 에러 없이 정상 동작(`rendererCount: 1`) 확인.

실사용 프로젝트에 직접 반영 후 재확인: `window.__RRB_COMMITS__`가 0 → 20+로 정상 상승, 관련 에러 0건.

## 예상 밖 발견 — 이어서 시도했다 폐기한 것 (다중 리스너 슬롯)

같은 실사용 세션에서 **`onCommitFiberRoot`도 react-scan이 체이닝 없이 그냥 덮어쓴다**는 걸 추가로 발견했다(react-scan의 `auto.global.js` 소스를 직접 확인: `inject`는 체이닝하지만 `onCommitFiberRoot`는 `hook.onCommitFiberRoot = fn`으로 무조건 대입). 우리 보드 런타임도 하이드레이션 이후 늦게 뜨며 같은 방식으로 덮어써서 "나중에 뜬 도구가 이긴다"로 서로를 밀어냈다 — 그래서 react-scan의 "Outline Re-renders" 기능이 캔버스에 0픽셀만 그리는 증상으로 나타났다.

**`Object.defineProperty`로 `onCommitFiberRoot`를 다중 리스너 슬롯(get이 항상 같은 dispatch 함수를 돌려주고, set은 리스너를 추가)으로 바꾸는 수정을 시도했으나, 실사용 중 무한 재귀로 실제 페이지가 완전히 멈추는 사고가 났다.** 원인: 어떤 도구가 "현재 값을 캡처해 감싸서 재대입"하는 흔한 패턴(`const orig = hook.onCommitFiberRoot; hook.onCommitFiberRoot = (...a) => { orig(...a); ... }`)을 쓰면, `orig`로 캡처되는 값이 항상 **같은 dispatch 함수 자체**이고 그 래퍼가 리스너 목록에 다시 등록되면서, dispatch가 자기 리스너 중 하나(그 래퍼)를 부르고 그 래퍼가 다시 dispatch를 부르는 무한 루프가 만들어졌다.

**즉시 되돌렸다**(사용자의 실제 프로젝트 파일 + 이 저장소의 소스 파일 둘 다) — 실제 사고가 난 파일을 되돌리는 것과 별개로, 소스 자체에도 위험한 코드가 남아있었던 걸 뒤늦게 발견해 함께 정리했다(작업 중 두 곳을 따로 고치다 소스 쪽을 놓칠 뻔한 실수 — 앞으로 "실사용 프로젝트에 핫픽스" + "소스 자체 수정"은 항상 같은 커밋/같은 타이밍에 짝지어야 한다는 교훈).

**react-scan과의 완전한 공존은 보류한다.** 더 안전한 설계(예: 재귀 가드 플래그, 또는 dispatch 함수를 매번 새로 만들어 "캡처 후 재대입" 패턴이 자기 자신을 다시 못 부르게 하는 방식)가 나오기 전까지는 단순 단일 슬롯(이 ADR의 `this`-세이프 버전)으로 유지한다 — react-scan의 hover/outline 기능은 우리 보드와 동시에 쓸 때 여전히 안 될 수 있다는 게 알려진 한계다.

## 결과

- `cli/early-hook-script.cjs`가 Next(`cli/next.mjs`)와 webpack(`cli/webpack.cjs`) 양쪽 조기 스크립트에 공유되므로, 이 수정 하나로 두 경로 모두 커버된다.
- 이 버그는 react-scan이 설치된 프로젝트에서만 드러났지만, **"다른 devtools 훅 도구와 같은 페이지에 있을 때"라는 조건 자체는 흔할 수 있어(React DevTools 확장, 다른 프로파일러 등)** 이 수정은 react-scan 전용이 아니라 일반적인 강건성 개선이다.
- 다중 리스너 슬롯(react-scan과의 완전한 양방향 공존)은 **보류** — 향후 별도 라운드로 재시도할 수 있으나, 무한 재귀 위험을 없앤 설계가 먼저 확보돼야 한다.

## 관련
- [ADR-0036](0036-distribution-connection-implementation.md)(조기 훅 스크립트 원 구현) · [ADR-0021](0021-bundler-injection-feasibility.md)
