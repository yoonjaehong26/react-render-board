# 간선 직교 배선(orthogonal/Manhattan edge routing) 도입 가능성 조사

조사일: 2026-07-18
성격: **순수 조사 — 코드 변경 없음.** 결론(도입 여부·시점)은 원 채팅에서 논의 후 확정한다.

## 이 조사가 다루는 것 / 안 다루는 것

사용자 참고 다이어그램(Excalidraw 회로도풍 — 여러 간선이 같은 x/y축 채널로 모였다
갈라지는 "버스" 정렬)을 지금 보드에 어디까지 재현할 수 있는지, 그 구현 난이도가 얼마인지를
평가한다. 다음 전제를 **뒤집지 않는다**:

- **노드 위치는 이미 결정론적 tidy-tree로 고정돼 있다**(`src/visualization/lib/layout.ts`).
  force-directed 물리 레이아웃은 "매 커밋 re-heat" 때문에
  [`2026-07-17-generic-dataviz-tool-precedents.md`](2026-07-17-generic-dataviz-tool-precedents.md)에서
  이미 기각됐다. **이 조사는 노드 위치를 다시 계산하는 게 아니라, 고정된 노드 사이의 "간선
  경로"만 직교로 빼는 별개 레이어**에 대한 것이다.
- **현재 간선은 React Flow 기본 `smoothstep`**이다(`src/visualization/lib/toFlow.ts:115-128`).
  두 핸들(source=Bottom / target=Top) 사이를 L/Z자로 그릴 뿐 **충돌 회피가 없다** — 중간에
  낀 노드를 그냥 관통한다.
- **동시에 배선할 간선 수는 이미 화면 한 장 분량으로 제한돼 있다**(ADR-0017). 지도 모드
  (zoom-far)는 그룹을 전부 접어 **간선을 아예 만들지 않고**, 상세 모드는 뷰포트 안에서
  펼쳐진 그룹의 간선만 만든다(`Canvas.tsx:168-197`, `toFlow.ts:115-116`). 이 제약이 성능
  분석의 출발점이다 — 배선기가 상대할 간선은 수천 개가 아니라 수십~수백 개다.

### 현재 코드가 배선기에 부과하는 실제 제약(조사 중 확인)

- **노드는 핸들이 딱 한 쌍**이다 — target=Top, source=Bottom(`ComponentNode.tsx:22-24`).
  위→아래 tidy-tree라 부모→자식은 Bottom→Top으로 자연스럽지만, 임의 방향(좌/우 진입)으로
  붙이려면 핸들을 늘리거나 배선기가 shape 경계에 자유 부착(libavoid의 `ShapeConnectionPin`)
  하도록 해야 한다.
- **노드 위치는 `transition: transform 200ms`로 애니메이션된다**(`flow.css:211`). 배선기는
  "안정된 최종 좌표" 기준으로 경로를 내야 하고, 애니메이션 200ms 동안은 간선이 장애물을
  완벽히 피하지 못한다 — 단, `smoothstep`도 이미 같은 상황이라 새 제약은 아니다.
- **간선은 매 커밋 `toFlow`가 통째로 다시 만든다**(메모이제이션은 노드 내부 배치에만 있고
  간선 배열은 아니다). 즉 배선을 얹으면 "매 커밋 재배선"이 기본 동작이 된다 — 3절
  (라이브 안정성)이 이 조사의 핵심 위험인 이유다.

---

## 1. 후보 라이브러리/기법 비교

각 후보를 세 축으로 본다: **(a)** 노드 위치를 그대로 두고 간선만 배선하는가, **(b)** 번들/
의존성 무게, **(c)** 라이브 재배선 비용·결정론.

### 후보 A — libavoid (Adaptagrams) via WASM

**정체성이 정확히 일치한다.** libavoid는 레이아웃 엔진이 아니라 **커넥터 배선기**다 —
"interactive diagram editor를 위한 빠른 객체 회피 직교/폴리라인 커넥터 배선"([Adaptagrams
docs](https://www.adaptagrams.org/documentation/libavoid.html)). 고정 좌표의 사각형을
장애물로 주면 직교 폴리라인을 돌려주고, **노드를 옮기지 않는다**(위치 결정은 별도 libcola의
몫). Inkscape·Dunnart(인터랙티브 편집기)의 배선 엔진이다.

- **(a) 고정 노드 배선**: ✅ 설계 그 자체. API는 `Router`(다이어그램당 1개) / `ShapeRef`
  (고정 장애물) / `ConnRef`(커넥터, `ConnEnd`나 `ShapeConnectionPin`으로 끝점 지정) /
  `processTransaction()`(큐에 쌓인 변경을 커밋해 경로 계산). 경로 타입 `ConnType_Orthogonal`.
  (출처: [`router.h`](https://raw.githubusercontent.com/mjwybrow/adaptagrams/master/cola/libavoid/router.h))
- **(b) 무게**: WASM 포트 `libavoid-js`(GitHub **Aksem**, [npm](https://www.npmjs.com/package/libavoid-js)):
  `libavoid.wasm` **≈485KB(uncompressed)** + JS glue ≈76KB → 런타임 추가 **≈560KB
  uncompressed(추정 gzip ~220–270KB, 자체 빌드로 실측 필요)**. **런타임 의존성 0개.**
  `.wasm`은 별도 fetch 자산이라 lazy/worker 로드 가능. 주간 다운로드 ~9k. **라이선스
  LGPL-2.1-or-later**(v0.4.0부터 MIT→LGPL 전환 — 재배포 시 유의, ADR-0023 패키지 배포 준비와
  직결). 최신은 베타(`0.5.0-beta.5`, 2026-02), 마지막 안정 `0.4.5`(2025-04).
- **(c) 라이브·결정론**: **증분 배선이 1급 설계 목표**다(Dunnart용으로 만들어짐). 트랜잭션에
  변경을 모아 `processTransaction()`으로 한 번에 처리하고, `moveShape`/`deleteShape` 시
  "새 도형과 교차하거나 더 짧은 경로가 가능한 커넥터만 재배선 대상으로 표시" — **영향받은
  커넥터만 다시 그린다.** 결정론은 **문서에 명시 없음(불확실)**: 전체 재배선은 같은 입력→
  같은 출력이 기대되나, **증분 결과는 batch 재배선과 다를 수 있다**(일부 세그먼트가
  트랜잭션 간 고정될 수 있음, `fixedSharedPathPenalty`). 증분 경로의 안정성은 **채택 전 실측
  필요**.

**React Flow 드롭인 존재**: `avoid-nodes-edge@0.3.2`(2026-06 발행) — "libavoid-js WASM을
web worker에서 돌려 간선이 노드를 회피"하는 **@xyflow v12 전용 커스텀 엣지**. peerDeps에
`libavoid-js@0.4.5` + `zustand`. 진짜 직교 + nudging + 간격/라운딩 설정 + off-main-thread.
[데모](https://avoid-nodes-pro-example.vercel.app/). 유료 상위 버전(`avoid-nodes` Pro)도 있음.
직접 `libavoid-js`를 커스텀 엣지에 물리는 것보다 스파이크가 빠르다.

### 후보 B — ELK.js의 ORTHOGONAL edgeRouting

**결론부터: 이 용도로는 막다른 길이다. ELK 자신의 답이 결국 libavoid다.**

- `org.eclipse.elk.edgeRouting` 값은 `POLYLINE`/`ORTHOGONAL`/`SPLINES`/`UNDEFINED`. 진짜
  직교 배선은 **ELK Layered**와 **Libavoid** 알고리즘이 구현한다.
- **(a) 고정 노드 배선 — 스톡 elkjs로는 안 된다**:
  - `org.eclipse.elk.fixed`("Fixed Layout")는 **배선을 안 한다** — 위치와 이미 준 bend point를
    그대로 통과시키는 pass-through일 뿐([docs](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-fixed.html)).
  - `layered` + interactive/`semiInteractive`는 기존 위치를 **순서 힌트로만** 쓰고 여전히 전체
    배치 파이프라인을 돌려 **노드를 자기 격자로 옮긴다**. 우리 커스텀 좌표를 정확히 보존
    못 함 → 부적합.
  - ELK가 "노드를 안 옮기고 간선만" 하려고 만든 알고리즘이 바로 **Libavoid**인데, 이건
    네이티브 C++이라 **GWT로 transpile된 `elkjs` blob에 없다.** JS에서 쓰려면 별도 WASM 포트
    `@mr_mint/elkjs-libavoid`(내부적으로 `libavoid-js`)가 필요하다 — 즉 **후보 A로 수렴**한다.
    (elkjs 이슈 [#197](https://github.com/kieler/elkjs/issues/197), elk 이슈
    [#355](https://github.com/eclipse-elk/elk/issues/355)가 정확히 이 요구를 오래 제기해왔고,
    ELK가 Libavoid를 만든 게 그 답이다.)
- **(b) 무게**: `elkjs` **≈430–460KB gzipped**(대부분 GWT blob, 실측). 의존성 0. Web Worker
  권장.
- **(c) 라이브·결정론**: Layered는 **전체 Sugiyama 파이프라인을 매번 처음부터** 돈다 —
  **증분 모드 없음.** 결정론은 기대되나(무작위 시드 없음) 단일 인용으로 확증은 못 함.

**→ 스톡 elkjs는 후보에서 제외.** "ELK의 ORTHOGONAL"을 원하면 실체는 libavoid이고, 그건
후보 A로 이미 커버된다.

### 후보 C — React Flow용 grid+A* smart-edge 플러그인

`@tisoap/react-flow-smart-edge` — **2026-07-17 부활 발행 `4.13.1`**(과거 "3년째 방치"라는
평판은 낡음). @xyflow v12 명시 지원(peerDeps `@xyflow/react >=12`). grid 기반 A*/jump-point로
노드를 **돌아서** 배선. 4.x는 런타임 의존성 0(과거 `pathfinding` dep를 vendoring). 유지보수
포크 `@jalez/react-flow-smart-edge@4.0.0`(2025-06)는 아직 `pathfinding@0.4.18`(2016년 이후
미유지) 의존.

- **(a)**: ✅ 노드는 안 건드림 — 고정 위치를 장애물로 읽어 경로만 낸다.
- **(b)**: pure JS(WASM 없음). tisoap 4.x unpacked ~860KB(타입/소스맵 포함, 실제 gzip 브라우저
  비용은 훨씬 작음 — 미실측). jalez 포크 ~200KB unpacked + `pathfinding`.
- **(c)**: **엣지마다 그래프 bounding box를 래스터화해 A*를 돈다.** `gridRatio`(기본 10px)로
  정확도↔속도 트레이드오프. 노드 이동/리렌더마다 재계산. **버스 정렬(nudging) 없음** — 각
  간선이 독립적으로 최단 회피 경로를 찾을 뿐, 평행 간선을 한 채널로 정렬하지 않는다.
  벤치마크 수치 미공개(정성 평가).

### 후보 D — 그리드 A* 자체 구현(커스텀 엣지)

React Flow 커스텀 엣지는 `sourceX/Y`·`targetX/Y`·`source/target` id를 받아 **임의의 SVG path
`d` 문자열**을 돌려줄 수 있다. 다른 노드 사각형은 `useStore`/`getNodesBounds`로 읽는다. 공식
문서가 "React Flow는 배선을 대신 안 한다"고 못박음([custom-edges](https://reactflow.dev/learn/customization/custom-edges)) —
즉 grid A* 결과든 뭐든 넣으면 된다. **완전한 통제권은 있으나 후보 C가 이미 하는 일을
다시 짜는 것**이고, 안정성·버스 정렬까지 직접 소유하게 된다.

**React Flow 코어는 이 기능을 안 준다** — 직교 배선 요청 이슈
[#4766](https://github.com/xyflow/xyflow/issues/4766)는 "not planned"로 닫혔고, 메인테이너가
"아마 영원히 안 넣는다"고 명시([#2806](https://github.com/xyflow/xyflow/discussions/2806)).
커스텀 엣지/서드파티의 몫이라는 게 공식 입장.

### 후보 비교표

| 후보 | 고정 노드 배선 | 충돌 회피 | 버스 정렬 | 증분/라이브 | 무게 | 라이선스 |
|---|---|---|---|---|---|---|
| **A. libavoid (libavoid-js / avoid-nodes-edge)** | ✅ 설계 그 자체 | ✅ | ✅ (nudging) | ✅ 증분 1급(단 결정론 실측 필요) | WASM ~560KB(~gzip 220–270KB) + zustand | LGPL-2.1 |
| **B. 스톡 elkjs ORTHOGONAL** | ❌ (노드 옮김/미배선) | (레이아웃째) | Layered 부분 | ❌ 전체 재계산 | ~440KB gzip | EPL |
| **C. tisoap/jalez smart-edge** | ✅ | ✅ | ❌ | 매 렌더 재계산(worker 옵션) | pure JS | MIT/ISC |
| **D. 자체 grid A*** | ✅ | ✅(직접) | ❌(직접 짜야) | 직접 설계 | 0(직접) | — |

---

## 2. "버스 정렬" 실현성 — 충돌 회피 80% vs 버스 정렬 100%

**두 목표는 난이도 tier가 다르다. 반드시 분리해서 판단해야 한다.**

### Tier 1 — 충돌 회피(간선이 노드를 관통하지 않게): 성숙·해결됨

다항 알고리즘, 인터랙티브 속도, 오픈소스 구현 존재(libavoid). 후보 A/C/D 모두 여기까지는
준다. 사용자가 느끼는 "지금 smoothstep이 노드를 뚫는다"의 80%는 여기서 사라진다.

### Tier 2 — 버스 정렬(평행 간선을 한 채널로 정렬): 부분 해결, libavoid만 공짜로 줌

사용자가 실제로 보여준 회로도풍 정렬의 정확한 이름은 **직교 커넥터 nudging + shared-path
(공유 세그먼트) 정렬**이다. 정전(定典)은 Wybrow·Marriott·Stuckey, *"Orthogonal Connector
Routing"*(GD 2009). 3단계 파이프라인: ① 직교 가시성 그래프 → ② 최단 경로(길이+굽힘 최소)
→ ③ **centering + nudging**(공유 세그먼트를 채널 가운데로 모으고 고정 간격으로 벌려 평행
트랙으로 정렬, 교차는 세그먼트 양 끝으로 밀어냄).

- **libavoid가 이 nudging을 구현한다.** 관련 파라미터(`router.h` 실측):
  `idealNudgingDistance`(버스 간격, 기본 4), `nudgeSharedPathsWithCommonEndPoint`(기본 true),
  `nudgeOrthogonalSegmentsConnectedToShapes`, `segmentPenalty`(직교 nudging에 필수),
  `performUnifyingNudgingPreprocessingStep`. Adaptagrams 문서는 공유 경로 정렬 알고리즘이
  **"metro-line 교차 최소화와 관련돼 있다"**고 명시한다. 우리 tidy-tree의 "부모→여러 자식"
  버스는 사실상 **하이퍼엣지**이고, libavoid엔 *"Orthogonal Hyperedge Routing"*(Diagrams 2012)
  전용 기능까지 있다.
- **edge bundling은 틀린 도구다.** Hierarchical(Holten 2006)/force-directed(Holten & van Wijk
  2009) 번들링은 밀집 many-to-many 그래프의 혼잡을 **곡선으로 뭉쳐** 줄이는 기법 — Manhattan
  직교 세그먼트가 아니고, 노드 회피도 채널 구조도 없으며, "어느 간선이 어디로 가는지"
  모호해진다. 희소한 부모→자식 트리에는 부적합하다.
- **자체 구현 시**: 충돌 회피 배선기 위에 **LEA(left-edge algorithm)식 그리디 트랙 배정**
  (구간 그래프 색칠)을 얹으면 "한 채널 안에서 N개 평행 간선을 어느 트랙에 겹침 없이 놓나"를
  싸게 푼다 — libavoid의 ordering 단계가 하는 일이다. 전역 최적 metro-map급 팔각선(octilinear)
  버스는 **MIP/시뮬레이티드 어닐링 = 오프라인·느림**(Nöllenburg & Wolff, TVCG 2011)이라 매
  커밋 돌릴 수 없다 — *목표(팔각성·직선성·굽힘 최소)와 근사(팔각 격자 최단경로)만 차용*하고
  솔버는 차용하지 않는다.

**정리**: 충돌 회피(80% 가치)는 라이브러리로 즉시. 버스 정렬(사용자가 실제 원한 그림,
100% 가치)은 **libavoid를 쓰면 딸려 오지만**, 자체 구현하면 "배선기 + 트랙 배정 + 안정성"의
별도 프로젝트가 된다.

---

## 3. 라이브 갱신과의 궁합 — 이 조사의 진짜 위험

노드 위치 안정성을 위해 이 프로젝트가 ADR-0008(그룹 순서 고정 + 메모이제이션)에서 이미
크게 고민했다. **같은 고민이 간선 경로에도 필요한가? — 필요하다. 그리고 노드 때보다
덜 성숙한 영역이다.**

- **간선 경로 안정성 문헌은 얇다.** 노드 위치 안정성(mental map preservation)은 방대하지만,
  "동적 그래프 변경 시 **직교 간선 경로의 요동을 최소화**"를 1급 목표로 삼은 알고리즘은
  못 찾았다(표준 검색어로 조사, 부재 신뢰도 중상). 실무 편집기는 논문이 아니라 **엔지니어링
  관례**로 푼다.
- **관례 = "영향받은 간선만 재배선 + 나머지는 동결 + 트랙 배정 sticky 유지".** 공개 문서가
  가장 잘 된 예는 **yFiles**: `OrthogonalEdgeRouter`는 "노드 위치는 고정된 채로 남는다"며
  Scope(전체 / 선택된 것만 / 선택 노드에 연결된 것만)를 노출한다. `EdgeRouter`·
  `ChannelEdgeRouter`도 같은 "Affected Edges" 개념. 즉 변경에 안 닿은 간선은 경로를
  **그대로** 두고, 바뀐 노드에 연결된 것만 다시 그린다.
- **libavoid의 증분 트랜잭션이 이 관례에 그대로 대응**한다(영향받은 커넥터만 재배선,
  `avoid-nodes-edge`엔 드래그용 `createRoutingSession`). PCB channel routing의 **left-edge식
  트랙 배정**, metro-map의 **라인 순서 고정**도 같은 원리 — "트랙 배정을 상태로 보고, 강제될
  때만 재배정"하면 매 커밋 간선이 트랙을 바꿔 튀는 걸 막는다.

### 이 프로젝트 고유의 함정

현재 아키텍처는 **매 커밋 간선을 처음부터 다시 만든다.** nudging은 연결 성분 안에서 **전역**
연산이라, **무관한 곳에 노드 하나가 마운트돼도 그 화면의 버스 순서가 통째로 재배열**될 수
있다 → 시각적 점프. 이건 ADR-0008이 노드에 대해 푼 문제의 **간선 판(版)**이고, 라이브러리가
기본으로 주지 않는다(libavoid 증분조차 batch와 결과가 다를 수 있음 — 1절 (c)). 고빈도 커밋
(ADR-0013, 10~30Hz)까지 겹치면 매 커밋 재배선 비용도 문제다.

→ **완화 설계가 반드시 동반돼야 한다**: (i) 커밋 디바운스(기존 뷰포트/refit 디바운스와 동일
계열), (ii) 배선을 web worker로(off-main-thread), (iii) 뷰포트 밖·미변경 그룹의 간선 경로
캐시(sticky), (iv) 트랙 배정 sticky. 이 넷은 "간선 배선을 얹는다"의 실제 작업량의 대부분이며,
"라이브러리 설치"로는 안 끝난다.

---

## 4. 구현 난이도 3단계 배치 + MVP 권고

### 난이도 배치

| 단계 | 무엇 | 얻는 것 | 위험 |
|---|---|---|---|
| **작음** | `avoid-nodes-edge`(또는 tisoap smart-edge) 드롭인, 기본 동작 그대로 | Tier 1 충돌 회피 ~80% | 라이브 안정성 미검증 — 무관한 커밋에 버스/경로가 튈 수 있음. LGPL(avoid-nodes 경로) |
| **중간** | libavoid(`libavoid-js`)를 커스텀 엣지+worker로 직접 연결 + 커밋 디바운스 + 영향-간선 스코프 + 트랙/경로 sticky 캐시 | Tier 1 + Tier 2 버스 정렬(사용자가 실제 원한 그림) + 라이브 안정성 | 3절 안정성 작업이 실제 작업량의 대부분. 결정론 실측 필요 |
| **큼** | metro-map급 전역 최적 팔각 버스 / 완전 안정성 보장 자체 채널 배선기 | 최상위 심미성 | MIP/어닐링 = 오프라인. 매 커밋 불가. **비권장** |

### MVP 권고: **지금 넣지 말고, 별도 라운드의 후보로 미룬다.**

근거(이 프로젝트의 "과한 투자 경계" 원칙에 정면으로 부합):

1. **막힌 증거가 없다.** 현 `smoothstep`은 동작하고, 회로도풍 버스는 사용자의 심미적
   지향이지 결함 리포트가 아니다. CLAUDE.md의 "실제로 막힌 증거 없이 곁가지에 먼저 투자하지
   않는다" 원칙에 걸린다. 선행 프로젝트들이 죽은 게 바로 이런 종류의 곁가지였다.
2. **사용자가 실제 원한 것(버스 정렬)은 "작음"이 아니라 "중간"이다.** 드롭인(작음)은 충돌
   회피만 주고 버스 정렬을 안 준다 — 참고 다이어그램의 핵심을 못 재현한다. 값어치 있는
   버전은 3절 안정성 작업을 동반한 "중간"이고, 그건 남은 UX 백로그(캔버스 주석/코드 접근/
   그룹 접기)와 경합하는 규모다.
3. **간선 안정성은 ADR-0008의 간선 판이며, 라이브러리가 안 풀어준다.** 노드 안정성에 이미
   한 라운드를 쓴 이 프로젝트가, 검증 없이 "매 커밋 전역 재배선"을 켜면 애써 얻은 "안정적인
   지도" 정체성을 간선 쪽에서 되돌릴 위험이 있다.

### 만약 진행한다면 — 경로와 게이트

- **엔진은 libavoid로 간다. elkjs도, 자체 A*도 먼저 가지 않는다.** elkjs는 이 용도에서
  결국 libavoid로 수렴하고(1절 B), 자체 A*(후보 D)는 smart-edge가 이미 하는 일 + 버스/안정성을
  전부 자가 소유하는 것이다. 버스 정렬을 공짜로 주는 건 libavoid뿐이다.
- **시간 제한 스파이크로 게이트를 건다**(구현 확정 전): `avoid-nodes-edge`를 데모 앱에 붙여
  **(a) 라이브 안정성** — livefeed/stress fixture로 커밋을 흘리면서 "무관한 노드 마운트 시
  화면의 버스가 재배열되는가"를 눈으로 확인, **(b) worker 재배선 비용** — 60Hz fixture에서
  커밋당 배선 지연, **(c) 실측 gzip 번들**을 잰다. 이 세 수치가 나온 뒤에 "중간" 투자 여부를
  원 채팅에서 확정한다.
- 스파이크에서 확인할 세부: 핸들 한 쌍(Top/Bottom) 제약이 직교 품질을 얼마나 깎는지,
  200ms transform 애니메이션과 배선 갱신의 시각적 궁합, LGPL-2.1(라이브러리 배포 준비 ADR-0023
  와의 관계).

---

## 5. (후속 분석, 같은 날) 사용자 규칙 기반 자동화 — 4절 권고를 수정함

원 채팅 논의에서 사용자가 참고 다이어그램(피그마 수작업)을 그릴 때 스스로 따른 규칙 4개를
명시했다. 이를 형식화해 "알려진 알고리즘에 대응되는가 + 자동화 가능한가"를 분석한 결과,
**4절의 결론이 바뀐다** — 범용 엔진(libavoid) 전제에서 나온 난이도 평가였는데, 규칙을
형식화해보니 이 프로젝트의 레이아웃 불변식 위에서는 **규칙 기반 특화 배선기**가 더 작고
더 정확한 경로다.

### 사용자가 명시한 규칙 → 알고리즘 대응

| # | 사용자 규칙 | 학계 대응 개념 | 자동화 |
|---|---|---|---|
| 1 | 간선은 최대한 겹치지 않는다 | crossing minimization + nudging(채널 내 등간격) | ✅ 해결됨(libavoid nudging / left-edge 트랙 배정) |
| 2 | 특이점(갈라짐·모임·꺾임)의 x,y축을 최대한 통일 | channel/track alignment, segment unification | ✅ **우리 레이아웃에선 공짜** — tidy-tree가 같은 깊이를 같은 y행에 놓으므로 "부모 행↔자식 행 사이 띠"가 곧 자연 채널. 채널 좌표가 레이아웃 상수에서 유도됨 |
| 3 | 여러 간선이 모일 때는 목표 노드 직전에 모인다 | hyperedge junction placement | ✅ **우리 데이터에선 더 쉬움** — 렌더 트리는 진짜 트리라 fan-in이 구조적으로 없고 fan-out만 존재. 거울상("타겟 행 직전에서 갈라짐")은 탐색 없이 결정론적 산수: 부모 바닥 수직 하강 → 자식 행 위 오프셋에 수평 바 → 각 자식 위 수직 낙하 |
| 4 | 가깝고 연관 있으면 직선, 멀면 돌아간다 | 배선 정책(간선도로/외곽순환 개념) — 알고리즘이 아니라 policy 레이어 | ✅ 임계값 휴리스틱으로 형식화: "연관성"=같은 그룹(이미 있는 정보), 그룹 내→직결 버스, 그룹 간→여백 우회 |

### 참고 다이어그램에서 추가로 추출한 암묵 규칙

5. **남의 그룹 프레임을 관통하지 않는다** — 그룹 박스는 장애물, 그룹 간 간선은
   여백(거터)으로만 다닌다(규칙 4의 기하학적 실체). 우리 row-packing은 거터 폭이 알려진
   상수(`GROUP_H_GAP`/`V_GAP`=80)라, 거터 중심선들로 **소형 "복도 그래프"**를 만들어 그
   위에서만 A*를 돌리면 픽셀 그리드 래스터화(smart-edge류)보다 수십 배 작은 탐색 공간이 된다.
6. **포트 규율** — 정방향은 위 진입/아래 이탈, 역방향(피드백) 간선은 바깥 고리로 돌아 옆/아래
   진입. (현재 핸들 Top/Bottom 한 쌍과 정방향은 일치; 역방향 스타일은 추가 핸들 필요)
7. **선 정체성** — 색·점선 스타일로 버스 안에서도 한 선을 추적 가능(지하철 노선도 원리).
   cross-group 주황 점선 + 도메인 팔레트(ADR-0027)로 절반은 이미 있음.
8. **버스 내 순서 보존** — 채널 진입 순서 = 이탈 순서로 버스 내부 교차 없음(= metro-line
   crossing minimization, libavoid 문서가 언급한 그것).
9. **굽힘 수 최소화 + 등간격** — 간선당 꺾임 2~4회, 채널 내 간격 일정, 라운드 코너.

### 왜 결론이 바뀌는가 — 규칙 기반 특화 배선기의 구조적 이점

4절의 "자체 구현 = 큼" 평가는 **범용** 장애물 회피(임의 배치)를 전제했다. 그러나:

1. **레이아웃 불변식이 강하다.** 노드 배치가 우리 자신의 결정론적 tidy-tree라 행 y좌표·자식
   정렬·거터 폭이 전부 알려져 있다 — 범용 회피 탐색이 필요한 구간은 그룹 간 간선뿐이고,
   그마저 소형 복도 그래프로 축소된다.
2. **라이브 안정성이 공짜다(가장 중요).** 규칙 기반 경로는 노드 좌표의 **순수 함수**라 간선
   안정성 = 노드 안정성으로 환원되고, 노드 안정성은 ADR-0008(그룹별 메모이제이션)이 이미
   풀었다. 그룹 내부 배치가 안 바뀌면 그 그룹의 버스는 바이트 단위로 동일 — 3절에서 경고한
   "무관한 커밋에 전역 nudging이 버스를 재배열"하는 libavoid의 함정이 **구조적으로 사라진다**.
   3절의 완화 설계 (i)~(iv) 중 (iii)(iv)가 불필요해지고, 비용도 전역 솔버가 아닌 O(간선 수)
   산수 + 소형 그래프 탐색이라 (i)(ii)의 필요성도 크게 준다.
3. **규칙 3·4는 libavoid가 모르는 의미론이다.** libavoid는 범용 엔진이라 "목표 직전 합류"나
   "원거리 우회 정책"을 지시할 수 없다 — 규칙 기반 구현이 참고 다이어그램을 오히려 더
   비슷하게 재현한다. WASM 485KB·LGPL 문제도 없다.

### 수정된 난이도 배치

| 단계 | 무엇 | 비고 |
|---|---|---|
| **작음~중간** | 그룹 내 버스 엣지(간선의 대다수): 부모별 결정론적 버스 산수 + 커스텀 엣지 1종 + left-edge 트랙 배정 | 규칙 1·2·3·8·9 커버. 안정성·결정론은 레이아웃에서 상속 |
| **중간** | 그룹 간 거터 배선: 거터 복도 그래프 + A* + 정책(규칙 4·5·6) | 그룹 프레임 변화 시에만 재계산(그룹 단위 메모이제이션과 동일 키) |
| (폴백) | libavoid(`avoid-nodes-edge` 스파이크) | 규칙 기반이 예상 밖 품질 문제를 보이면 그때 1절 A로 |

**수정된 권고**: "MVP에 지금 넣지 않는다"(막힌 증거 없음)는 유지하되, 진행 시의 제1후보는
libavoid가 아니라 **규칙 기반 특화 배선기**다. libavoid는 스파이크 폴백으로 강등.

---

## 6. (후속 논의) "노드 위치를 간선에 맞춰 움직이면 더 낫지 않나?" — 왜 지금은 아닌가

원 채팅에서 나온 질문: 노드 위치 불가침을 풀고 간선에 따라 노드를 움직이면 극적인 간선
최적화가 가능하지 않은가?

**이론적으로 맞다.** 교차 최소화의 정석이 노드 이동이다 — Sugiyama 파이프라인(ELK layered)의
crossing minimization이 "같은 층 안 노드 재배열로 교차 최소화"이고, 레이아웃 엔진이
배선기보다 예쁜 결과를 내는 이유다. 그러나 이 프로젝트에선 세 가지 사실이 실익을 지운다:

1. **그래프가 트리라 그룹 안은 이미 최적이다.** 모든 간선이 부모→자식(`parentId`)이고
   포털도 논리 부모 아래(ADR-0010) — 트리를 tidy-tree로 그리면 **간선 교차가 구조적으로
   0**(평면 그래프)이다. 그룹 내부는 노드를 어떻게 움직여도 교차 0보다 나아질 수 없다.
2. **어지러움의 원인은 그룹 간 간선뿐이고, 그건 노드 배치가 아니라 "트리를 그룹으로 잘라
   row-packing한" 파티셔닝의 부작용**이다. 따라서 노드 이동의 실익은 그룹 배치 수준에만
   있고, 안정성을 안 깨는 절충이 존재한다: **새 그룹이 처음 등장할 때만 맨 끝 append 대신
   부모 그룹 근처 슬롯에 삽입, 이후 동결**(ADR-0008 순서 고정 유지). 최초 배치만 간선을
   보므로 멘탈맵이 유지된다 — [`2026-07-17-generic-dataviz-tool-precedents.md`](2026-07-17-generic-dataviz-tool-precedents.md)가
   "빌려올 기법"으로 이미 기록한 placement utility 원리와 동일.
3. **지속적 재배치는 force-directed 기각 사유가 그대로 돌아온다.** 성능이 아니라 "안정적인
   지도" 정체성 문제(같은 문서, Purchase & Samra "중간이 최악").

**단, 재검토 트리거가 있다**: 데이터 스코프가 렌더 트리를 넘어 store 구독·context 의존 같은
**many-to-many 간선**으로 확장되면(사용자 참고 다이어그램의 `stores → 컴포넌트` 간선이 바로
그것) 그래프가 트리가 아니게 되고 교차가 구조적으로 불가피해져, 제한적 노드 재배열(crossing
minimization)이 진짜 가치를 갖는다. 즉 "노드 위치 불가침"은 영원한 원칙이 아니라 **"데이터가
트리인 동안의 원칙"**이다.

---

## 7. (후속 논의) 간선 밀도(클러터) 최적화 — 배선과는 별개 축

원 채팅에서 나온 문제 제기: 이 다이어그램의 최대 단점은 수백 노드 규모에서 간선이
"의미 없는(거의 안 보이게 뺴곡한)" 매트가 되는 것이었다. 최적화 가능한가?

**가능하다. 단, 배선(경로 모양)과는 다른 축의 문제라 처방도 다르다.** 진단은 두 겹:

- **① 획 수 과다** — fan-out N이면 독립 곡선 N개. 수백 노드 그룹이면 수백 획.
- **② 잉크가 정보 가치와 반비례** — tidy-tree에서 그룹 내 부모→자식 간선은 정보가 이미
  위치에 함축돼 있다(자식은 부모 바로 아래 행, 중심 정렬 — React DevTools는 들여쓰기만으로
  트리를 보여주고 간선을 아예 안 그린다). 반면 그룹 간 간선은 위치로 예측 불가능해 정보
  가치가 높다. 현재는 이 둘을 같은 무게로 그린다(Tufte data-ink 관점에서 배분이 역전).

### 처방(전부 결정론적·자동화 가능)

| 처방 | 내용 | 난이도 |
|---|---|---|
| **a. 시각적 감쇠** | 그룹 내 간선 hairline+저투명도, 깊이 깊을수록 옅게, 그룹 간만 현행 유지 | 거의 공짜(CSS) |
| **b. 간선 semantic zoom(LOD)** | 현행 이진(zoom-far 전부 숨김 ↔ 전부 표시, `flow.css .zoom-far`)을 단계형으로: 중간 줌은 구조 간선만(그룹 횡단+깊이 1~2), 줌인할수록 깊은 간선 페이드인. 지도 은유("멀리선 고속도로만")의 간선 확장. `toFlow`가 아는 depth로 클래스 분기 | 작음~중간 |
| **c. on-demand 혈통 점등** | 기본은 그룹 내 간선 옅게/생략, hover/선택 시 그 노드의 조상 체인+직계 자손 간선만 선명하게. NetGrok의 인터랙티브 하이라이트 방식([`2026-07-17-generic-dataviz-tool-precedents.md`](2026-07-17-generic-dataviz-tool-precedents.md) 2절), 검색 dimming(ADR-0027)과 동일 철학·메커니즘 재사용 | 중간 |
| **d. 버스 배선(5절)** | fan-out N: 곡선 N개 → 트렁크1+바1+스텁N으로 **획 병합** — 참고 다이어그램이 깔끔한 이유의 절반은 경로가 아니라 이것 | 배선 라운드에 흡수 |
| **e. (급진안) 그룹 내 간선 완전 생략** | React DevTools 방식. 단 tidy-tree는 들여쓰기와 달리 부모 모호성이 있어 c/d가 더 안전 | — |

**권고 순서**: a → b 먼저(배선기 없이 클러터 대부분 해소, 저비용) → c는 다음 라운드 →
d는 배선 라운드에 포함. 원칙 한 줄: **잉크를 정보 가치에 비례시킨다** — 그룹 내(위치가
이미 말해줌)는 죽이고, 그룹 간(위치가 못 말해줌)만 살린다.

이 절의 a·b는 4절의 "지금 넣지 말라" 권고와 별개다 — 배선기가 아니라 표현(스타일/LOD)
레이어라, 막힌 증거(뺴곡함은 실제 관찰된 단점) 대비 비용이 작아 **먼저 독립 라운드로 얹을
가치가 있다.**

---

## 관련 문서

- 노드 위치 안정성의 원(原) 고민(간선에도 필요한 이유): ADR-0008
  ([`0008-live-mvp-integration.md`](../decisions/0008-live-mvp-integration.md))
- force-directed 기각·라이브 안정성 선례(mental map, Kiali 변경 감지 게이트, 트랙 sticky의
  근친): [`2026-07-17-generic-dataviz-tool-precedents.md`](2026-07-17-generic-dataviz-tool-precedents.md)
- 뷰포트 기반 부분 재계산(배선 대상이 한 화면으로 제한되는 근거): ADR-0017
  ([`0017-viewport-based-partial-recompute.md`](../decisions/0017-viewport-based-partial-recompute.md))
- 고빈도 커밋 한계(매 커밋 재배선 비용의 근거): ADR-0013
  ([`0013-high-frequency-render-stress-test.md`](../decisions/0013-high-frequency-render-stress-test.md))
- 현재 간선 생성 코드: `src/visualization/lib/toFlow.ts:115-128`

## 출처(주요)

**libavoid / Adaptagrams**
- Adaptagrams libavoid 개요(커넥터 배선기 정체성·nudging·metro-line 관련성): https://www.adaptagrams.org/documentation/libavoid.html
- `router.h`(API·RoutingParameter·RoutingOption 실측): https://raw.githubusercontent.com/mjwybrow/adaptagrams/master/cola/libavoid/router.h
- `libavoid-js`(WASM 포트, Aksem): https://www.npmjs.com/package/libavoid-js · https://github.com/Aksem/libavoid-js
- `avoid-nodes-edge`(@xyflow v12 드롭인, libavoid-js+worker): https://www.npmjs.com/package/avoid-nodes-edge · 데모 https://avoid-nodes-pro-example.vercel.app/
- Wybrow·Marriott·Stuckey, "Orthogonal Connector Routing"(GD 2009): https://link.springer.com/chapter/10.1007/978-3-642-11805-0_22
- 동, "Orthogonal Hyperedge Routing"(Diagrams 2012): https://users.monash.edu/~mwybrow/papers/wybrow-diagrams-2012.pdf
- 동, "Incremental Connector Routing"(GD 2005, 증분 배선 원전): LNCS 3843

**ELK.js**
- edgeRouting 옵션: https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html
- Fixed Layout(배선 안 함, pass-through): https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-fixed.html
- ELK Libavoid 알고리즘("노드 안 옮기고 간선만"): https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-alg-libavoid.html · 발표: https://eclipse.dev/elk/blog/posts/2022/22-11-17-libavoid.html
- `@mr_mint/elkjs-libavoid`(ELK JSON용 libavoid 배선): https://github.com/MrMint/elkjs-libavoid
- elkjs #197 / elk #355(고정 위치 간선 배선 요구): https://github.com/kieler/elkjs/issues/197 · https://github.com/eclipse-elk/elk/issues/355
- React Flow ELK 예제(전체 레이아웃용, edges-only 아님): https://reactflow.dev/examples/layout/elkjs

**React Flow 엣지**
- `@tisoap/react-flow-smart-edge`(2026-07 부활, v12): https://github.com/tisoap/react-flow-smart-edge
- `@jalez/react-flow-smart-edge`(포크, pathfinding 의존): https://github.com/Jalez/react-flow-smart-edge
- 커스텀 엣지 = 임의 SVG path(코어는 배선 안 함): https://reactflow.dev/learn/customization/custom-edges
- 직교 배선 요청 "not planned": https://github.com/xyflow/xyflow/issues/4766 · 메인테이너 입장: https://github.com/xyflow/xyflow/discussions/2806

**버스 정렬 / 안정성 알고리즘**
- Holten, "Hierarchical Edge Bundles"(2006, 번들링이 왜 틀린 도구인가): https://www.data-to-viz.com/graph/edge_bundling.html
- Nöllenburg & Wolff, "High-Quality Metro Maps by MIP"(TVCG 2011, 팔각 버스는 오프라인): https://i11www.iti.kit.edu/en/projects/geovis/metro
- yFiles OrthogonalEdgeRouter(노드 고정 + Scope=affected-edges 관례): http://docs.yworks.com/yfiles/doc/developers-guide/orthogonal_edge_router.html
- VLSI channel routing / left-edge algorithm(트랙 배정): https://www.sciencedirect.com/topics/computer-science/routing-channel
- Dwyer & Nachmanson, "Fast Edge-Routing for Large Graphs"(MSR): https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/routing.pdf
