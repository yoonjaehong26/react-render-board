# VS Code 연동(코드 점프 / 활성 파일 하이라이트) 기술 타당성 스파이크

> 2026-07-31. 사용자 제안("VSC에서도 렌더 트리·요소 하이라이팅이 동시에 되면 좋을까?")을 논의하다,
> "레퍼런스가 있다는 게 기술적으로 안 어렵다는 뜻이냐"는 질문에 답하기 위해 실제로 두 방향을
> 스크래치 환경에서 스파이크했다. **레포 코드는 변경하지 않았고(정적 코드 리딩 + 별도 임시
> 디렉터리에서의 실험), 이 문서만 그 결과를 남긴다.** 아직 "만들기로 결정"한 건 아니다 —
> 두 방향 다 하드 블로커가 없다는 사실만 확인됐다.

## 결론 요약

| 방향 | 질문 | 답 |
|---|---|---|
| 1. 보드/브라우저 → 에디터(코드 점프) | 기술적으로 되는가? | **된다. 그것도 예상보다 쉽다** — 이미 계산되는 값을 한 줄에서 버리고 있었을 뿐 |
| 2. 에디터 → 보드(활성 파일 하이라이트) | 핵심 채널(VS Code 확장 → 실행 중인 브라우저로 실시간 push)이 되는가? | **된다.** 최소 확장 + 로컬 WebSocket으로 실측 확인 |

두 방향 다 "기술적으로 되는가"라는 질문에는 더 이상 불확실성이 없다. 남은 건 제품/UX 판단(파일↔노드 매칭 정확도, VS Code 확장이라는 새 배포물을 유지보수할 가치가 있는가)이지, 구현 가능성 자체가 아니다.

## 방향1 — 보드/브라우저 → 에디터(코드 점프)

**발견:** `src/data/sourceHints.ts:119`의 `resolveGroupHints`가 `bippy`의 `getSource(fiber)`를 호출해놓고 `source?.fileName`만 뽑아 쓰고 있다. 그런데 `getSource`는 실제로 다음 타입을 돌려준다(`bippy/src/source/get-source.ts` 확인):

```ts
{ fileName: string; lineNumber: number; columnNumber: number; functionName?: string }
```

즉 project-status.md가 "미구현 — 스키마 확장이 선행조건"이라 적어둔 것과 달리, **`lineNumber`/`columnNumber`는 이미 매 프레임 계산되고 있고 그 자리에서 버려지고 있을 뿐**이다. `GroupHintResult`에 필드 두 개를 추가하고 `RenderNode`까지 통과시키는 수준의 작업이라 스키마 "확장"이라기보단 "버려지던 값을 잇기"에 가깝다.

**메커니즘 검증:** 널리 쓰이는 오픈소스(`click-to-component`, `vite-plugin-react-click-to-component`, 이들이 공통으로 쓰는 `vitejs/launch-editor`)가 정확히 이 문제를 풀어놓았다. VS Code 확장이 전혀 필요 없고, 개발 서버에 엔드포인트 하나 + `launch-editor` 호출이면 된다.

실제로 스크래치에서 검증:
```js
const launchEditor = require('launch-editor');
launchEditor('/Users/yoonjaehong/coding/Opensorce/react-render-board/src/data/sourceHints.ts:119:12');
```
실행 결과 VS Code가 정확히 119번 줄로 이동함을 실측 확인(사용자 확인 완료).

**남은 작업(추정, 미착수):** `sourceHints.ts`에서 버리는 값 살리기 → `RenderNode`에 `sourceLocation?: {fileName, lineNumber, columnNumber}` 추가 → CLI가 이미 패치하는 dev 서버(Vite/webpack/Next, ADR-0036)에 `launch-editor` 기반 엔드포인트 하나 추가 → 보드 노드 컨텍스트 메뉴/더블클릭에 "코드로 열기" 액션 연결.

## 방향2 — 에디터 → 보드(활성 파일 하이라이트)

**분해:** 이 방향은 사실 두 개의 독립된 문제다.

1. **파일 경로 → 보드 노드 매칭** — 이미 있는 `groupPath`(ADR-0053, 폴더 그룹핑용 전체 경로)로 스키마 변경 없이 가능. 새로운 문제가 아님.
2. **"지금 활성 파일이 뭔지"를 실행 중인 브라우저 페이지가 실시간으로 아는 문제** — 이게 진짜 미검증 구간이었다. VS Code 확장은 Node(Electron) 프로세스에서, 보드는 브라우저에서 돌아 완전히 별개 프로세스라 통신 채널이 새로 필요하다.

**검증 대상은 2번.** VS Code의 `Sapling` 확장이 "활성 파일=트리 노드 강조" UX 자체는 이미 시도했지만, 그건 VS Code 사이드바 안에서 자체 정적 트리를 그리는 것이라 **살아있는 외부 브라우저 페이지로 신호를 보내는 부분은 어떤 레퍼런스에도 없었다.**

**스파이크 구성 (전부 `/private/tmp/.../scratchpad/vsc-spike/`, 레포 밖):**
- `vscode-ext/`: 최소 VS Code 확장. `vscode.window.onDidChangeActiveTextEditor`로 활성 에디터 변경을 감지해, `ws` 패키지로 띄운 로컬 WebSocket 서버(`ws://localhost:7077`)에 연결된 클라이언트로 `{type: 'activeFile', path}`를 브로드캐스트.
- `receiver.html`: 순수 브라우저 페이지. WS로 접속해 받은 파일 경로를 실시간 표시(보드 하이라이트 로직의 대역).

**실측 결과:** Extension Development Host에서 파일 탭을 전환하자 `receiver.html`이 실시간으로 정확한 절대경로(`.../moa/src/app/RenderBoardClient.tsx`)를 수신·갱신함을 확인(사용자 화면 캡처로 확인 완료, 2026-07-31). 확장 재시작(폴더 열기로 인한 창 리로드) 시 WS 연결이 끊기는 것도 확인 — 클라이언트 쪽 재연결 로직이 필요하다는 실무적 디테일도 같이 드러났다.

**이 스파이크가 증명한 것 / 안 한 것:**
- 증명함: VS Code 확장이 활성 파일 변화를 로컬 WS로 실시간 push하는 메커니즘 자체는 API 레벨에서 막힘없이 동작한다.
- 증명 안 함(제품화 시 남는 작업): 브라우저 쪽 재연결 로직, 여러 VS Code 창/여러 브라우저 탭 동시 연결 처리, 포트 충돌 회피, 확장을 실제로 마켓플레이스에 배포·유지보수하는 문제. 이건 기술 타당성이 아니라 엔지니어링 마무리 + 별도 배포 트랙 유지보수 비용의 문제.

## 판단에 참고할 것

- CLAUDE.md 원칙("과한 도구 투자 금지")은 방향2에 여전히 적용된다 — VS Code 확장은 이 프로젝트에 없던 완전히 새로운 배포물(마켓플레이스 등록·버전 관리)이라, "기술적으로 된다"와 "지금 투자할 가치가 있다"는 별개 질문이다.
- 실제 착수 여부는 (a) 주니어 개발자 대상 수요 검증(기존 보드로 먼저 테스트, [prior-art.md](prior-art.md) 참고 — 죽은 선행 프로젝트들의 공통 원인은 수요 부족이 아니라 유지보수 동기 고갈이었음)과 (b) 방향1(코드 점프)부터 먼저 완성해 비용 대비 가치를 본 뒤 판단하는 게 합리적이다.

## 관련
- [prior-art.md](prior-art.md) — 이 장르 도구들의 반복된 생존/사망 패턴
- [project-status.md §2 UX 레이어](../project-status.md) — "컴포넌트 코드로 점프" 항목의 기존 상태 기록
- ADR-0053 (폴더 그룹핑, `groupPath`) — 방향2의 파일→노드 매칭에 재사용 가능
- ADR-0036 (배포 연결 구현) — 방향1의 dev 서버 엔드포인트를 얹을 기존 인프라
