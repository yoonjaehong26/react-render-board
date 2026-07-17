# 선행 프로젝트 조사 (Prior Art)

> 이 문서는 요약본입니다. 원 조사 기록은 [`2026-07-17-prior-art-survey.md`](2026-07-17-prior-art-survey.md)(1단계: 조사 대상 명단 확정)와 [`2026-07-17-prior-art-causes-and-legacy.md`](2026-07-17-prior-art-causes-and-legacy.md)(2단계: 진행 과정·포기 원인·남은 유산)에 있습니다.

## 핵심 발견

"실시간 렌더 트리 + 캔버스형 박스 다이어그램"은 여러 팀이 독립적으로 시도했으나 **거의 모두 유지보수가 끊겼다.** 이는 상반된 두 신호를 준다:

- ✅ **수요는 확실하다.** 무관한 팀들이 몇 년에 걸쳐 같은 문제를 반복해서 골랐다 = 시장 검증.
- ⚠️ **죽는 이유는 기술이 아니라 "누가 만드는가"였다.** 다수가 부트캠프(Codesmith/OS Labs) 팀 프로젝트로, "취업 포트폴리오용 스프린트" 성격이라 완성 직후 유지 동기가 사라졌다.

## 죽은/정체된 프로젝트 목록

| 프로젝트 | 형태 | 상태 | 비고 |
|---|---|---|---|
| React-Sight | Chrome 확장, D3 | 마지막 릴리스 2020, "not actively maintained" 명시 | 확장 스토어에서도 내려감 |
| Realize (oslabs-beta) | Chrome/FF 확장, D3 | React 16.8 지원, 릴리스 0개, 열린 PR 26개 | React-Sight와 기능 거의 판박이 |
| Reactron | 웹앱 | 2022.3부로 종료 명시 | |
| ReactMonitor | Chrome 확장 | 릴리스 0개 | |
| react-visualizer (C-React) | 확장 + npm | 정체 | |
| ReacTree | VSCode 확장 | 정적 파싱 기반 | 실시간 아님 |
| react-dom-visualizer | npm | 1회성 실험 | |
| rch (react-component-hierarchy) | CLI | 마지막 2019, 사실상 방치 | 정적 JSX 파싱 |
| HiFiber (oslabs-beta) | Chrome DevTools 확장 | 정체 (OS Labs 코호트 종료 추정) | 목표와 가장 근접한 선례 — 노드별 render/re-render 계측 스키마 참고 가치 큼 |

## 도구 유형별 분류

목표("실시간 + 캔버스형 박스") 기준으로 나누면:

- **공식 React DevTools** — 실시간이지만 들여쓰기 리스트 뷰 (박스/캔버스 아님)
- **React-Sight, Realize, Reactron 등** — 박스+캔버스였지만 죽음
- **ReacTree, React-tree-visualiser, rch** — 정적 코드 파싱 (실시간 아님)
- **CodeSee** — Figma식 캔버스이지만 `import` 정적 분석 (렌더 구조와 불일치), 상용, 방향 전환됨

→ "실시간 + 캔버스형 박스"는 **현재 비어 있는 자리**다.

## 교훈

1. **비어있는 이유가 부분적으로 구조적이다.**
   - React DevTools의 리스트 뷰가 이미 대부분의 디버깅 니즈를 충족한다.
   - 대형 앱에서는 박스+선이 오히려 스파게티가 되어 리스트 뷰보다 불리할 수 있다.
   - React Scan이 성공한 이유는 새 다이어그램을 그리는 대신 **실제 DOM 위에 박스를 오버레이**했기 때문 — 별도 레이아웃 계산 없이 익숙한 화면에서 바로 이해됨.
   - 이 니치는 상업적 수익화가 특히 어렵다 (CodeSee도 방향 전환).

2. **못 만드는 게 아니라, 만든 사람들이 오래 붙잡을 동기가 없었다 — 2단계 조사로 실증됨.**
   - 죽은 프로젝트 5개 중 4개(Realize, Reactron, ReactMonitor, HiFiber)가 `oslabs-beta`(OS Labs/Codesmith 부트캠프) 소속 코호트 팀 프로젝트였다. Reactron은 README에 "As of March 2022, Reactron is no longer an active project"라고 명시하며 부트캠프 코호트 종료 시점과 일치하게 활동이 끊겼다.
   - 반례가 이유를 더 뚜렷하게 보여준다: **Reactotron**(infinitered/reactotron)은 부트캠프가 아니라 소프트웨어 컨설팅 회사 Infinite Red가 자사 클라이언트 프로젝트에 매일 쓰는 도구(dogfooding)라서 지금도 활발히 유지관리 중이다. **React Scan**은 개인 프로젝트지만 별 21.7k로 커뮤니티 채택이 임계질량을 넘어 자생적으로 유지된다.
   - → 유지관리 유인은 "회사의 자체 도구" 아니면 "커뮤니티 채택 임계점" 둘 중 하나에서 나온다. react-render-board도 이 중 하나를 명시적으로 목표해야 한다.

3. **유일하게 부트캠프 출신이 아닌 React-Sight는 기술적 원인으로 죽었다.**
   - 계측 로직이 devtools 패널이 닫혀 있을 때도 전역 실행되어 프로덕션 사이트를 멈추게 하는 버그가 있었고, 제작자가 "devtools가 열렸을 때만 실행되게 만드는 데 결국 실패했다"고 직접 인정했다. 이후 Chrome Web Store가 확장을 "unsafe"로 강제 비활성화하며 사실상 종료됐다.
   - 이 실패는 **동기 부족이 아니라 순수 기술적 설계 결함**이라, react-render-board 아키텍처에 직접 반영할 수 있는 구체적 교훈이다 (→ [`architecture.md`](../architecture.md#선행-프로젝트-실패에서-얻은-설계-원칙) 참고).

4. **HiFiber(oslabs-beta)가 목표와 가장 근접한 선례다.** 실시간 Fiber 트리 시각화 + 노드별 render/re-render 계측(start time, duration, count)까지 다뤘다. 코드 레벨 딥다이브 1순위 후보로 남겨둔다.

5. **우리의 유리한 점:** 왜 선행 시도들이 죽었는지 정확히 알고 시작한다. 특히 "대형 앱에서도 안 뭉개지는 UX"와 "devtools-only 실행"을 초기 설계에 넣는 것이 차별점.

## 남은 후속 조사 (미해결)

- Realize / Reactron / ReactMonitor / HiFiber의 이슈 트래커 상세 분석 (기술적 blocker vs 단순 방치 구분) — 이번 2단계는 README/조직 정보 위주로만 확인.
- 각 프로젝트 LICENSE의 API 레벨 재검증 (HiFiber만 완료).
- HiFiber 코드 레벨(Fiber 순회 알고리즘, 계측 삽입 지점) 딥다이브 — 실험 1(기술 검증) 착수 시 참고 자료로 우선 확인 권장.
