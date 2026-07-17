# ADR-0008: 라이브 MVP — 실험 1 + 2 + 그룹핑 힌트 검증 통합

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

roadmap.md의 "라이브 MVP" 단계. 실험 1(기술 가능성), 실험 2(UI 철학), 그룹핑 힌트 검증(ADR-0007)이 모두 끝난 뒤, 실제 React 앱에 실시간으로 훅을 걸어 커밋마다 렌더 트리를 캔버스에 업데이트하는 것까지 하나로 합쳤다. 코드는 저장소 루트의 `src/`에 새로 구성했다(`experiments/`가 아니라 처음으로 "진짜" 코드 위치).

3-레이어 구조를 그대로 따랐다:

- `src/hooking/` — exp1의 3원칙(devtools-only, 재귀 순회 가드, 커밋 시점 훅, 수동 try/catch)을 그대로 유지.
- `src/data/` — exp1의 순회 로직 + exp1 source-spike/ADR-0007의 `getSource` 그룹핑 힌트 + exp2의 전처리 개념을 하나의 파이프라인으로 합침 (신규).
- `src/visualization/` — exp2의 그룹핑(영역 프레임 + 실제 노드 유지), 그룹 경계 횡단 엣지, semantic zoom 컨트롤러, host 노드 기본 숨김을 그대로 재사용하되 레이아웃 재계산 전략은 새로 설계.
- `src/fixtures/` — exp1의 테스트 트리(Context, 리스트, state 업데이트, shared/checkout 멀티 도메인)를 확장한 계측 대상 앱.

검증은 `npm run dev`로 띄운 뒤 `scripts/verify.mjs`(Playwright)로 했다 — 이 스크립트는 판단 지점 이후에도 재사용할 수 있게 저장소에 남겨둔다.

## 검토한 대안 및 결정

### 1. 익명 Fiber 필터링 통일 (ADR-0007이 미해결로 남긴 부분)

exp2는 `displayName === '(anonymous)'`(이름 기반), exp1 source-spike는 bippy `isCompositeFiber`(tag 기반) 두 기준이 따로 있었다.

**결정: tag 기반(`isHostFiber`/`isCompositeFiber`)을 유일한 판단 기준으로 삼는다.** `src/data/serialize.ts`가 순회 중 각 Fiber를 분류해서, 둘 중 어느 쪽도 아닌 Fiber(Provider/Consumer wrapper, Fragment, Root 등 React 내부 배관)는 애초에 노드로 만들지 않고 자식을 가장 가까운 "실제" 조상에 재연결한다. **진짜 이름 없는 함수로 정의된 composite 컴포넌트는 다르게 취급한다** — tag 기준으로는 여전히 사용자 코드이므로 노드로 남기고 `displayName`만 "(anonymous)"로 표시한다(시각화 레이어에서 흐리게 표시, exp2의 dim 모드와 동일한 효과이나 기본값으로 승격).

이유: tag 기반 분류가 더 근본적이다(displayName은 나중에 우연히 있을 수도 없을 수도 있는 부가 정보인 반면, fiber tag는 React가 그 Fiber의 "본질"을 이미 분류해 둔 값). 또한 ADR-0007이 이미 발견했듯 `isCompositeFiber`를 쓰면 `getSource` 호출 대상 선정과 필터링 기준이 자연스럽게 하나로 합쳐진다.

### 2. groupHint 파이프라인 (async, dev 전용)

`src/data/store.ts`(`RenderStore`)가 커밋마다 두 단계로 동작한다:

1. `serializeFiberTree`로 동기 직렬화 → 새 노드 목록을 즉시 구독자에게 알린다(`groupHint`는 비어있을 수 있음).
2. `getFiberId`가 커밋 사이에 안정적이라는 사실(ADR-0005)을 이용해 이미 resolve된 `groupHint`를 같은 id에 이어붙이고, 아직 모르는 composite id만 골라 `resolveGroupHints`(`bippy/source`의 `getSource`)를 비동기로 돌린 뒤 patch로 다시 알린다.

`import.meta.env.DEV`가 아니면 이 2단계 자체를 건너뛴다(ADR-0007: 그룹핑 힌트는 dev 전용).

### 3. 레이아웃 재계산 전략 (신규 설계 — 프롬프트가 요구한 핵심 결정)

exp2의 `computeLayout()`은 정적 데이터 1회 배치를 가정한 스파이크였다. 매 호출마다 그룹 이름을 알파벳순 정렬해서 처음부터 다시 행-패킹하고, 그룹 내부도 항상 전체를 다시 타이디 트리로 배치했다. 라이브 MVP처럼 매 커밋마다 호출하면: (a) 새 그룹 하나만 나타나도 정렬 순서가 바뀌어 기존 그룹 전체가 재배치되고, (b) 그룹 안에서 형제 하나가 추가/삭제돼도 leaf-cursor 순차 배정 때문에 그 뒤의 모든 노드가 옆으로 밀린다.

**결정: "순서 고정 + 그룹 단위 메모이제이션".** `src/visualization/lib/layout.ts`의 `createLayoutEngine()`이 커밋을 넘나들며 상태를 들고 있는다:

- 그룹이 처음 등장한 순서를 영구히 기억하고, 새 그룹은 append만 한다 — 무관한 커밋 때문에 기존 그룹의 **순서**가 바뀌는 일은 없다. (단, 완전한 좌표 고정은 아니다 — 앞선 그룹의 "폭"이 늘어나면 뒤따르는 그룹의 x좌표는 여전히 밀릴 수 있다. 판단 지점 QA 수준에서는 순서 안정성으로 충분하다고 보고, 완전한 위치 고정은 스코프 밖으로 남겼다.)
- 그룹 내부 타이디 트리 배치는 그룹별로 캐시한다. 캐시 키는 그 그룹에 속한 `(id, parentId)` 쌍의 집합 — 이 집합이 커밋 전후로 동일하면(그 도메인에 변화가 없으면) 이전 결과를 그대로 재사용한다. 실제 앱에서 상호작용 한 번은 보통 트리의 한 서브트리(한두 그룹)만 바꾸므로, 나머지 그룹은 재계산을 건너뛴다.
- 그룹이 바뀐 경우는 그 그룹 내부만 처음부터 다시 배치한다(증분 배치는 스코프 밖 — 도메인 하나의 크기가 QA 수준에서는 작아서 통째로 다시 배치해도 "그 그룹만 흔들리고 나머지는 그대로"로 충분하다고 판단).
- 안정적인 fiber id(문자열이 아니라 숫자 id 그대로 React Flow 노드 id로 사용) + CSS `transition: transform`(`flow.css`)을 더해, 값이 실제로 바뀐 노드만 부드럽게 움직이고 나머지는 제자리를 지킨다.

이 설계는 Playwright 검증(`상품 담기`/`항목 추가`/알림 패널 토글)에서 의도대로 동작함을 확인했다 — 한 그룹에 노드를 추가해도 다른 그룹의 프레임과 내부 배치가 그대로 유지됐다.

### 4. groupHint가 비어있는 노드의 임시 표시

`groupHint`는 async라 커밋 직후엔 비어있을 수 있다(ADR-0007). `src/visualization/lib/groups.ts`가 조상 체인을 올라가며 가장 가까운 "resolve된" composite 조상의 그룹을 물려받고, 그마저 없으면 임시 버킷(`__pending__`, 캔버스에는 "(그룹 확인 중…)"으로 표시, 점선 테두리)에 넣는다. 힌트가 resolve되면 다음 스냅샷에서 그 노드가 pending 버킷에서 실제 그룹으로 "이동"한다 — 레이아웃 엔진 입장에서는 두 그룹(pending, 실제 그룹)의 시그니처가 바뀌는 것뿐이라 3번 설계와 자연스럽게 맞물린다.

### 5. subject/board 두 개의 React root로 분리

exp1은 콘솔 출력만 했고 exp2는 정적 데이터만 그렸기 때문에 겪지 않았던 문제: 라이브 MVP는 계측 대상 앱과 그 결과를 그리는 보드를 **같은 페이지**에 띄운다. 둘을 하나의 React root/트리에 두면 보드 자신의 리렌더까지 훅에 걸려 스스로를 관찰 대상으로 삼아버린다.

**결정: `createRoot`를 두 번 호출**(`src/main.tsx`)해서 계측 대상(subject)과 보드(board)를 완전히 분리한다. `src/hooking/fiberInspector.ts`는 `onCommitFiberRoot`에서 `root.containerInfo`(FiberRoot가 들고 있는 DOM 컨테이너 — bippy 타입은 `any`지만 React 내부에 항상 존재)를 subject의 컨테이너와 비교해서 다른 root의 커밋은 무시한다.

## 예상 밖 발견 (기록해 둘 것)

- **호스트 노드 자식의 groupHint는 "자기 파일"이 아니라 "자신을 감싼 composite의 호출부"로 귀속된다.** `getSource`는 composite fiber에만 있으므로, host fiber(예: `CheckoutPanel`이 직접 반환하는 `<section>`)는 스스로 힌트를 가질 수 없다. `resolveEffectiveGroups`는 조상 체인을 올라가 가장 가까운 composite의 **자기 자신의** 힌트(= 그 composite가 호출된 위치)를 물려주는데, 이 값은 그 composite "내부"의 실제 파일(`CheckoutPanel.tsx`)이 아니라 그 composite가 "쓰인" 위치(`DemoApp.tsx`)다. 반면 같은 위치에서 렌더되는 형제 composite(예: `Button`)는 자기 자신의 `getSource`가 정확히 `CheckoutPanel.tsx`를 돌려주므로 다른 그룹으로 잡힌다. 실제 화면(`section`/`h2`/`ul`이 `Button`과 다른 그룹으로 보임)에서 이 비일관성을 직접 확인했다. 버그가 아니라 `getSource`가 애초에 "이 컴포넌트가 어디서 쓰였나"만 알려주고 "이 컴포넌트 자신의 파일이 뭔가"는 알려주지 않는다는 근본적인 한계다 — host-only 자식이 있는 컴포넌트를 다룰 때 그룹 경계가 기대와 다르게 보일 수 있음을 문서화해 둔다.
- **플렉스 레이아웃 안에서 React Flow 캔버스 높이가 0으로 무너지는 문제.** `#board-root`처럼 스타일이 없는 순수 마운트 지점을 `display:flex; flex-direction:column` 조상 아래 두면, 자식(`height:100%`)이 부모의 auto 높이를 기준으로 계산돼 0이 된다 — 콘솔 에러도, 타입 에러도 없이 캔버스만 완전히 빈 화면으로 보이는 조용한 실패였다. Playwright로 DOM 카운트(`react-flow__node` 개수 > 0)만 확인했다면 놓쳤을 것이고, 스크린샷을 직접 봐서 잡았다 — **캔버스류 UI는 카운트 검증과 별개로 반드시 스크린샷을 눈으로 봐야 한다**는 교훈을 남긴다. `#board-root`/`.board`/`.canvas` 체인 전체에 `flex:1; min-height:0`을 명시해 고쳤다.
- **tag 기반 필터링으로 바뀌면서 "진짜 익명 컴포넌트"의 기본 표시가 달라졌다.** exp2는 익명 Provider/Consumer wrapper와 진짜 이름 없는 함수 컴포넌트를 둘 다 "(anonymous)"로 뭉뚱그려 필터링(기본값)했다. tag 기반으로 바꾸면서 전자는 데이터 레이어에서 아예 노드가 되지 않고, 후자는 계속 노드로 남아 흐리게 표시된다 — 즉 라이브 MVP는 exp2보다 **더 많은 정보를 기본으로 보여준다.** 검증 fixture에는 진짜 익명 컴포넌트 사례가 없어 화면으로 직접 확인하진 못했지만, 코드 경로상 의도대로 분기됨은 타입 체크와 로직 리뷰로 확인했다.
- **semantic zoom 임계값(0.55)이 소규모 트리에서도 즉시 지도 모드를 유발한다.** exp2는 257개 노드 대규모 데이터에서 17% 줌으로 지도 모드를 확인했는데, 라이브 MVP의 초기 fixture(3개 그룹, 35개 노드 안팎)조차 `fitView` 직후 49% 줌으로 떨어져 지도 모드가 바로 켜졌다. 틀린 동작은 아니지만(그룹이 몇 개 안 돼도 화면 폭 대비 여백이 크면 fitView가 줌아웃한다), 소규모 데이터에서는 사용자가 아무것도 안 했는데 바로 "영역만 보이는" 화면을 보게 된다는 뜻이라 UX상 체감이 exp2 때와 다르다 — 임계값 튜닝은 되돌리기 쉬운 디테일이므로 이번엔 그대로 두고 기록만 남긴다.

## 결과

- **기술 가능성 + UI 철학 + 그룹핑 힌트를 실제 라이브 데이터로 통합 검증했다.** 상호작용(리스트 항목 추가/삭제, 도메인 패널 마운트/언마운트, 카운터 클릭)이 실제 재렌더를 유발했고, 캔버스가 크래시나 끊김 없이 갱신됐으며, semantic zoom과 host 노드 토글도 라이브 데이터에서 그대로 동작함을 Playwright 스크린샷으로 확인했다(`scripts/verify.mjs`, `verify-output/`는 gitignore 처리해 저장소에는 안 남긴다).
- 레이아웃 재계산 전략("순서 고정 + 그룹 단위 메모이제이션")은 완전한 좌표 안정성을 보장하지 않는다는 한계를 의도적으로 남겼다 — 정식 재구현 단계에서 더 정교한 증분 레이아웃(예: 그룹 내부까지 diff 기반)이나 전용 레이아웃 라이브러리(dagre/elkjs) 도입을 재검토할 가치가 있다.
- `scripts/verify.mjs`는 판단 지점 이후에도 재사용 가능한 회귀 검증 스크립트로 저장소에 남겨둔다 (`npm run dev` 후 `npm run verify`).
- roadmap.md의 "라이브 MVP" 항목을 완료로 표시하고, "판단 지점"에 대한 평가를 roadmap.md에 남긴다.
