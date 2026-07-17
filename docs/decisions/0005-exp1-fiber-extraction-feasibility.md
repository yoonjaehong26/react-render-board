# ADR-0005: 실험 1 — bippy로 Fiber 트리 추출 기술 가능성 검증

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

roadmap.md의 실험 1은 "bippy(또는 react-devtools-core)로 실제 React 앱에 훅을 걸어 Fiber 트리 데이터를 JSON으로 추출할 수 있는가"를 반나절 안에 확인하는 것이었다. UI 없이 콘솔 출력만으로 충분한 스파이크였다.

`experiments/exp1-fiber-extraction/`에 Vite + React 19 + TypeScript 앱을 새로 만들고, bippy 0.6.0으로 `onCommitFiberRoot`를 훅해 Fiber 트리를 순회 후 JSON으로 콘솔에 출력하는 코드를 작성했다. 테스트 트리는 Context(`ThemeContext.Provider`/`useContext`), 리스트 렌더링(`items.map`), state 업데이트(`useState` 카운터)를 포함하도록 구성해, 실제 사용 시나리오에서 나올 구조를 커버하게 했다.

## 검토한 대안

- **react-devtools-core** — 이번 실험에서는 시도하지 않음. bippy가 요구사항(경량, 커밋 훅, 최신 React 지원)을 충분히 만족해 추가 비교가 급하지 않았다.
- **bippy** — 채택. 아래 근거 참고.

## 결정

**기술적으로 가능하다.** bippy의 `instrument({ onCommitFiberRoot })`로 커밋 시점마다 `root.current`(최상위 Fiber)에 접근할 수 있고, 여기서부터 `child`/`sibling` 포인터를 따라 순회하면 컴포넌트 트리(Context, 리스트, 중첩 컴포넌트 포함)를 정확한 부모-자식 관계로 JSON 직렬화할 수 있음을 실제로 확인했다.

검증 방법: Playwright로 헤드리스 브라우저를 띄워 앱을 로드하고, 카운터 버튼을 클릭해 상태 업데이트를 유발한 뒤 콘솔 로그를 캡처했다. 결과:
- 초기 마운트 시 1회 커밋 → 전체 트리(App → ThemedLabel/Counter/ItemList → 각 host/composite 노드)가 정확히 출력됨.
- 버튼 클릭마다 새 커밋이 발생하고, 변경되지 않은 하위 Fiber는 동일한 id를 유지함(순회 로직이 `getFiberId`로 안정적인 식별자를 부여).
- Context를 통해 렌더된 `ThemedLabel`, 리스트로 렌더된 3개의 `ListItem`도 모두 올바른 parentId로 나타남.

## 근거 (설계 원칙 준수 여부)

architecture.md의 4가지 원칙을 실험 코드에 그대로 반영했다:

1. **devtools-only 실행** — `startFiberInspector()`는 `import.meta.env.DEV`가 false면 즉시 반환한다. 프로덕션 빌드에서는 `instrument()` 자체가 호출되지 않아 훅에 전혀 개입하지 않는다.
2. **재귀 순회 가드** — `MAX_DEPTH = 200` 깊이 제한과 `visited: Set<number>` 방문 노드 캐시를 순회 함수에 넣었다. 방문한 id는 재방문하지 않으므로 순환 참조가 있어도 스택이 터지지 않는다.
3. **커밋 시점 훅** — `onCommitFiberRoot` 콜백 안에서만 트리를 직렬화한다. 마운트 요청 시점이 아니라 실제로 커밋이 완료된 `root.current`를 읽으므로 React-Sight가 겪은 "데이터가 아직 없음" 문제가 재현되지 않았다.
4. **브라우저 확장 배포 리스크** — 이번 실험은 npm 패키지(앱에 직접 import)로 검증했으므로 해당 없음. 확장 배포는 이후 단계에서 재검토.

## 예상 밖 발견 (기록해 둘 것)

- **`secure()`가 이 버전(bippy 0.6.0)에는 없다.** technical-options.md는 "`secure`(try/catch 래핑으로 앱 크래시 방지)"를 언급하지만, 실제 설치된 패키지의 `dist/index.d.ts`에는 `secure` export가 존재하지 않는다. `instrument()`의 내부 구현을 봐도 `onCommitFiberRoot` 리스너 호출부(`for(let e of K)e(t,i,a)`)에 try/catch가 없다 — 즉 콜백 안에서 에러가 나면 그대로 던져진다. 이번 실험에서는 `onCommitFiberRoot` 콜백 본문을 직접 try/catch로 감싸 원칙 1(안전 가드)을 수동으로 채웠다. → **ADR-0002(훅킹 레이어 결정)를 확정할 때 `secure`의 존재 여부/버전별 API를 다시 확인해야 한다.** bippy 문서와 실제 배포 버전 사이에 API 드리프트가 있을 수 있음을 감안한다.
- `getDisplayName`이 익명 함수 컴포넌트(화살표 함수로 즉석 정의된 것 등)에 대해 `null`을 반환해 `(anonymous)`로 표기되는 경우가 있었다(예: `ThemeContext.Provider` 내부 구현 Fiber). 실제 사용자 컴포넌트(App, ThemedLabel, Counter, ItemList, ListItem)는 모두 이름이 정확히 나왔다. 시각화 레이어(실험 2/라이브 MVP)에서 React 내부 구현 Fiber(Provider/Consumer 래퍼 등)를 어떻게 걸러내거나 표시할지는 별도로 결정이 필요하다.

## 결과

- 훅킹 레이어로 bippy를 계속 쓰는 것에 대한 기술적 장애물은 없다. ADR-0002의 방향(MVP는 bippy, 정식 단계에서 react-devtools-core와 재비교)을 유지한다.
- 실험 1은 완료 조건(반나절 내 "되는지 안 되는지" 확인)을 충족했다. 다음 단계는 roadmap.md의 실험 2(React Flow로 클러스터링 + 줌 프로토타입)로 진행한다.
- 이 실험의 코드(`experiments/exp1-fiber-extraction/`)는 스파이크 코드이며 라이브 MVP에 그대로 재사용할 필요는 없다 — 다만 위 발견들(특히 `secure` 부재, 익명 Fiber 필터링 필요성)은 다음 단계 설계에 반영한다.
