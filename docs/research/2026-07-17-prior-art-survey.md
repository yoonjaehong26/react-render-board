# react-render-board 사전조사 1단계: 조사 대상 명단 확정

- 조사일: 2026-07-17
- 목표: React 앱의 실시간 렌더 트리(Fiber 트리)를 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`으로 읽어 캔버스형 박스+선 다이어그램으로 시각화하는 도구의 사전조사
- 범위: 이번 단계는 "정확한 조사 대상 명단 확정"까지. 원인 분석/코드·아키텍처 분석은 다음 단계에서 진행.

## 1. 기존 8개 프로젝트 재확인

| 프로젝트 | 형태 | 상태 | URL | 최종활동일 | star | license | 출처 |
|---|---|---|---|---|---|---|---|
| React-Sight | Chrome 확장, D3 | Dead (not actively maintained 명시, PR 35개 중 34개가 Dependabot) | github.com/React-Sight/React-Sight | 릴리스 2020-02-10 / 비봇 활동 2022-01-30 | 2.9k | - | GitHub Releases/Pulls API |
| Realize (oslabs-beta) | Chrome/FF 확장, D3 | Dead (릴리스 0, archived 아니지만 정체) | github.com/oslabs-beta/Realize | push 2023-01-07 | 335 | MIT | GitHub API |
| Reactron | 웹앱 | Dead (공식 종료 명시) | github.com/oslabs-beta/reactron | 2022-03 종료 | 105 | MIT | README |
| ReactMonitor | Chrome 확장 | Dead (릴리스 0) | github.com/oslabs-beta/ReactMonitor | push 2023-03-06 | 178 | MIT | GitHub API |
| react-visualizer (C-React) | 확장+npm | **미검증** — 이번 라운드에서 확인된 claim 없음 | - | - | - | - | 데이터 공백 |
| ReacTree | VSCode 확장 | 정적 파싱 재확인 (Babel, 실시간 아님) — 활성 여부는 미상 | github.com/oslabs-beta/ReacTree | - | - | - | README |
| react-dom-visualizer | npm | **미검증** | - | - | - | - | 데이터 공백 |
| rch (react-component-hierarchy) | CLI | **미검증** | - | - | - | - | 데이터 공백 |

> ⚠️ react-visualizer, react-dom-visualizer, rch 3개는 이번 라운드 검증 목록에 나타나지 않아 확인되지 못함. 재조사 필요.

## 2. 신규 발견 (목표 부합 후보)

| 프로젝트 | 형태 | 상태 | URL | 최종활동일 | star/사용자 | license | 출처 |
|---|---|---|---|---|---|---|---|
| HiFiber (oslabs-beta) | Chrome DevTools 확장 | 실시간 Fiber 트리 시각화, render/re-render 추적 — 정체 추정 (구체 수치는 검증 라운드에서 반박됨) | github.com/oslabs-beta/HiFiber | 미확정 | 미확정 | 미확정 | README, Medium 글 |
| React Fiber Visualizer (typelulu) | Chrome 확장 | 사실상 방치 (v1.0에서 정체) | Chrome 웹스토어 | 2022-05-04 | 사용자 202명 | - | Chrome 웹스토어 리스팅 |
| React-tree-visualiser (singhutsav5502) | 웹앱 (파일 업로드) | 목표 불일치 — 정적 파싱, 실시간 아님 | github.com/singhutsav5502/React-tree-visualiser | - | - | - | README |

> ⚠️ 셋 다 2023년 이후 신규 프로젝트가 아니라 그 이전부터 존재하던 것으로 확인됨 (요청한 "2023년 이후 신규" 조건 불충족).

## 3. 비교군 (안 죽었거나 성공적으로 흡수/전환)

| 프로젝트 | 상태 | 비고 | 출처 |
|---|---|---|---|
| React DevTools (공식) | 2020-06-26 아카이브 | "방향전환"이 아니라 facebook/react 모노레포로 **흡수/이전**된 케이스 | github.com/facebook/react-devtools |
| Reactotron (Infinite Red) | 활발히 유지보수 중 | star 15.6k, 기여자 70+, MIT | github.com/infinitered/reactotron |
| React Scan (aidenybai) | 활발히 유지보수 중 | 코드 변경 없이 설치 가능한 성능 감지 도구 | github.com/aidenybai/react-scan |

## 남은 공백 (다음 단계 보충 조사 필요)

- react-visualizer / react-dom-visualizer / rch 재검증
- "2023년 이후 신규" 조건을 충족하는 프로젝트는 이번 조사에서 발견하지 못함
- HiFiber의 정확한 star/이슈 수치 및 oslabs-beta 내 다른 프로젝트와의 관계 확인
