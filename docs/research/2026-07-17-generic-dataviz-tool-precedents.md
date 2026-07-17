# React 생태계 밖 범용 데이터 시각화 도구 조사 — 그룹핑·공간분할·라이브 안정성·force-directed 선례

조사일: 2026-07-17
목적: React 생태계 안(Nx, dependency-cruiser 등)과 정형 아키텍처 표기법(DFD, C4)은 이미 조사가 끝났다([`2026-07-17-diagram-notation-conventions.md`](2026-07-17-diagram-notation-conventions.md)). 이번엔 그 바깥 — 범용 그래프/데이터 시각화 도구(Gephi, Cytoscape.js, D3, webpack-bundle-analyzer, Kiali, Grafana, Datadog/Dynatrace) — 에서 지금 이 프로젝트가 확인한 문제들(P1 초선형 비용, P2 지도 모드 붕괴, P3 카메라 정체, 파일 경로 기반 그룹핑)에 참고할 만한 선례가 있는지 조사한다. **코드 변경 없음 — 순수 조사.**

방법론: 4개의 독립된 리서치 스레드를 병렬 실행했다 — ① Gephi 커뮤니티 탐지 + Cytoscape.js compound node/Nx Project Graph, ② D3 treemap/icicle/partition + webpack-bundle-analyzer + 실시간 트리맵 선례, ③ Kiali/Grafana/Datadog/Dynatrace의 라이브 토폴로지 갱신 안정성 + mental map preservation 학술 문헌, ④ D3-force + ForceAtlas2. 공식 문서·논문 원문·GitHub 이슈/소스코드를 직접 fetch해 교차 검증했다.

## 전제 (이미 확인된 것, 재조사하지 않음)

- [ADR-0017](../decisions/0017-viewport-based-partial-recompute.md): 노드 수가 늘수록 레이아웃 재계산 비용이 초선형(P1) — 뷰포트 기반 부분 재계산으로 완화.
- [ADR-0018](../decisions/0018-map-mode-lod-and-camera-refit.md): 그룹 100개+/노드 1,500~2,000개부터 지도 모드가 붕괴(P2, LOD로 해소), 라우트 전환 시 카메라가 안 따라가고 `groupOrder`가 안 정리되는 카메라 정체(P3, 그룹 생존율 30% 미만일 때만 refit 트리거하는 디바운스 휴리스틱으로 해소).
- [`2026-07-17-diagram-notation-conventions.md`](2026-07-17-diagram-notation-conventions.md): "실시간 데이터 + 정형 표기법" 결합 선례가 없고, 진짜 라이브인 도구는 전부 표기법을 버리고 범용 노드-엣지 맵으로 수렴한다는 게 확인됨.
- 현재 그룹핑 방식: `getSource` 기반 소스 파일 경로로 수동 그룹핑(알고리즘적 클러스터링 아님).
- 현재 레이아웃: tidy-tree + row-packing(정적 전체/부분 재계산, 물리 시뮬레이션 아님).

## 조사 대상과 핵심 발견

### 1. 대규모 그래프의 그룹핑/클러스터링 — Gephi, Cytoscape.js

**Gephi의 Louvain method (modularity 기반 클러스터링)**
**Modularity**는 제안된 그룹("커뮤니티") 내부의 엣지 밀도와 그룹 간 엣지 밀도를 비교하는 [-1, 1] 범위 스칼라다. Louvain은 이를 근사 최대화하는 그리디 휴리스틱으로, 2단계를 반복한다 — ① **local move**: 모든 노드를 각각 독립 커뮤니티로 시작해, 이웃 커뮤니티로 옮겼을 때 modularity 증가가 가장 큰 이동을 계속 커밋(더 나은 이동이 없을 때까지), ② **aggregation**: 발견된 각 커뮤니티를 하나의 super-node로 합치고(엣지 가중치는 합산), 축소된 그래프에서 ①을 다시 실행. 두 단계를 modularity가 더 안 늘 때까지 반복한다. 대략 O(n log n)이라 수백~수백만 노드급에서 표준적으로 쓰인다. Gephi는 **Resolution** 파라미터 하나로 커뮤니티 크기를 조절한다(낮으면 더 많고 작은 그룹, 높으면 더 적고 큰 그룹). 결과는 노드별 "Modularity Class" 속성으로 기록돼 색칠/필터링에 쓰인다.

- **이 프로젝트에 대한 적용 평가 — 대안으로 부적합**:
  - **배치(batch) 알고리즘이라는 근본적 불일치.** Louvain은 그래프가 고정돼 있다고 가정하고 전체 노드/엣지 집합에 대해 전역 반복 최적화를 돌린 뒤에야 답을 낸다. "증분(incremental) Louvain"은 존재하지 않는다 — 매 React 커밋마다 노드/엣지가 나타나고 사라지는 이 프로젝트에서는 매번 전체를 재실행해야 한다는 뜻이다.
  - **재실행 간 비결정성.** local-move 단계에 무작위 tie-breaking이 있어(Gephi에 별도 "Randomize" 옵션이 있는 이유), 거의 동일한 그래프를 연속으로 돌려도 커뮤니티 경계나 ID가 달라질 수 있다. 라이브 다이어그램에서는 매 리렌더마다 그룹 박스가 눈에 띄게 재배열/재명명될 수 있다는 뜻 — 안정적인 멘탈맵이라는 그룹 박스의 존재 이유와 정면으로 충돌한다.
  - **의미 있는 라벨이 없다.** Modularity 클러스터링은 "이 노드들이 밀집 연결됐다"는 것만 알려줄 뿐 "이게 checkout 모듈이다"는 모른다. 결국 클러스터 라벨을 붙이려면 파일 경로 같은 별도 휴리스틱이 또 필요하다 — 즉 파일 경로 신호를 대체하는 게 아니라 그 아래단으로 미루는 것뿐이다.
  - **React 렌더 엣지는 파일/모듈 경계를 자주 넘나든다**(`layout/`의 `<Layout>`이 `pages/`의 `<Dashboard>`를 감싸는 식). 구조/토폴로지 기반 클러스터링은 우연히 인접해 렌더되는 무관한 도메인을 한 박스로 묶을 위험이 있다.
  - 유일하게 가치 있을 법한 활용은 **일회성 저작 보조 도구**(고정된 스냅샷에 대해 "이렇게 그룹 지어보면 어때?"를 한 번 제안, Gephi 자체의 실제 워크플로우와 동일)이지, 라이브/자동 메커니즘은 아니다.
- **공식 문서의 명시적 임계값**: 부분적으로 있음, 그러나 클러스터링이 아니라 렌더러 스케일에 대한 것. 공식 FAQ는 "네트워크 분석에 익숙하거나 10,000노드 이상을 분석해야 한다면 Gephi Desktop을 설치하라"(Gephi Lite 대비)는 **제품 선택** 규칙만 제시한다. 2008년 공식 블로그 글은 "현재 최대 5만 노드까지 시각화 가능, 향후 GPU 작업으로 20만 노드까지 가능할 수도"라고 밝히지만 이건 18년 전 OpenGL 렌더러 얘기지 Louvain 알고리즘 얘기가 아니다. "N개 이상부터는 클러스터링으로 전환하라"는 규칙은 공식 문서 어디에도 없다.
- **난이도**: 채택 시 **큰 작업**(전혀 다른 알고리즘 클래스 통합 + 비결정성/안정성 문제를 별도로 새로 풀어야 함) 대비 실익이 낮음 — **비권장**.

**Cytoscape.js compound node (그룹 접기/펼치기)**
- Compound node(부모-자식 그룹핑) 자체는 **core 기능**이다: 노드 `data.parent` 필드로 선언하며, `parent`는 보통 불변(변경하려면 `eles.move({ parent: newId })`)이고, 부모 노드는 독립된 위치/크기가 없이 자식들의 bounding box로 자동 추론된다. 순회 API로 `node.parent()`/`parents()`/`children()`/`descendants()`/`siblings()` 등을 제공.
- **접기/펼치기는 core가 아니다** — 별도 확장(`cytoscape.js-expand-collapse`)이 필요하다. 이 확장은 API(`collapse`/`collapseAll`/`expand`/`expandAll` 등)는 있지만 README에 스스로 "더 이상 유지보수 안 함"이라 적혀 있고, 같은 팀(iVis-at-Bilkent)의 후속 통합 확장 `cytoscape.js-complexity-management`로 대체되는 중이다.
- **Nx Project Graph(Cytoscape.js 기반)의 실제 대응** — 이번 조사에서 가장 직접적으로 유용한 발견: Nx 20에 도입된 **"Composite Graph"**가 "디렉토리 기준으로 프로젝트 그룹을 하나의 노드로 접고, 더블클릭하면 펼쳐서 안을 본다"는 기능을 기본값으로 제공한다. Nx 공식 블로그(2025-10): *"그래프는 기본적으로 composite 모드로 렌더된다. 이건 두 가지 핵심 이점을 준다 — 더 깔끔해 보이고, 대규모 워크스페이스 시각화 시 크래시를 막는다. 수천 개 프로젝트가 있는 워크스페이스에서는 composite 모드가 그래프를 다시 쓸 수 있게 만든다!"* 공식 문서도 "전체 그래프를 보는 건 소규모 저장소에서도 감당 안 될 수 있다"며 폴더 그룹핑을 "적당한 규모의 그래프를 탐색하는 데 필수적"이라고 서술한다.
- **명시적 숫자 임계값**: Gephi와 마찬가지로 **없다**. "수천 개 프로젝트", "적당한 규모" 같은 정성적 표현만 있을 뿐 "N개 넘으면 X를 하라"는 구체적 규칙은 Nx도 Cytoscape.js 자체 공식 성능 문서(`documentation/md/performance.md`)도 제시하지 않는다. Cytoscape.js 성능 문서는 "요소가 많아지면 성능이 저하될 수 있다"는 정성적 서술과 `pixelRatio: 1`, `hideEdgesOnViewport`, `textureOnViewport`, compound node 최소화, `cy.batch()` 같은 최적화 목록만 준다.
- **이 프로젝트에 대한 적용 평가 — 중요한 확인**: Nx가 **같은 렌더링 라이브러리(Cytoscape.js) 위에서** 독립적으로 "디렉토리/경로 기준 그룹핑 + 접기/펼치기"에 수렴했다는 사실은, 이 프로젝트가 이미 쓰고 있는 전략(파일 경로 기반 수동 그룹핑 + 지도/상세 semantic zoom)이 업계 수렴점과 일치한다는 근거가 된다. 반대로 "그룹 접기/펼치기" 자체는 `project-status.md`에 여전히 미구현으로 남아 있는 기능인데, Cytoscape.js의 확장 API를 그대로 가져올 순 없다(이 프로젝트는 React Flow 기반) — React Flow의 `parentId`/`extent`/노드 `hidden` 조합으로 별도 구현해야 한다.
- **난이도**: 그룹 접기/펼치기 자체(React Flow로 직접 구현)는 **중간**(Cytoscape.js 확장이 하는 일 — 자식 숨김 + 부모 크기 재계산 + 엣지 재연결 — 을 참고해 새로 짜야 함). Louvain류 자동 클러스터링 도입은 **큰 작업**이며 위에서 본 이유로 비권장.

### 2. 공간 채우기(space-filling) 대안 — Treemap/Icicle/Sunburst

**D3 알고리즘**
- **treemap**: `root.sum()`으로 계산한 값을 기준으로 사각 영역을 재귀 분할한다. 실제 기하는 교체 가능한 tiling 함수가 결정한다 — 기본값 **`treemapSquarify`**(Bruls, Huizing, van Wijk 2000)는 목표 종횡비(기본 황금비 φ≈1.618)에 가까워지도록 행을 그리디하게 채운다. `treemapSliceDice`는 깊이에 따라 수평/수직을 그냥 교대(비율 최적화 없음, 결정론적). `treemapBinary`는 균형 이진 트리 형태로 분할. **`treemapResquarify`**는 "이전 레이아웃과 같은 목표 비율을 썼다면 노드 인접성(토폴로지)을 보존한다 — 위치는 그대로 두고 크기만 바꿔서, 애니메이션할 때 산만한 셔플링/가림을 피할 수 있다"고 공식 문서가 명시한다. 대신 첫 레이아웃만 완전한 squarify를 쓰고 이후는 종횡비 최적성을 일부 포기한다.
- **partition**(icicle·sunburst 공용): depth를 한 축, 누적 value를 다른 축에 매핑한다. icicle은 이 직교좌표를 그대로 사각형으로 그리고, sunburst는 같은 좌표를 극좌표로 재해석한다(depth→`innerRadius`/`outerRadius`, value→`startAngle`/`endAngle`). treemap이 모든 중첩 단계에서 값을 면적에 복합적으로 반영하는 것과 달리, partition류는 깊이(위치)와 값(크기)을 분리해서 계층 깊이를 더 읽기 쉽게 만든다.

**webpack-bundle-analyzer의 실제 시각 규칙**
- **크기** = Stat size(변환 전 원본)/Parsed size(minify 후)/Gzip/Brotli 중 선택(`defaultSizes` 설정으로 기본값 지정).
- **색상**은 크기나 파일 타입과 무관하다. 실제 소스(`groupColorDecorator`, FoamTree 렌더러 사용)를 보면 **최상위 청크/에셋 이름을 해시한 고정 hue**다 — 청크 하나당 안정적인 고유 색이 배정될 뿐, 크기·gzip 비율·확장자와는 관계없다. 검색 시에만 매치=빨강/비매치=탈채도로 동적으로 바뀐다.

**핵심 질문 — 실시간 갱신 데이터에 적용한 선례**
`diagram-notation-conventions.md`에서 확인된 패턴("실시간+정형 표기법 결합 선례 없음")이 여기서도 그대로 반복된다.
- 이 불안정성 문제는 학계에서 이미 정확히 지목됐다. Bederson, Shneiderman, Wattenberg의 *"Ordered and Quantum Treemaps"*(ACM ToG 2002, IEEE VIS Test-of-Time상 수상)는 *"데이터셋 변경이 클러스터 트리맵과 squarified 트리맵 모두에서 레이아웃에 극적이고 불연속적인 변화를 일으킬 수 있다... 트리맵 데이터가 초 단위로 갱신되면(예: 주식 포트폴리오 모니터) 잦은 레이아웃 변경 때문에 개별 항목을 추적하거나 선택하기 어려워진다. 급격한 레이아웃 변화는 보기 싫은 깜빡임도 유발한다"*고 명시한다. 이들의 해법은 애니메이션이 아니라 **순서 보존(order-preserving) 알고리즘**이다 — **pivot treemap**(가장 큰 항목을 pivot으로 삼아 나머지를 인덱스 순서를 보존한 채 3개 하위 리스트로 분할)과 **strip treemap**(입력 순서대로 스트립에 채우다가 평균 종횡비가 나빠질 때만 새 스트립 시작). 둘 다 "정사각형에 가까운 비율"을 희생하고 데이터 순서상 인접한 항목이 갱신 후에도 공간적으로 인접하게 유지되도록 만든다. D3의 `treemapResquarify`가 바로 이 계보의 직계 후손이다.
- 실제 진짜 라이브 사례: **NetGrok**(2008, 메릴랜드대, 네트워크 트래픽 라이브 모니터 — force-directed 그래프 뷰 + squarified 트리맵 뷰를 결합)은 그래프 뷰는 IP를 해시해 고정 극좌표를 줘서 "같은 외부 호스트는 항상 같은 위치"를 보장했지만, **논문이 스스로 "트리맵 뷰는 그래프 뷰와 달리 호스트를 일관되게 같은 위치에 놓지 못한다"**고 인정한다 — 라이브 트리맵 전용 도구조차 위치 안정성을 못 풀고 그래프 뷰만 해결한 1차 사례다. 상용 제품인 **Panopticon Explorer**(CPU/메모리 실시간 트리맵, 최근엔 Siemens/Altair 산하)는 "트리맵은 정적인 그림이 아니다"라고 마케팅하지만 어떤 안정화 기법을 쓰는지는 공개 문서 어디에도 없다.
- 정직한 결론: 진짜 지속 갱신되는(클릭해서 다시 그리는 게 아닌) 트리맵 선례는 존재하지만 얇고, 학술 쪽은 문제를 정확히 지목하고 부분 완화(순서 보존, 정사각형 비율 희생)를 제안할 뿐 "해결됐다"고 주장한 곳은 없다. 상용 쪽은 "실시간"을 마케팅하지만 기법을 공개하지 않는다.

**한계 — 포함관계는 잘 보여주지만 임의의 관계(엣지)는 어렵다**
이 한계는 명시적으로, 반복적으로 논의된다.
- **VMap**(Xu & Shen, IEEE TVCG 2023)이 정확히 이 문제를 다루려고 만들어진 논문이다: *"계층 기반 그래프 시각화의 한계는 (1) 입력 그래프가 의미 있는 계층 정보를 가지고 있어야 하고, (2) 정점 배치가 제한된 연결성 정보만 사용해 강하게 연결된 정점들이 멀리 떨어져 배치될 수 있다는 것이다."* 이 두 번째 지적이 정확히 이 프로젝트의 우려("컴포넌트가 서로 렌더하는 관계"라는 강한 연결이 있는데, 트리맵 배치는 포함관계만 반영)와 일치한다.
- **Fekete, Wang, Dang, Plaisant, "Overlaying Graph Links on Treemaps"**(IEEE InfoVis 2003)는 트리맵 위에 곡선 엣지를 별도로 오버레이하는 기법을 제안했다 — 이런 논문이 별도 기여로 존재한다는 사실 자체가 "트리맵은 기본적으로 비-포함 관계 엣지를 못 그린다"는 방증이다.
- **NetGrok**도 명시적으로 "기본 트리맵은 노드 간 링크를 보여주지 않는다"고 적고, 정적 엣지 오버레이 대신 인터랙티브 하이라이트(호버 시 무관한 노드를 흑백 처리)로 우회했다.
- Nielsen Norman Group의 실무자용 비평도 "데이터가 계층적이지 않다면 트리맵을 쓰지 말라"와 "시간에 따라 특정 항목을 추적하는 게 매우 어려워진다"는 점을 지적한다.

**이 프로젝트에 대한 적용 평가**: 트리맵을 도입하면 (a) 위에서 확인한 실시간 안정성 문제(학술적으로 부분 완화만 된 영역)와 (b) "누가 누구를 렌더하는가"라는 비-포함 관계 표현 문제를 **둘 다 새로 풀어야** 한다 — 즉 지금 씨름 중인 문제(P1~P3)를 트리맵 버전으로 재현하면서 엣지 표현이라는 새 과제까지 얹는 셈이다. 지도 모드(영역만 표시)가 이미 "포함관계 조망"이라는 트리맵의 핵심 효용을 별도 레이아웃 엔진 없이 얻고 있다는 점도 감안하면, 전면 교체보다는 "인덱스 순서 보존"(resquarify 계열의 아이디어) 정도만 참고할 가치가 있다.
**난이도**: 전면 도입은 **큰 작업**(레이아웃 엔진 교체 + 안정화 알고리즘 자체 연구/구현 + 엣지 오버레이 별도 설계) 대비 실익 불확실 — **비권장**. `treemapResquarify`의 "인접성 보존" 아이디어만 향후 참고자료로 기록해둘 가치는 있음.

### 3. 라이브 토폴로지가 안 흔들리게 갱신되는 법 — Kiali, Grafana, Datadog/Dynatrace

**Kiali (우선 조사) — 중요한 negative finding**
- Kiali는 원래 **Cytoscape.js**로 그래프를 그렸지만, Kiali 2.0부터 네이티브 **PatternFly Topology**(`@patternfly/react-topology`)로 전환하고 4개월 유예 기간 후 Cytoscape 구현을 완전히 제거했다. 이유는 "PatternFly가 아닌 큰 컴포넌트가 어색하게 박혀 있었다"는 통합 문제 + 네이티브 룩앤필/다크모드. 레이아웃 엔진은 Dagre/Cola/ColaNoForce/ColaGroups/Force/3D-force 중 선택 가능한 pluggable 구조다.
- **포지션이 새로고침 간 보존되는가?** Cytoscape 시절엔 **기본적으로 매 새로고침마다 전체 재레이아웃**이었고, 이게 정확히 이 프로젝트의 P3(카메라 정체)와 같은 계열의 버그를 실제로 여러 건 낳았다:
  - **kiali#3158**: "줌인해서 보고 있는데 10초마다 그래프가 새로고침되면 줌아웃돼버린다." 사용자 제안: "현재 좌표/줌 레벨을 저장하고 그 자리에 그냥 머물러라."
  - **kiali#2514**: "그래프가 이리저리 움직이고 화면 밖으로 나간다." 유지보수자 답변: "이미 새로고침 시 할 수 있는 건 다 하고 있다"며 자동 리사이즈-투-핏 끄는 토글 요청을 거절. 우회책으로 제시된 것: 시간 윈도우를 넓혀서 토폴로지 변동을 줄여라, Hide 표현식을 피하라(숨기기를 쓰면 레이아웃이 거의 매 새로고침마다 모양/크기가 바뀐다). "Compress on Hide"라는 부분적 완화 옵션만 존재.
  - **kiali#3684**: "Cytoscape는 새 그래프 객체가 들어오면 요소가 완전히 동일해도 무조건 초기 레이아웃을 처음부터 다시 수행한다"는 구조적 사실 확인.
  - **kiali#4666**: hide 표현식과 그래프 요소가 실제로 안 바뀌었으면 레이아웃 자체를 건너뛰는 **변경 감지 게이트**를 추가 — "아무것도 안 바뀌었는데 미묘하게 다르게 재배치되는" 성가신 동작을 막기 위함.
- 드래그로 수동 배치는 가능하지만, "그래프가 일시정지 상태일 때 가장 잘 작동하고, 새로고침되면 위치가 바뀔 수 있다"고 스스로 인정한다 — 즉 수동 고정도 자동 새로고침을 완전히 이기지 못한다.
- 완화책(v2 기준): 기본 새로고침 60초, 여러 변경을 모아 한 번에 반영하는 Manual refresh 모드, v2.21의 그래프 캐싱(세션별 캐시 + 백그라운드 재계산), 스코프 축소/비싼 엣지 라벨 비활성화 권장.
- **핵심 negative finding**: 이 문제와 가장 가까운 실전 사례(Kiali)조차 "포지션을 보존하는 점진적 레이아웃"을 완성하지 못했고, 새로고침 빈도 제어 + 변경 감지 게이트 + 수동 일시정지라는 우회책으로 버티고 있다.

**Grafana Node Graph**
- 레이아웃 3종 — **Layered**(dagre 스타일, 기본값, ~500노드까지 권장), **Force**(d3-force, 500+ 권장), **Grid**(엣지 없음). 새로고침 시 "선택된 알고리즘"은 유지되지만 그 자체가 포지션 안정성을 보장하진 않는다.
- **재사용 가능한 구체적 기법**: 데이터 모델에 **`fixedX`/`fixedY` 필드**가 있어 "새로고침 전반에 걸쳐 일관된 시각화를 위해 노드 좌표를 고정할 수 있다"고 명시한다.
- 기본 최대 200개 노드까지만 표시하고 넘으면 경고 + 일부 숨김(펼쳐볼 수 있음) — 포지션이 아니라 그래프 크기 자체를 제한하는 전략.
- Grafana 엔지니어들 스스로(이슈 #68540) 자기네 d3-force 레이아웃이 "너무 무작위로 보인다"고 인정하고 GraphViz DOT을 대안으로 프로토타이핑했지만 노드가 많아지면 느려서, **"노드 수가 임계값 이하면 레이어드 레이아웃, 넘으면 force로 폴백"하는 하이브리드 전략**을 제안했다 — 그래프 크기에 따라 알고리즘 자체를 조건부로 바꾸는 기법.

**Datadog / Dynatrace**
- **Datadog Service Map**: 호출 수 기반 클러스터링 + force-directed. 클러스터 안팎에 걸친 의존성이 있는 서비스는 클러스터 경계 쪽으로 이동시켜 병목을 시각적으로 드러낸다. "실시간" 갱신을 내세우지만 안정화 기법은 공개 문서에 없다.
- **Dynatrace Smartscape**: Force/Horizontal/Vertical 3가지 레이아웃 전환 가능. "우선순위 기반 점진적 노드 로딩"(가장 중요한 엔티티부터 로드)이라는 흥미로운 기법은 언급되지만 안정화 알고리즘 자체는 공개되지 않았다.
- 두 상용 벤더 모두 마케팅/문서 수준 정보만 있고 Kiali(오픈소스라 GitHub 이슈로 실제 설계 논쟁이 드러남)만큼 구체적인 엔지니어링 근거는 찾지 못했다.

**핵심 질문 — 학술/실무 용어: "mental map preservation" / "dynamic graph layout stability"**
- 원조 용어와 논문: **Eades, Lai, Misue, Sugiyama, "Preserving the mental map of a diagram"**(Compugraphics 1991)가 mental map preservation을 **orthogonal ordering(위상적 순서)**과 **proximity(근접성)** 보존으로 정식화했다 — 정확한 좌표가 바뀌어도 "위에 있던 게 계속 위에 있고", "가까웠던 게 계속 가깝게" 유지되면 된다는 원칙. 최근 문헌은 같은 성질을 "drawing stability"라고도 부른다.
- 핵심 원칙: "그래프에 변화가 생겼을 때 기존 노드/엣지의 배치는 최대한 적게 바뀌어야 한다."
- **Foresighted Layout**(Diehl & Görg, Eurographics/VisSym 2001): 시간에 따른 그래프 시퀀스 전체를 하나의 compound 그래프로 합쳐 미리 안정적인 base 레이아웃을 계산해두고, 각 시점의 레이아웃은 이 base에서 파생시키는 기법. 미래 상태를 미리 알아야 하는 오프라인 기법이라 완전한 라이브에는 제약이 있지만, "superset/union 그래프에 대해 레이아웃을 계산해 슬롯을 고정해둔다"는 아이디어 자체는 응용 가능하다(예: 알려진 라우트/컴포넌트 타입에 대해 마운트 전에도 슬롯 위치를 미리 예약해두는 식).
- **Incremental force-directed layout with previous-position seeding**(온라인 동적 그래프용 incremental multilevel force layout 계열 문헌): 새 요소를 기존 위치를 크게 안 바꾸는 적절한 위치에 배치하고, 변경의 영향 반경을 국소 이웃으로 제한하며, 이전 레이아웃 결과를 다음 시뮬레이션의 시작점(seed)으로 삼아 무작위/기본 초기화 대신 원래 있던 자리 근처에서 수렴하게 만드는 기법.
- **Cytoscape.js 생태계의 실전 지식**(GitHub Discussion #3278)이 특히 유용하다: "incremental layout"은 있지만 **"새 노드는 초기 위치가 없어서 결과가 나쁘다"**는 게 알려진 실패 모드로 명시돼 있다 — 새 노드만 레이아웃하면 마치 완전히 새 그래프인 것처럼 배치돼 기존 노드 위에 겹쳐지고, **뷰포트가 새 노드 기준으로만 fit돼버린다**. 이게 사실상 "카메라 정체"류 증상의 원인을 정확히 짚은 설명이다. 권장 해법은 incremental layout을 돌리기 전에 **새 노드를 기존 연결된 이웃 근처에 배치하는 placement utility**를 먼저 적용하는 것.
- **실증 연구**: Purchase & Samra, *"Extremes are better: Investigating mental map preservation in dynamic graphs"*(Diagrams 2008)는 사용자가 **매우 높은 안정성이거나 매우 낮은 안정성(완전 재배치)일 때 더 잘 이해**하고, 중간 정도의 부분적 보존일 때 오히려 더 못한다는 실험 결과를 냈다 — 즉 "살짝만 흔들리는" 어중간한 상태가 최악이라는 뜻. Archambault & Purchase, *"The 'Map' in the mental map"*(IJHCS 2013, 초록만 확인)도 mental map preservation이 실제 과제 수행 성능에 영향을 준다는 걸 별도로 확인했다.

**이 프로젝트에 대한 적용 평가 — P3에 직접 참고**: 이 프로젝트가 이미 구현한 "그룹 생존율 30% 미만일 때만 `fitView` 재트리거"(ADR-0018)는 **Kiali의 변경 감지 게이트**(#4666)와 정확히 같은 계열의 해법이고, **Grafana의 "노드 수 임계값에 따라 알고리즘 전환"**과도 같은 철학(상황 조건부 재계산)이다 — 즉 독립적으로 이미 알려진 업계 패턴에 수렴한 것으로 확인됐다. 또한 Purchase & Samra의 "극단이 낫다"는 실증 결과는, "생존율이 낮으면 통째로 refit / 아니면 전혀 안 건드림"이라는 지금의 이분법적 설계가 어중간한 절충안보다 사용자 이해에 더 낫다는 학술적 근거로 인용할 수 있다. 아직 안 쓰이고 있는, 참고할 만한 구체적 기법:
1. **Grafana의 `fixedX`/`fixedY` 방식 — 사용자가 특정 그룹/노드를 수동으로 위치 고정**하는 기능. 지금은 없지만 React Flow `node.position` + `draggable` 조합 위에 얹기 비교적 쉬움.
2. **새 그룹이 처음 등장할 때 기존 이웃 근처에 배치**하는 원칙 — 현재 tidy-tree는 부모/형제 기준으로 이미 배치되므로 개별 노드 레벨에서는 상대적으로 덜 심각하지만, 그룹(도메인 박스) 신규 등장 시 화면상 위치 배정 로직에 참고할 수 있다.
**난이도**: 수동 위치 고정 UI는 **간단~중간**(React Flow 위에 로컬 상태로 pin 플래그 추가). Kiali식 변경 감지 게이트·새 그룹 근접 배치는 이미 유사한 개념(ADR-0018)이 적용돼 있어 "완전히 새로운 작업"이 아니라 **세부 튜닝** 수준.

### 4. Force-directed 레이아웃 — D3-force, ForceAtlas2

**D3-force 메커니즘**
d3-force는 한 번에 최종 좌표를 계산하는 레이아웃 알고리즘이 아니라 **물리 시뮬레이션**이다. velocity Verlet 적분기(단위 시간 스텝·단위 질량)로 매 **tick**마다 ① `alpha`를 `alphaTarget`을 향해 감쇠시키고(기본 `alphaDecay`≈0.0228, 약 300틱 후 정지), ② 등록된 모든 force를 현재 alpha로 적용하고, ③ 속도 감쇠(마찰)를 적용한 뒤, ④ 속도로 위치를 적분한다. `alpha`는 담금질(simulated annealing)의 "온도"처럼 작동한다. `forceManyBody`(전하/반발력)는 **전역**이다 — "연결 안 된 서브그래프에 있어도 모든 노드가 서로 영향을 준다"고 공식 문서가 명시 — quadtree + Barnes-Hut 근사로 O(n log n)까지 가속되지만, 여전히 매 틱마다 전체 그래프를 다시 훑는다.

**새 노드 추가 시 실제 동작 — "자연스럽게 섞여든다"는 기본 동작이 아니다**
- `simulation.nodes()`를 다시 호출하면(노드 배열이 바뀔 때마다 필요) **모든 force가 재초기화**된다 — 새 노드 하나 추가가 전체 force 세트를 다시 계산시킨다는 뜻.
- d3-force 이슈 #78("Adding new nodes to the graph breaks the graph"): 매초 새 시뮬레이션을 만들며 노드를 추가한 사용자가 "몇 번 반복하면 그래프가 반응이 없어진다"고 실제로 보고했다.
- `react-force-graph` 메인테이너(vasturiano)의 공식 답변(이슈 #253): *"데이터 구조가 바뀔 때마다(노드 추가/삭제) 강제로 재가열(reheat)하는 건 의도된 설계다 — 시스템이 새로운 균형을 찾아서 추가/삭제된 노드에 맞춰야 하기 때문이다."* 유일한 우회책은 기존 노드를 `fx`/`fy`로 수동 고정하는 것 — "물리 시뮬레이션이 알아서 자연스럽게 처리한다"는 것과 정반대로, 수동 워크어라운드를 전제로 해야 안정성이 나온다. 같은 메인테이너가 이슈 #188에서도 동일하게 확인했고, `cooldownTicks={0}`으로 재가열을 끌 수는 있지만 그러면 신규 노드의 등장 애니메이션 자체가 사라지고, 그래도 노드가 대량 추가되면 재정렬되는 경우가 실제로 보고됐다.

**이 프로젝트에 대한 적용 평가**
- 이 프로젝트는 React 커밋마다(초당 여러 번일 수 있음) 구조가 바뀐다. 매 커밋이 force 재가열을 트리거한다면 시뮬레이션이 저-alpha(정지) 상태에 도달하지 못한 채 계속 전역 재계산을 도는 상태가 될 위험이 크다 — 이미 확인된 P1(초선형 비용) 문제를 완화하기는커녕 악화시킬 수 있다.
- 그래프 드로잉 학계 문헌(Kobourov, *Graph Drawing Handbook* Force-Directed 챕터)이 정확히 이 트레이드오프를 명시한다: *"동적 그래프 레이아웃에서 개별 레이아웃의 가독성과 레이아웃 시퀀스의 멘탈맵 보존은 종종 서로 모순된다."* 동적 그래프 전용 force 변형(Brandes & Wagner의 베이지안 적응, TGRIP, GraphAEL 등)은 순정 force-directed와는 다른 특수한 확장이며, 초기 동적 접근법들은 "대체로 수백 개 정점을 넘어가면 스케일이 안 된다"고 같은 챕터가 지적한다. 2021년 논문(Cheong, Si, Wong, *Information Sciences* 556)도 초록에서 *"표준 force-directed(FD) 알고리즘은 토폴로지가 고정된 정적 그래프를 시각화하도록 설계됐다... 토폴로지에 변화가 생기면 이 알고리즘들은 전체 계산을 처음부터 다시 시작해야 해서 스케일이 안 된다"*고 명시한다.
- 예측 불가능성도 문제다: 동일한 논리적 트리 상태라도 시뮬레이션 이력(이전 속도/위치/틱 횟수)에 따라 다른 시각적 배치로 수렴할 수 있다 — "안정적인 지도"라는 이 프로젝트의 목표와 상충한다. 반면 현재 tidy-tree 방식은 같은 트리 모양이면 이력과 무관하게 항상 같은 레이아웃을 재현한다는 결정론적 성질이 있고, 이건 오히려 "사용자가 공간 감각을 쌓는 지도"라는 목표에 더 부합한다.
- 결론: "새 노드가 자연스럽게 섞여든다"는 장점은 **기존 노드를 `fx`/`fy`로 수동 고정하는 워크어라운드를 전제로 할 때만 성립**하며 기본 동작이 아니다. 초당 여러 번 구조가 바뀌는 이 프로젝트 데이터 특성과, 이미 확보한 뷰포트 기반 부분 재계산(ADR-0017)의 결정론적 저비용 이점을 감안하면 force 시뮬레이션으로 전환할 근거가 약하다.

**ForceAtlas2(Gephi 기본 알고리즘)**
- 원 논문(Jacomy, Venturini, Heymann, Bastian, PLoS ONE 2014)이 스코프를 **"scale-free, 10~10,000 노드"**로 명시한다. Barnes-Hut 근사로 O(n²)→O(n log n). **Degree-dependent repulsion**(연결이 적은 노드를 허브 쪽으로 당겨 시각적 혼잡을 줄임), **적응형 local/global speed**("swinging" — 잘 연결된 노드는 낮은 속도/고정밀, 덜 연결된 노드는 고속으로 움직여 수렴을 가속), **LinLog 모드**(클러스터를 더 조밀하게 만들지만 논문 스스로 "일부 경우 수렴이 느리다"고 인정)가 핵심 특징이다.
- 논문 원문이 명시하는 스케일 한계: *"ForceAtlas2는 10만 노드보다 큰 네트워크에는 적합하지 않다, 몇 시간을 들이지 않는 한."* 실제 벤치마크도 5~23,133 노드 범위의 68개 네트워크에서만 검증됐다 — 이는 이 프로젝트가 이미 검증한 9,000+ 노드 규모와 비교해도 여유가 크지 않다.
- **동적 그래프 처리**: 논문은 "사용자가 실시간으로 수정 사항(순위 변경, 필터링, 새 엔티티 생성)을 반영하면 force를 재계산해 배치를 계속 갱신한다"고 언급하지만, 이건 Gephi Desktop에서 **사람이 수동으로 편집**하는 상황을 가리킨다. "동적 네트워크 시각화"도 고정된 데이터셋을 시간 창으로 필터링하는(dynamic filtering, 예: 트위터 대화를 시간순으로 재생) 방식이지, 매 틱 구조가 바뀌는 라이브 스트림을 수용하도록 설계/벤치마크된 게 아니다. 정량적 벤치마크는 전부 **정적** 고정 토폴로지에서만 수행됐다.

**이 프로젝트에 대한 적용 평가**: ForceAtlas2는 Gephi(정적 스냅샷 분석 도구)에서 대규모 정적 그래프를 빠르게 펼쳐 보여주는 데 최적화된 알고리즘이지, 매 렌더 커밋마다 구조가 바뀌는 라이브 트리를 위해 설계·검증된 게 아니다. 도입하면 D3-force와 같은 "매 커밋마다 재가열" 문제를 그대로 안게 되고, 여기에 "10만 노드 이상 부적합"이라는 상한까지 추가로 얹힌다.
**난이도**: D3-force·ForceAtlas2 둘 다 도입 시 **큰 작업**(레이아웃 엔진 전체 교체 + 재가열 억제를 위한 노드 고정 로직 별도 구현) 대비 실익이 없다 — **비권장**.

## 공통적으로 확인된 것 — 종합 판단

- **그룹핑**: Nx가 이 프로젝트와 같은 렌더링 라이브러리(Cytoscape.js) 위에서 독립적으로 "경로/폴더 기준 그룹핑 + 접기/펼치기"에 수렴했다는 사실은, 지금 쓰는 파일 경로 기반 수동 그룹핑 전략이 업계 수렴점과 일치한다는 확인이다. Louvain류 알고리즘 클러스터링은 배치 처리·비결정성 때문에 라이브 트리에 근본적으로 안 맞고, 두 도구(Gephi, Cytoscape.js) 공식 문서 어디에도 "N개 이상이면 이렇게 하라"는 명시적 숫자 규칙은 없었다.
- **공간 채우기(트리맵)**: `diagram-notation-conventions.md`에서 확인된 "실시간+정형 표기 조합 선례 없음" 패턴이 트리맵류에서도 반복된다. 학술 문헌은 문제(급격한 재배치, 항목 추적 어려움)를 정확히 지목하고 부분 완화 기법(순서 보존 알고리즘)을 제안하지만, "완전히 해결됐다"고 주장한 선례는 없다. 상용 실시간 트리맵(Panopticon)은 존재하지만 안정화 기법을 공개하지 않는다. 이 프로젝트가 이미 겪은 P1~P3와 사실상 같은 문제 클래스를, 엣지 표현이라는 새 과제까지 추가로 안고 재현하게 될 것이다.
- **라이브 토폴로지 안정성**: 가장 실전적인 신호. Kiali의 변경 감지 게이트·Grafana의 노드 수 조건부 알고리즘 전환·`fixedX`/`fixedY` 위치 고정은, 이 프로젝트가 ADR-0018에서 독립적으로 도달한 "생존율 임계값 기반 조건부 refit" 설계와 같은 계열이라는 걸 확인해준다. 즉 지금 방식은 임기응변이 아니라 업계가 실제로 쓰는 패턴과 일치한다. mental map preservation 문헌(특히 Purchase & Samra의 "극단이 낫다" 실증 결과)은 이 이분법적 설계(전체 refit vs 그대로 유지, 중간 없음)를 학술적으로 뒷받침한다. 아직 없는, 저비용으로 추가할 만한 기법은 사용자가 특정 그룹을 수동으로 고정(pin)하는 기능이다.
- **Force-directed**: D3-force·ForceAtlas2 둘 다 "그래프가 안정된 상태에서 가끔 편집된다"는 전제가 강해서, "매 렌더 커밋마다 구조가 바뀐다"는 이 프로젝트의 데이터 특성과 근본적으로 안 맞는다. "새 노드가 자연스럽게 섞여든다"는 직관적 장점은 실제로는 기존 노드를 수동으로 고정해야만 성립하는 워크어라운드 위의 효과였다. 현재의 결정론적 tidy-tree+row-packing 방식이 오히려 이 프로젝트의 "안정적인 지도" 목표에 구조적으로 더 부합한다는 게 재확인됐다.
- **총평(과잉 투자 경계 관점)**: 4개 영역 모두에서 "지금 방식을 통째로 갈아엎을 근거는 약하고, 대신 부분적으로 빌려올 만한 저비용 아이디어가 하나씩 있다"는 동일한 결론에 도달했다 — 그룹핑은 접기/펼치기(중간 작업), 라이브 안정성은 수동 위치 고정(간단~중간 작업). 트리맵 전면 도입과 force-directed 전환은 큰 작업 대비 실익이 불확실해 비권장.

## 관련 문서

- 뷰포트 기반 부분 재계산(P1): [`decisions/0017-viewport-based-partial-recompute.md`](../decisions/0017-viewport-based-partial-recompute.md)
- 지도 모드 LOD + 카메라 refit(P2·P3): [`decisions/0018-map-mode-lod-and-camera-refit.md`](../decisions/0018-map-mode-lod-and-camera-refit.md)
- 다이어그램 표기법 조사(정형 표기법 × 라이브 데이터 선례 없음, 동일 패턴 반복 확인): [`2026-07-17-diagram-notation-conventions.md`](2026-07-17-diagram-notation-conventions.md)
- 프로젝트 현황 스냅샷: [`../project-status.md`](../project-status.md)

## 출처

**Gephi & Cytoscape.js / Nx**
- Gephi 공식 legacy wiki, Modularity: https://raw.githubusercontent.com/gephi/gephi-wiki-legacy/main/src (docs.gephi.org가 아직 마이그레이션 안 된 구 페이지의 아카이브본)
- Gephi 공식 FAQ(10,000노드 기준 Desktop/Lite 선택 규칙): http://gephi.org/faq/
- Gephi 공식 블로그, "Performance and scalability"(2008, 렌더러 스케일 수치, 역사적 자료): https://gephi.wordpress.com/2008/10/25/performance-and-scalability/
- Blondel, Guillaume, Lambiotte, Lefebvre, "Fast unfolding of communities in large networks"(2008, Louvain 원 논문): https://arxiv.org/abs/0803.0476
- Cytoscape.js 공식 문서, Compound Nodes 표기법: https://js.cytoscape.org/#notation/compound-nodes
- Cytoscape.js 공식 성능 문서(임계값 없음, 정성적 가이드만): https://github.com/cytoscape/cytoscape.js/blob/master/documentation/md/performance.md
- cytoscape.js-expand-collapse(유지보수 중단됨): https://github.com/iVis-at-Bilkent/cytoscape.js-expand-collapse
- cytoscape.js-complexity-management(후속 통합 확장): https://github.com/iVis-at-Bilkent/cytoscape.js-complexity-management
- Nx 공식 블로그, Composite Graph 도입: https://nx.dev/blog/ci-affected-graph
- Nx 공식 블로그, "수천 개 프로젝트에서도 크래시 방지" 인용: https://nx.dev/blog/nx-highlights-oct-2025
- Nx 공식 문서, Explore the Graph: https://nx.dev/docs/features/explore-graph

**Treemap / Icicle / Sunburst**
- D3 공식 문서, treemap(squarify/binary/sliceDice/resquarify): https://d3js.org/d3-hierarchy/treemap
- D3 squarify 알고리즘 원 소스: https://github.com/d3/d3-hierarchy/blob/main/src/treemap/squarify.js
- D3 공식 문서, partition(icicle/sunburst 기반): https://d3js.org/d3-hierarchy/partition
- webpack-bundle-analyzer 공식 README(크기 정의): https://github.com/webpack-contrib/webpack-bundle-analyzer/blob/master/README.md
- webpack-bundle-analyzer 실제 색상 로직 소스(`groupColorDecorator`): https://github.com/webpack/webpack-bundle-analyzer/blob/main/client/components/Treemap.jsx
- Bederson, Shneiderman, Wattenberg, "Ordered and Quantum Treemaps"(2002, 실시간 갱신 불안정성 문제 + pivot/strip 알고리즘): https://www.cs.umd.edu/~bederson/images/pubs_pdfs/p833-b_bederson.pdf
- NetGrok, "Visualizing Real-Time Network Resource Usage"(VizSec 2008, 라이브 트리맵의 실제 불안정성 인정 + "링크 표현 불가" 인정): https://www.cs.umd.edu/projects/netgrok/files/vizsec08-netgrok.pdf
- Panopticon 트리맵 문서("정적 그림 아님" 주장, 안정화 기법 비공개): https://help.altair.com/2023/panopticon/vizguide/onlinehelp/45_Treemap.htm
- VMap(Xu & Shen, IEEE TVCG 2023, 계층 기반 그래프 시각화의 연결성 한계): https://arxiv.org/pdf/2306.00120
- Nielsen Norman Group, 트리맵 실무 비평: https://www.nngroup.com/articles/treemaps/

**라이브 토폴로지 안정성**
- Kiali 2.0 발표(Cytoscape → PatternFly Topology 전환): https://medium.com/kialiproject/kiali-2-0-for-istio-2087810f337e
- PatternFly Topology 레이아웃 엔진 목록: https://www.patternfly.org/topology/layouts/
- kiali/kiali#3158(줌아웃 리셋 버그): https://github.com/kiali/kiali/issues/3158
- kiali/kiali#2514(자동 리사이즈 불만, 우회책): https://github.com/kiali/kiali/issues/2514
- kiali/kiali#3684(요소 동일해도 강제 재레이아웃 확인): https://github.com/kiali/kiali/issues/3684
- kiali/kiali#4666(변경 감지 게이트 추가): https://github.com/kiali/kiali/issues/4666
- Kiali 공식 FAQ, 성능/새로고침 전략: https://kiali.io/docs/faq/performance/
- Grafana 공식 문서, Node Graph 패널(레이아웃 3종, `fixedX`/`fixedY`, 200노드 제한): https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/node-graph/
- grafana/grafana#68540(d3-force 불만 + 노드 수 조건부 하이브리드 레이아웃 제안): https://github.com/grafana/grafana/issues/68540
- Datadog 공식 블로그, Service Map: https://www.datadoghq.com/blog/service-map/
- Dynatrace 공식 블로그, Smartscape: https://www.dynatrace.com/news/blog/new-smartscape-make-better-decisions-with-real-time-dependency-graph-of-digital-systems/
- Cytoscape.js GitHub Discussion #3278(incremental layout의 "새 노드 초기 위치 없음" 실패 모드): https://github.com/cytoscape/cytoscape.js/discussions/3278
- Eades, Lai, Misue, Sugiyama, "Preserving the mental map of a diagram"(1991, 원조 개념, 2차 출처 경유): https://www.researchgate.net/publication/220313447
- Diehl & Görg, "Preserving the Mental Map using Foresighted Layout"(2001): https://link.springer.com/chapter/10.1007/3-540-46648-7_39
- "An Incremental Layout Method for Visualizing Online Dynamic Graphs"(온라인 동적 그래프용 incremental FM³ 레이아웃): https://link.springer.com/chapter/10.1007/978-3-319-27261-0_2
- Purchase & Samra, "Extremes are better: Investigating mental map preservation in dynamic graphs"(Diagrams 2008): https://eprints.gla.ac.uk/35837/
- Archambault & Purchase, "The 'Map' in the mental map"(IJHCS 2013, 초록만 확인): https://www.sciencedirect.com/science/article/abs/pii/S107158191300102X
- Kobourov et al., "Towards Faithful Graph Visualizations"(2017): https://arxiv.org/abs/1701.00921

**Force-directed (D3-force, ForceAtlas2)**
- D3 공식 문서, force simulation(alpha/tick 메커니즘): https://d3js.org/d3-force/simulation
- D3 공식 문서, forceManyBody(전역 반발력, Barnes-Hut): https://d3js.org/d3-force/many-body
- d3/d3-force#78("새 노드 추가 시 그래프가 반응 없어짐" 버그 리포트): https://github.com/d3/d3-force/issues/78
- vasturiano/react-force-graph#253(메인테이너의 "재가열은 의도된 설계" 확인): https://github.com/vasturiano/react-force-graph/issues/253
- vasturiano/react-force-graph#188(동일 확인 + `cooldownTicks` 우회책과 한계): https://github.com/vasturiano/react-force-graph/issues/188
- Jacomy, Venturini, Heymann, Bastian, "ForceAtlas2..."(PLoS ONE 2014, 원 논문 — 10~10,000노드 스코프, 10만 노드 상한 명시): https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0098679
- Gephi 공식 블로그, ForceAtlas2 발표(2011, Barnes-Hut n²→n·ln(n)): https://gephi.wordpress.com/2011/06/06/forceatlas2-the-new-version-of-our-home-brew-layout/
- Kobourov, "Force-Directed Drawing Algorithms"(Graph Drawing Handbook, 12장 — 가독성 vs 멘탈맵 보존 트레이드오프): https://cs.brown.edu/people/rtamassi/gdhandbook/chapters/force-directed.pdf
- Cheong, Si, Wong, "Online force-directed algorithms for visualization of dynamic graphs"(Information Sciences 556, 2021, 초록): https://arxiv.org/abs/2204.00451
