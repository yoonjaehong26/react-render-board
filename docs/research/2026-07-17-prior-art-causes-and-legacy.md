# 사전조사 2단계: 죽은/정체된 React 시각화 프로젝트의 진행 과정, 포기 원인, 남은 유산

조사일: 2026-07-17
대상: 1단계 조사(`2026-07-17-prior-art-survey.md`)에서 "Dead" 또는 "정체"로 확정된 프로젝트

모든 항목은 ①진행 과정, ②포기 원인, ③남은 유산 구조로 정리한다. 출처가 명확히 확인되지 않은 부분은 "미확인"으로 표기한다.

---

## 1. React-Sight (github.com/React-Sight/React-Sight)

### ① 진행 과정
- Chrome/Firefox 확장으로, D3를 사용해 React 컴포넌트 계층 트리를 실시간 시각화하고 React Fiber, React Router(v4), Redux를 지원한다. ("React Sight is a Chrome and Firefox extension that provides a live visual representation of React component hierarchy trees, with support for React Router and Redux." / repo 토픽 태그 `react-fiber`, `react-router-v4`) — https://github.com/React-Sight/React-Sight , https://raw.githubusercontent.com/React-Sight/React-Sight/master/README.md
- 저장소 자체 소개문에도 "Visualization tool for React, with support for Fiber, Router (v4), and Redux"로 명시. — https://github.com/React-Sight
- 마지막 push는 2023-01-06이며 별 2,865개(리서치 1단계 수치 2.9k와 일치). — https://github.com/React-Sight (GitHub API stargazers_count=2865, pushed_at=2023-01-06T02:01:22Z)
- 제작자/팀 구성: 부트캠프 소속 여부는 이번 조사에서 **미확인**. README에는 단일 유지관리자로 보이는 `@davidcsally`만 명시적으로 언급되며, 부트캠프 팀 크레딧이나 데모데이 발표 영상 링크는 확인되지 않음(검색 범위 내).

### ② 포기 원인
- README에 "project isn't actively maintained. If you would like to maintain, feel free to submit PRs or reach out to @davidcsally"라는 명시적 종료/이관 안내문이 있음. — https://raw.githubusercontent.com/React-Sight/React-Sight/master/README.md
- **기술적 blocker가 명확히 존재**: 2020-06-16 이슈 #219 "Chrome extension makes sites with production build unresponsive"에서 프로덕션 빌드 사이트가 멈추는 문제가 보고됨. 2020-10-06 유지관리자 davidcsally가 직접 "I don't really maintain this project anymore. Unfortunately I was never able to get it to only run when the dev tools are opened."라고 답변 — 확장이 devtools 패널이 열려있을 때만 실행되도록 만들지 못한 것이 근본 원인. 이후 다른 사용자들(Alecell, Hahlh, pikitgb)도 2020년 말까지 동일 증상을 재확인했고, Hahlh는 유지관리자에게 "will break websites that use React in production"이라며 경고 문구라도 달아달라 요청했으나 반영되지 않음(이슈는 라벨 없이 열린 채로 방치). — https://github.com/React-Sight/React-Sight/issues (issue #219)
- 2021-12-01, Chrome Web Store가 확장을 "unsafe"로 표시하며 강제로 끔(issue #295, 제목 "This extension has been turned off as it's been marked unsafe by the Chrome Web Store."). 해당 이슈는 현재까지도 Open 상태로 미해결 — 프로젝트가 이 시점 전후로 사실상 방치되었음을 뒷받침. — https://github.com/React-Sight/React-Sight/issues/295
- 종합하면 **단순 방치가 아니라 구체적 기술 blocker(전역 실행으로 인한 프로덕션 성능 저하 → devtools-only 실행으로 전환 실패)가 유지관리 중단의 실질적 계기**였고, 이후 Chrome Web Store 보안 플래그가 사실상의 종료 확인 도장을 찍은 형태.

### ③ 남은 유산
- LICENSE 실제 확인: **미확인**(이번 조사에서 LICENSE 파일 내용을 직접 검증하지 못함, 1단계 조사에서 MIT로 분류된 근거는 GitHub topic/license 배지 추정으로 보임 — 재확인 필요).
- 재사용 가능 자산: D3 기반 트리 렌더링 로직, Fiber 트리 → 시각화 데이터 변환 파이프라인("raw data is then processed and fed to D3")이 존재하나 코드 내부 품질은 이번 조사 범위 밖.
- **회피해야 할 함정(이슈에 남은 "이거 안 됨" 정보)**:
  1. 컨텐츠 스크립트를 전역(모든 페이지)에서 실행하면 프로덕션 사이트가 멈춘다 — devtools 패널이 열렸을 때만 계측 로직이 동작하도록 설계해야 함.
  2. React 16에서는 "trigger a render"를 하지 않으면 트리가 표시되지 않는 알려진 한계가 있었음: "In React16 you will need to trigger a render to have your application show up. The data is not exposed until React's renderer is called." — Fiber 데이터 획득 타이밍을 렌더 이벤트에 정확히 훅해야 함을 시사.
  3. 파싱 함수에서 무한 루프에 빠져 "Maximum call stack exceeded" 콘솔 에러가 나는 알려진 버그가 있었음("We are working on a fix"라고만 하고 미해결) — 트리 순회(재귀) 로직에 순환 참조/깊이 제한 가드가 필요함을 시사. — https://raw.githubusercontent.com/React-Sight/React-Sight/master/README.md
- UI/UX 아이디어: 별도 스크린샷 상세 분석은 이번 조사에서 수행하지 않음(미확인).

---

## 2. Realize (github.com/oslabs-beta/Realize)

### ① 진행 과정
- React 컴포넌트 트리 시각화 도구. D3 사용, Chrome/Firefox 확장 형태, React v16.8을 대상으로 함. ("Realize is a tool to help developers visualize the structure and state flow of their React applications... It currently supports React v.16.8.") — https://raw.githubusercontent.com/oslabs-beta/Realize/master/README.md
- 제작자는 **OS Labs 부트캠프 4인 팀**: Fan Shao, Harry Clifford, Henry Black, Horatiu Mitrea. README에 각자 GitHub/LinkedIn 링크와 팀 연락용 이메일(realizeforreact@gmail.com)이 명시되어 있어 개인/회사 프로젝트가 아닌 코호트 팀 프로젝트임이 확인됨. — https://github.com/oslabs-beta/Realize
- `oslabs-beta` 조직 하에 호스팅되며 별 335개, 포크 20개(1단계 조사 수치와 일치), 마지막 push 2023-01-07, MIT 라이선스. — https://github.com/oslabs-beta
- 데모데이 발표 영상/블로그 링크: **미확인**(이번 조사 범위 내 검색되지 않음).

### ② 포기 원인
- README/이슈에 React-Sight처럼 명시적인 "not maintained" 선언문은 확인되지 않음(**미확인** — 존재할 수 있으나 이번 조사에서 발견 못함). 다만 마지막 활동이 2023-01-07 이후 정지된 점, OS Labs 부트캠프 코호트 프로젝트 특성상 부트캠프 프로그램 종료와 함께 유지관리가 멈추는 전형적 패턴(아래 OS Labs 섹션 참고)과 부합.
- 기술적 blocker vs 단순 방치 여부: **미확인**(이슈 트래커의 구체적 패턴을 이번 조사에서 분석하지 못함, 추가 조사 필요).
- 실사용자 불만(성능/대형 앱 UI 붕괴 등): **미확인**.

### ③ 남은 유산
- LICENSE: MIT로 확인됨(1단계 조사 근거 유지, 이번 조사에서 재검증은 API 레벨까지는 하지 않았으나 GitHub 조직 페이지 표기와 README 상 라이선스 배지 일치). — https://github.com/oslabs-beta/Realize
- 재사용 가치: D3 기반 트리 시각화, zoom/pan 지원되는 node-link 트리(README에 zoom/pan 언급), React v16.8 대상 Fiber 접근 방식 — 구체적 알고리즘 상세는 코드 레벨 추가 조사 필요.
- 남은 "이거 안 됨" 정보: **미확인**(이슈 상세 분석 범위 밖).
- UI/UX 레이아웃 아이디어: **미확인**(스크린샷 분석 범위 밖).

---

## 3. Reactron (github.com/oslabs-beta/reactron)

### ① 진행 과정
- 웹앱 형태의 React 시각화 도구, `oslabs-beta` 조직 소속. 제작자는 **OS Labs 부트캠프 5인 팀**: Jimmy Lin, Kerri Crawford, Logan Coale, Nathaniel Armstrong, Romelo Gilbert. GitHub API 컨트리뷰터 목록도 이 5명과 실질적으로 일치(kerriannercrawford 147 commits, odylic 93, SteeleCoale 54, n8innate 52, Seymour-creates 10 등, 나머지 1명은 봇성 계정). — https://github.com/oslabs-beta/reactron , https://api.github.com/repos/oslabs-beta/reactron/contributors
- 호스팅 데모 사이트 reactron.io가 있었음(현재는 접속 불가, 아래 참고).

### ② 포기 원인
- README에 명시적 종료 선언: **"As of March 2022, Reactron is no longer an active project and cannot be accessed from reactron.io."** — https://raw.githubusercontent.com/oslabs-beta/reactron/master/README.md
- 직접 curl로 reactron.io 접속 시도 결과 응답 없음(연결 실패, exit/status "000")으로 "접속 불가" 서술이 실제로 검증됨.
- 부트캠프 캡스톤 프로젝트 생애주기(부트캠프 프로그램 종료 시점과 함께 팀이 해산하며 호스팅/유지관리 중단)와 일치하는 패턴으로, 기술적 blocker보다는 **팀 해산에 따른 계획된 종료**로 보임(README가 스스로 "no longer an active project"라고 명확히 선언한 점이 이를 뒷받침).
- 실사용자 불만: **미확인**(이슈 트래커 상세 분석 범위 밖).

### ③ 남은 유산
- LICENSE: 1단계 조사에서 MIT로 분류(README상 배지 기준), 이번 조사에서 API 레벨 재검증은 하지 않음 — **부분 확인**.
- 재사용 가치: 웹앱 형태이므로 확장이 아닌 별도 프론트엔드 애플리케이션으로서의 시각화 UI/레이아웃 아이디어가 있을 수 있으나 reactron.io 데모가 이미 죽어 있어 스크린샷으로 직접 확인 불가. README에 남아있는 정적 설명 외 자료는 **미확인**.
- 남은 "이거 안 됨" 정보: **미확인**.

---

## 4. ReactMonitor (github.com/oslabs-beta/ReactMonitor)

### ① 진행 과정
- Chrome DevTools 확장으로, fiber root 객체를 동적으로 순회(traverse)하여 state, props, render times, 컴포넌트 타입을 실시간으로 시각화. ("ReactMonitor is a Chrome DevTools extension that visualizes React component trees and their performance metrics... dynamically traverse the fiber root object behind the scenes, displaying state, props, render times and the type of components on the page.") — https://github.com/oslabs-beta/ReactMonitor
- 제작자는 **OS Labs 부트캠프 7인 팀**: Rudo Hengst, Lia Pham, Tommy Han, Nay Linn, Hamoud Ebnou, Dan Bitsmith, Philip Rodrigues (각각 GitHub 핸들 확인됨: @RudoH, @lpham598, @simple-sifu, @naylinnpkv, @Ebnouhamoud, @bitsmith-ny19, @Malvado996). — https://github.com/oslabs-beta/ReactMonitor
- 마지막 push는 2023-03-06(1단계 조사 수치와 일치), 별 178개, MIT 라이선스, 235 커밋.

### ② 포기 원인
- 명시적 "not maintained" 선언문: **미확인**(README에서 확인되지 않음, 존재하지 않을 가능성).
- 기술적 blocker vs 방치 패턴: **미확인**(이슈 트래커 상세 분석 범위 밖 — ReactMonitor는 이번 조사에서 이슈 목록을 깊이 분석하지 못함).
- 실사용자 불만: **미확인**.
- 정황상 다른 OS Labs 프로젝트들과 마찬가지로 부트캠프 코호트 종료와 함께 활동이 멈춘 것으로 추정되나 이는 **추정**이며 직접 증거는 확보하지 못함.

### ③ 남은 유산
- LICENSE: MIT (1단계 조사 결과 유지, README 배지 기준 — API 레벨 재검증은 이번 조사에서 수행하지 않음, **부분 확인**).
- 재사용 가치: "dynamically traverse the fiber root object" 방식의 fiber 순회 로직은 react-render-board가 필요로 하는 것과 동일한 문제(Fiber 트리 → state/props/render-time 데이터 추출)를 다뤘던 선례로서 코드 레벨 참고 가치가 있음. 실제 순회 알고리즘 상세는 추가 코드 리딩 필요.
- 남은 "이거 안 됨" 정보: **미확인**.

---

## 5. HiFiber (github.com/oslabs-beta/HiFiber)

### ① 진행 과정
- Chrome DevTools 확장, React 16+ 애플리케이션의 Fiber 트리를 시각화하고 Simple/Full 모드를 제공하며, 노드별 성능 지표(Fiber node start time, duration, rerender time/count 등)를 추적. ("a Chrome DevTool that allows developers to visualize the React Fiber tree of any React 16+ application. Also details performance metrics for easy debugging." / README: "Fiber node start time, duration, rerender time/count, and various other useful Fiber properties") — https://github.com/oslabs-beta/HiFiber
- 제작자는 **OS Labs 부트캠프 5인 팀**: Lauren Acrich, Matthew Birnholtz, Michael Filoramo, Mikel Giffin, Adrian Karnani.
- 팀원 Adrian Karnani가 작성한 소개 블로그(Medium) "Introducing HiFiber: A visualization tool for the React Fiber tree" 확인됨 — 도구의 배경과 기능을 설명하는 1차 소개 글. — https://medium.com/@adriankarnani/introducing-hifiber-a-visualization-tool-for-the-react-fiber-tree-fb8c80234ee0
- LinkedIn에 "HiFiber (OS Labs)" 회사/프로젝트 페이지 존재, 부트캠프 프로젝트 서사와 일치. — https://www.linkedin.com/company/hifibertools
- 데모데이 발표 영상: **미확인**(이번 조사에서 영상 링크는 발견되지 않음).

### ② 포기 원인
- 명시적 "not maintained" 선언문: **미확인**.
- 기술적 blocker vs 방치: **미확인**(이슈 트래커 상세 분석 범위 밖).
- 실사용자 불만: **미확인**.
- 부트캠프 코호트 프로젝트 특성상 프로그램 종료와 함께 활동이 멈췄을 가능성이 높으나 **추정**.

### ③ 남은 유산
- LICENSE: **MIT, Copyright (c) 2022 OSLabs Beta로 GitHub API 레벨에서 직접 검증됨** (base64 디코딩한 LICENSE 파일 원문 확인, GitHub 자동 라이선스 분류도 license.key="mit" 확인). — https://api.github.com/repos/oslabs-beta/HiFiber/license
- 재사용 가치: react-render-board의 핵심 목표(실시간 Fiber 트리 시각화 + render/re-render 추적)와 **가장 근접한 선례**. 노드별 start time/duration/rerender time·count를 계측하는 데이터 스키마는 그대로 참고할 가치가 큼. Simple/Full 모드 구분(간략 트리 vs 상세 트리)이라는 UI 레이아웃 아이디어도 참고할 만함.
- 남은 "이거 안 됨" 정보: **미확인**(코드/이슈 상세 리딩 필요, 이번 조사 범위 밖).
- 5개 프로젝트 중 문제 정의가 react-render-board와 가장 유사하므로, 코드 레벨 딥다이브(특히 Fiber 순회 및 계측 삽입 지점)를 별도 조사로 후속 진행할 가치가 있음.

---

## OS Labs (oslabs-beta) 조직 배경

Realize, Reactron, ReactMonitor, HiFiber, C-React(react-visualizer) 모두 `oslabs-beta` GitHub 조직 하에 있으며, OS Labs는 스스로를 "a nonprofit tech accelerator supporting high-impact open source development"라고 소개한다. — https://github.com/oslabs-beta , https://www.opensourcelabs.io/ , https://www.opensourcelabs.io/about

Codesmith 부트캠프 자체 웹사이트도 OS Labs를 "Codesmith residents가 이터레이션할 수 있는 오픈소스 프로덕트를 호스팅하는 곳"이라고 설명하여, 이들 프로젝트가 Codesmith 부트캠프 레지던시(취업 전 실무 프로젝트 과정)의 산출물임을 뒷받침한다. — https://www.codesmith.io/software-engineering-bootcamp-projects

**시사점**: `oslabs-beta` 산하 프로젝트들의 공통 생애주기는 "부트캠프 코호트 기간 중 집중 개발 → 코호트 종료(보통 몇 개월) 후 유지관리 급감/중단"이며, 이는 기술적 실패라기보다 **인력·인센티브 구조의 문제**(취업을 목표로 하는 학생들이 프로젝트를 포트폴리오로 완성한 뒤 이직하면 유지관리 유인이 사라짐)임을 시사한다.

---

## 빠르게 확인한 프로젝트

### react-visualizer (C-React, github.com/oslabs-beta/react-visualizer)
- 확장 + npm 패키지 형태. "an open-source tool that visualizes DOM components as a tree, marks rendering patterns on web pages, and displays performance metrics"라는 자기소개 확인됨. 커스텀 렌더러(`cRender`) + Chrome DevTools 확장으로 실시간 모니터링을 제공하는 런타임 도구이며, 정적 파서가 아님 — react-render-board와 문제 영역이 겹친다. — https://github.com/oslabs-beta/react-visualizer
- 마찬가지로 `oslabs-beta` 산하이므로 위 OS Labs 생애주기 패턴을 따를 가능성이 높으나, ①②(진행 과정/포기 원인) 세부사항은 이번 얕은 조사에서 확보하지 못함 — 데이터 부족.

### react-dom-visualizer (npm)
- 데이터 부족, 유산 없음. 이번 조사에서 유의미한 1차 출처를 확보하지 못함.

### rch (react-component-hierarchy, CLI)
- 데이터 부족, 유산 없음. 이번 조사에서 유의미한 1차 출처를 확보하지 못함.

---

## 비교군: 왜 이들은 죽지 않았나

### Reactotron (infinitered/reactotron)
React JS/React Native 프로젝트 검사용 데스크톱 앱으로, **부트캠프 팀이 아니라 실제 소프트웨어 컨설팅 회사 Infinite Red가 만들고 운영**한다("Reactotron is developed by Infinite Red, [@rmevans9], and 70+ amazing contributors!"; Infinite Red 자체 문서에도 "The OG debugger at Infinite Red that we use on a day-to-day basis to build client apps"라고 명시 — 자사 클라이언트 프로젝트에 실제로 매일 사용하는 도구이므로 유지보수 유인이 구조적으로 지속됨). 2026-07-17 기준 최신 릴리스는 reactotron-react-native@5.2.0(2026-05-28), 누적 릴리스 510개, master 브랜치 커밋 6,305개로 **현재도 활발히 유지관리 중** — 부트캠프 기원 도구들과 정반대로 "회사의 자체 도구(dogfooding)"라는 지속 가능한 인센티브 구조가 생존 이유. — https://github.com/infinitered/reactotron , https://docs.infinite.red/reactotron/

### React Scan (aidenybai/react-scan)
GitHub 별 21.7k(정확히는 21,655), 포크 378개로, 조사 대상 죽은 프로젝트들(React-Sight 2.9k, Realize 335, ReactMonitor 178, Reactron 105)을 압도적으로 상회하는 커뮤니티 채택 규모를 보인다. — https://github.com/aidenybai/react-scan (GitHub API 기준 2026-07-17 확인). 별 수만으로 성공 원인을 전부 설명할 수는 없으나("indicating strong community adoption"이라는 완화된 표현이 적절), 압도적 스케일 차이 자체가 부트캠프 코호트 프로젝트들과의 근본적 격차를 보여준다.

### React DevTools 공식 (facebook/react-devtools)
1단계 조사 결론대로, 이 사례는 "방향전환 실패"가 아니라 **facebook/react 모노레포로의 흡수/이전**이다. `facebook/react-devtools` 저장소는 2020-06-26 GitHub에 의해 아카이브(read-only) 처리되었고, README에는 "This project has migrated to github.com/facebook/react"라고 명시되어 있으며, v3 소스는 이력 보존용 `v3` 브랜치에 남아 있다. 실제로 `facebook/react/tree/main/packages/react-devtools` 하위에 react-devtools, react-devtools-core, react-devtools-extensions, react-devtools-shared 등 여러 서브패키지로 코드가 계속 존재하며 유지관리되고 있다. 즉 "죽은 프로젝트"가 아니라 "구조적으로 흡수된 프로젝트"이며, 5개 부트캠프 도구들의 방치형 죽음과는 질적으로 다른 케이스다. — https://github.com/facebook/react-devtools , https://github.com/facebook/react/tree/main/packages/react-devtools

---

## 우리 프로젝트가 구체적으로 참고할 포인트

**기술적 시사점**
1. **devtools-only 실행 원칙**: React-Sight의 최대 실패 원인은 계측 로직이 devtools 패널이 열려 있지 않을 때도 전역으로 실행되어 프로덕션 사이트를 멈추게 한 것이었다("I was never able to get it to only run when the dev tools are opened"). react-render-board는 반드시 devtools/디버그 모드가 활성화된 경우에만 hook에 개입하도록 설계해야 한다.
2. **재귀 순회 가드**: React-Sight의 "Maximum call stack exceeded" 버그는 Fiber 트리 파싱 시 순환 참조나 과도한 깊이에 대한 가드가 없었기 때문으로 추정된다. Fiber 순회 로직에는 깊이 제한과 방문 노드 캐시(사이클 방지)를 반드시 넣어야 한다.
3. **렌더 타이밍 훅 지점**: React 16에서 "트리거 렌더를 하지 않으면 데이터가 노출되지 않는다"는 React-Sight의 알려진 한계는, Fiber 데이터를 `onCommitFiberRoot` 같은 DevTools 훅 콜백에서 정확히 캡처해야 함을 시사한다(초기 마운트 시점에 이미 늦으면 안 됨).
4. **HiFiber의 노드별 계측 스키마(start time, duration, rerender time/count)**는 5개 프로젝트 중 react-render-board의 목표(실시간 Fiber 트리 + render/re-render 추적)와 가장 가까우므로, 코드 레벨로 후속 딥다이브할 1순위 후보다.
5. **ReactMonitor·C-React의 "fiber root 객체 동적 순회"** 접근은 우리가 필요로 하는 Fiber 트리 → 시각화 데이터 변환 스키마의 참고 선례가 될 수 있다.

**전략적 시사점**
6. **유지관리 인센티브 구조가 기술보다 중요하다**: 5개 죽은 프로젝트(React-Sight 제외) 대부분이 OS Labs/Codesmith 부트캠프 코호트 산출물이며, 코호트 종료(취업)와 함께 유지관리가 끊기는 동일한 생애주기를 보인다. 반면 Reactotron은 회사가 자사 제품 개발에 매일 사용하는 dogfooding 도구라 지속되고, React Scan은 개인/커뮤니티 규모가 임계질량을 넘어 자생적으로 유지된다. react-render-board가 장기 생존하려면 "만들고 끝"이 아니라 실제 사용 맥락(자기 프로젝트에 계속 쓰기, 또는 커뮤니티 채택 임계점 확보)을 확보해야 한다.
7. **Chrome Web Store 정책 리스크**: React-Sight는 자체 버그와 별개로 Chrome Web Store의 보안 정책 변화로 강제 비활성화되었다(2021-12-01, 이슈 미해결로 방치). 브라우저 확장 형태로 배포할 경우 이런 플랫폼 리스크에 대한 대응 계획(정기 정책 준수 점검, 대안 배포 채널)이 필요하다.
8. **명시적 종료 공지의 가치**: Reactron과 React-Sight 모두 README에 명확한 종료/비유지관리 선언을 남겼다. 이는 사용자 신뢰와 후속 조사자(우리와 같은)의 시간을 아껴주는 좋은 관행이며, react-render-board도 향후 상태 변화 시 이런 투명성을 참고할 만하다.

**미해결 후속 조사 필요 항목**
- Realize, Reactron, ReactMonitor, HiFiber의 이슈 트래커 상세 분석(기술적 blocker vs 단순 방치 구분) — 이번 조사에서는 README/조직 정보 위주로만 확인했고 이슈 레벨 딥다이브는 못함.
- 각 프로젝트의 실제 LICENSE 파일 API 레벨 재검증(HiFiber만 완료, 나머지는 배지/README 기준 부분 확인).
- HiFiber 코드 레벨(Fiber 순회 알고리즘, 계측 삽입 지점) 딥다이브.
