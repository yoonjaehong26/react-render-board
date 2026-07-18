# Excalidraw 시각 정체성 조사 — 이 프로젝트에 적용할 것/말 것

조사일: 2026-07-18
목적: 사용자가 원하는 "Excalidraw풍 손그림(sketchbook) + 과감한 색" 미학을 이미 부분 구현된 `roughStyle.ts`/`groupColor.ts`/`colorModePreference.ts` 위에 어떻게 더 다듬을지 조사한다. **코드 변경 없음 — 순수 조사 + 제안.** 최종 반영은 이 문서가 아니라 사용자와의 별도 논의에서 결정한다.

**범위**: 처음엔 다이어그램(그룹/컴포넌트 노드)만 다뤘으나, 이 도구가 호스트 페이지 위에 얹는 나머지 UI 표면 — 플로팅 버튼(`BoardOverlay.tsx`)과 "React Scan 스타일" DOM 하이라이트 박스(`DomHighlightOverlay.tsx`) — 도 같은 테마로 볼 만한지 이어서 조사했다(7~10절).

방법론: (1) 이 저장소에 이미 체크아웃돼 있는 실제 Excalidraw 소스(`experiments/real-app-validation/excalidraw/`)를 직접 읽어 rough.js 옵션·색 팔레트·폰트·spacing 토큰의 정확한 값을 확인했다. (2) Excalidraw 팀/커뮤니티가 이 미학을 채택한 이유에 대한 공개 자료를 웹에서 확인했다. (3) 이 프로젝트의 기존 구현(`roughStyle.ts`/`groupColor.ts`/`GroupNode.tsx`/`flow.css`)과 대조했다. (4) 다크모드 대비는 실제 hex 값으로 WCAG 대비율을 계산해 검증했다(추정이 아니라 계산).

---

## 1. Excalidraw 실제 디자인 패턴 (소스 코드 직접 확인)

### 1-1. 선 스타일 — roughness/bowing

`packages/element/src/shape.ts`의 `generateRoughOptions()`가 실제 rough.js 옵션을 만든다. 핵심 값(`packages/common/src/constants.ts`):

```ts
export const ROUGHNESS = { architect: 0, artist: 1, cartoonist: 2 };
export const DEFAULT_ELEMENT_PROPS.roughness = ROUGHNESS.artist; // = 1, 기본값
```

- **3단계 프리셋**: architect(0, 거의 안 흔들림/기술 도면풍) → artist(1, **기본값**, 적당히 흔들림) → cartoonist(2, 과장된 흔들림/만화풍).
- **작은 도형은 자동으로 덜 흔들림**: `adjustRoughness()`(같은 파일, L171-192)가 `maxSize<50 && minSize<20`인 작은 요소는 roughness를 2~3으로 나눠(최대 2.5로 clamp) 형태 보존을 우선한다. "작을수록 절제"가 Excalidraw 자체의 내장 규칙이다.
- **bowing**은 코드에서 따로 세팅하지 않고 rough.js 기본값(1)을 그대로 쓴다.

이 프로젝트의 `roughStyle.ts`는 `roughness: 0.8, bowing: 0.6`을 쓴다 — **Excalidraw 자체 기본값(artist=1)보다도 덜 흔들리는, 더 절제된 선택**이다. 코드 주석이 이미 "마커로 한 번에 그은 느낌"을 의도했다고 밝히고 있는데, 이는 Excalidraw의 "작은 도형=roughness 낮춤" 규칙과 정확히 같은 방향이다(컴포넌트 노드가 160×48으로 작기 때문). **결론: 지금 설정을 바꿀 근거가 없다.** 오히려 이미 정적 이미지로 캐싱해뒀으므로(모듈 로드 시 1회, 노드 수와 무관) 성능상으로는 흔들림을 더 키워도 비용이 0이지만, 수십~수백 개가 동시에 보이는 좁은 노드에서는 지금 수준의 절제가 가독성상 더 낫다.

### 1-2. 색 팔레트 — "진한 선 + 파스텔 채움"이 핵심 공식

`packages/common/src/colors.ts`의 `COLOR_PALETTE`는 open-color 기반, 12개 색상군 × 5단계 톤(weight 50/200/400/600/800형) 배열이다. 예:

```ts
gray:   ["#f8f9fa","#e9ecef","#ced4da","#868e96","#343a40"],
red:    ["#fff5f5","#ffc9c9","#ff8787","#fa5252","#e03131"],
blue:   ["#e7f5ff","#a5d8ff","#4dabf7","#228be6","#1971c2"],
```

**가장 중요한 발견**: 기본 선택 인덱스가 `DEFAULT_ELEMENT_STROKE_COLOR_INDEX = 4`(가장 진한 톤), `DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX = 1`(가장 옅은 파스텔 톤)이다. 즉 Excalidraw의 색 공식은 **"진하고 채도 있는 선(stroke) + 아주 옅은 파스텔 채움(fill)"**이지, 전체가 쨍한 색으로 뒤덮이는 게 아니다. 캔버스 배경 자체도 거의 흰색에 가까운 파스텔(`#f8f9fa`, `#f5faff`, `#fffce8` 등)이다.

이 프로젝트의 `groupColor.ts` 팔레트(예: 라이트 인디고 `#6366f1`)는 그룹 프레임 **테두리 색**(진함)과 컴포넌트 노드 **배경 틴트**(`#6366f11a`, 약 10% 알파 — 사실상 파스텔)로 나눠 쓰고 있다. **구조적으로 Excalidraw의 "진한 선 + 파스텔 채움" 공식과 이미 일치한다.** 색상군 자체(인디고/블루/시안/틸/바이올렛/퓨셔/핑크/로즈)가 Excalidraw의 웜톤(빨강/주황/노랑/초록)을 뺀 건, 이미 기존 시맨틱 색(matched=초록, cross-group=호박색)과 겹치지 않으려는 의도적 선택이라 코드 주석에도 있고 타당하다 — 바꿀 필요 없음.

### 1-3. 타이포그래피 — 손글씨체는 "캔버스 콘텐츠"에만, UI 크롬엔 절대 안 씀

`packages/common/src/constants.ts`의 `FONT_FAMILY`: `Virgil`은 **레거시**이고 현재 기본 손글씨 폰트는 `Excalifont`(`DEFAULT_FONT_FAMILY = FONT_FAMILY.Excalifont`)다. `Virgil.woff2`가 남아있는 건 Node.js 서버사이드 렌더링(`index-node.ts`) 하위호환용일 뿐, 실제 캔버스 텍스트는 이미 `Excalifont`로 교체됐다.

**핵심 구분**: 손글씨 폰트(Excalifont/Virgil)는 **캔버스 위에 사용자가 그린 텍스트 요소에만** 적용된다. UI 크롬(패널/버튼/메뉴/다이얼로그)은 `css/styles.scss`에서 명시적으로 다른 폰트를 쓴다:

```scss
--ui-font: Assistant, system-ui, BlinkMacSystemFont, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
```

`.excalidraw` 루트 전체가 이 `--ui-font`를 기본으로 쓰고, 손글씨체는 캔버스 텍스트 렌더링 경로에서만 별도로 지정된다. 코드/모노스페이스가 필요한 자리(내보내기 다이얼로그, 드롭다운 폰트 선택지)엔 `Cascadia`를 쓴다.

**이 프로젝트에 옮기면**: 지금 `flow.css`는 툴바·그룹 라벨·컴포넌트 노드 이름·줌 배지·버튼까지 전부 `ui-monospace, monospace` 하나로 통일돼 있다. Excalidraw의 구분을 빌리면, **"캔버스 콘텐츠"에 해당하는 건 그룹 라벨(도메인 이름)과 컴포넌트 노드 이름**이고, **"UI 크롬"에 해당하는 건 툴바/버튼/줌 배지/카운트**다. 지금처럼 전부 모노스페이스면 러프 보더를 얹어도 여전히 "터미널/콘솔" 인상이 강하게 남는다 — 손글씨체를 어디까지 쓸지의 답은 "콘텐츠(라벨류)에만, 크롬(버튼/카운트/배지)엔 안 씀"이 Excalidraw의 실제 관례와 일치한다.

**단, 실측 필요한 리스크**: Excalidraw의 캔버스 텍스트는 사용자가 자유롭게 쓰는 짧은 단어/문장이지만, 이 프로젝트의 라벨은 `ComponentNode`, `handleNodeClick` 같은 **camelCase/PascalCase 식별자**다. 손글씨체가 대소문자 붙여쓰기 식별자를 12px(컴포넌트 노드) 크기에서도 읽을 수 있는지는 실제 폰트로 렌더링해 눈으로 확인해야 한다 — 그룹 라벨(13px, 도메인명이라 상대적으로 짧고 단순)은 괜찮을 가능성이 높지만, 컴포넌트 노드 이름(더 작고, 식별자가 더 김)은 판독성이 떨어지면 모노스페이스를 유지하는 게 나을 수 있다. **폰트 자체도 아직 없다** — `Virgil.woff2`가 로컬에 있지만 이건 `experiments/`의 검증용 사본이라 이 프로젝트의 정식 에셋으로 재사용하기보다, Excalifont(Excalidraw의 현재 기본 손글씨 폰트, OFL 라이선스로 배포됨) 또는 유사한 오픈소스 손글씨 웹폰트를 별도로 도입해야 한다.

### 1-4. 여백/밀도

Excalidraw는 `--space-factor: 0.25rem`(4px) 하나의 배수로 모든 padding/gap을 계산한다(`theme.scss`, `Island.scss`, `Stack.scss`). border-radius도 토큰화(`--border-radius-md: 0.375rem`, `--border-radius-lg: 0.5rem`)돼 있다. 이 프로젝트의 `flow.css`는 지금 `10px 16px`, `8px 12px`, `4px 8px`, `6px`, `20px` 등을 그때그때 하드코딩하고 있는데, 크기 자체는 Excalidraw와 비슷한 자릿수(4의 배수 근처)라 밀도 감각은 이미 크게 어긋나지 않는다. 다만 공유 스케일이 없어 값이 늘어날수록 일관성이 흐트러질 수 있다 — 지금 당장 급한 문제는 아니고, 나중에 `flow.css`를 다시 손댈 일이 생기면 `--space-factor` 같은 단일 배수 변수 하나만 도입해도 충분하다(과한 디자인 시스템 투자 없이).

---

## 2. 왜 이 미학인가 (Excalidraw 팀/커뮤니티 근거)

웹 조사 결과, 손그림 스타일은 미학적 취향이 아니라 **의도적인 커뮤니케이션 장치**로 채택됐다: 손그림은 "이건 아직 다듬어지지 않은 작업 중인 것"이라는 신호를 줘서 협업자가 완성도 걱정 없이 편하게 피드백하게 만든다는 게 핵심 근거다. 각 잡힌 다이어그램은 "이미 확정된 것"처럼 보여 피드백을 억제하지만, 스케치는 "아직 대화가 열려 있다"는 인상을 준다.

**이 프로젝트에 대입하면**: react-render-board가 보여주는 건 살아있는 렌더 트리 — 커밋마다 실제로 바뀌는, 정의상 "완성된 게 아니라 지금 이 순간의 스냅샷"인 데이터다. 손그림 미학이 단순히 "예뻐서"가 아니라 **"이 다이어그램은 고정된 아키텍처 문서가 아니라 지금 이 순간을 보여주는 살아있는 관찰"**이라는 이 프로젝트의 정체성과 의미적으로도 맞아떨어진다는 근거가 된다 — 아래 3절의 그룹 프레임 논의에도 이 논리를 적용할 수 있다.

Sources:
- [Excalidraw](https://excalidraw.com/)
- [Why is Excalidraw so fucking good? - Off by one](https://offbyone.us/posts/why-is-excalidraw-so-good/)

---

## 3. 그룹 프레임(GroupNode)에도 rough를 적용할지

### 왜 컴포넌트 노드와 다른 문제인가

`roughStyle.ts`가 컴포넌트 노드에서 "노드 수와 무관하게 0 비용"을 달성한 트릭은 `NODE_WIDTH`/`NODE_HEIGHT`(`layout.ts`, 160×48)가 **모든 노드에 공통인 고정 상수**라는 사실에 전적으로 기댄다 — 그래서 정적 SVG 이미지 딱 2장만 미리 만들어 전부 공유한다.

그룹 프레임은 이 전제가 성립하지 않는다. 프레임 크기는 담긴 자식 수·레이아웃에 따라 그룹마다 전부 다르고, 커밋마다도 바뀔 수 있다(`GroupNode.tsx`가 `style={{ width, height }}`를 인라인으로 받는 이유). "고정 크기 2장 캐싱" 트릭을 그대로 옮길 수 없다.

### 실측 근거로 본 리스크의 크기

ADR-0019에 따르면 berry-admin dashboard가 최대 74개 그룹(수정 전), shadcn-admin 49개 그룹, excalidraw 자체도 80개 그룹까지 나온 바 있다. 하지만 이 그룹들이 전부 **동시에 러프 계산 대상**이 되는 건 아니다 — 이미 `Canvas.tsx`의 `shouldExpandGroup`(ADR-0017, P1)이 지도 모드이거나 뷰포트 밖인 그룹은 프레임만 만들고 내부를 펼치지 않는 구조를 갖고 있다. 즉 "화면에 보이는 상세 모드 그룹"의 실제 동시 개수는 지도 모드의 전체 그룹 수보다 훨씬 작다(줌인할수록 월드 좌표 기준 뷰포트가 좁아지므로).

### 제안 (draft, 미확정)

표기법 조사 문서(`2026-07-17-diagram-notation-conventions.md`)가 이미 제안한 "지도 모드=진한 색, 상세 모드=옅은 색" 아이디어와 자연스럽게 짝지을 수 있는 구조로 나눈다:

| 상태 | 처리 | 근거 |
|---|---|---|
| 접힌 그룹(map mode 또는 뷰포트 밖) | **변경 없음** — 지금의 깔끔한 CSS 점선 테두리 유지 | 이 규모(수십~수백 개)에서 손그림 계산·렌더 비용을 아예 만들지 않는 게 가장 안전하다. "지도는 깔끔, 확대하면 스케치"라는 zoom-semantic 레이어를 부수적으로 얻는다(C4의 "줌아웃=진함/줌인=옅음" 관습과도 결이 맞음). |
| 펼쳐진 그룹(뷰포트 안 + 상세 모드) | rough 적용 검토 — 단, 크기별로 결과를 **메모이즈**(예: width/height를 8px 단위로 반올림한 키로 캐시)해서 같은 크기가 반복되면 재계산 안 함 | `shouldExpandGroup`이 이미 "펼칠지 말지"를 걸러주므로 별도 인프라 없이 재사용 가능. 동시에 펼쳐진 그룹 수는 화면에 보이는 만큼(수 개~수십 개)으로 자연히 제한된다. |

**검증 없이 결정하지 않는다** — CLAUDE.md 원칙(실측 없이 먼저 하지 않는다)대로, 실제로 이 방향을 구현한다면 ADR-0017과 같은 방식으로 대규모 fixture(9,000+ 노드, 74개 그룹)에서 프로파일링해 실제 병목이 되는지 확인한 뒤 필요하면 캐시를 더 정교화하는 순서를 권한다 — 지금 미리 복잡한 캐싱 전략을 설계할 필요는 없다.

**추가로 확인이 필요한 것(제안이 아니라 순수 리스크 플래그)**: 160×48짜리 작은 사각형에서 자연스러워 보이는 `roughness: 0.8, bowing: 0.6` 절대값이, 수백~수천 px짜리 큰 프레임에 그대로 적용됐을 때도 같은 "손으로 한 번에 그은" 느낌을 주는지는 다르다 — 큰 사각형에서는 상대적으로 흔들림이 안 보일 수도, 너무 늘어져 보일 수도 있다. 이건 코드 리뷰가 아니라 실제로 렌더링해서 눈으로 판단해야 하는 부분이라 이 조사만으로는 결론 낼 수 없다.

---

## 4. 다크모드 대비 검증 (계산값)

`roughStyle.ts`는 컴포넌트 노드 러프 보더 색을 라이트/다크 구분 없이 고정 값(`#6366f1` 인디고, `#94a3b8` 회색)으로 한 번만 만들어 공유한다. 반면 `groupColor.ts`는 이미 라이트/다크 각각 다른 hex 쌍을 갖고 있다 — 두 시스템의 다크모드 대응 방식이 일관되지 않다.

실제 다크모드 배경(`flow.css`의 `.react-flow.dark .component-node` / `.component-node--host`)과 대조해 WCAG 대비율을 계산했다:

| 러프 보더 색 | 배경(다크) | 대비율 | WCAG 그래픽 기준(3:1) | WCAG 텍스트 기준(4.5:1) |
|---|---|---|---|---|
| `#6366f1`(현재, composite) | `#1e1b3a` | **~3.7:1** | 통과 | 미달 |
| `#818cf8`(groupColor.ts의 다크 인디고) | `#1e1b3a` | **~5.5:1** | 통과 | 통과 |
| `#94a3b8`(현재, host) | `#1e293b` | **~5.7:1** | 통과 | 통과 |

지금 이 선은 순수 장식(테두리)이라 텍스트 기준(4.5:1)이 아니라 그래픽 기준(3:1)이 적용 대상이고, 그 기준으로는 지금도 통과한다 — 당장 못 쓸 정도로 나쁘진 않다. 다만 여유가 크지 않고(3.7:1은 3:1 기준을 살짝 넘는 수준), `groupColor.ts`가 이미 만들어둔 다크 변형 색상(`#818cf8`)으로 바꾸면 계산상 대비가 3.7→5.5로 뚜렷이 좋아진다.

**제안**: `roughStyle.ts`가 만드는 정적 이미지를 라이트/다크용 각 1쌍(총 4장: composite-light/dark, host-light/dark)으로 늘리고, 다크 변형은 `groupColor.ts`가 이미 검증해둔 다크 인디고(`#818cf8`)를 재사용한다. 여전히 모듈 로드 시 유한 횟수(4회)만 계산하는 구조라 노드 수 비례 비용은 그대로 0이다 — 지금의 "정적 이미지 공유" 설계 원칙을 깨지 않는다.

---

## 5. 타이포그래피/여백 등 전체 톤앤매너 제안

1. **손글씨체는 라벨(그룹명·컴포넌트명)에만, UI 크롬(툴바/버튼/카운트/줌배지)엔 쓰지 않는다** — 1-3절의 Excalidraw 관례를 그대로 따른다. 단, 컴포넌트 노드 이름처럼 짧고 밀도 높은 camelCase 식별자에서 실제로 읽을 수 있는지는 폰트를 실제로 넣고 눈으로 확인해야 한다(제안일 뿐 검증 안 됨).
2. **버튼/툴바 크롬은 지금보다 더 중립적인 색으로 빼는 것을 검토할 만하다.** Excalidraw는 UI 크롬(패널/버튼)을 거의 흰색/회색 계열로 두고, 색은 오직 사용자가 그리는 콘텐츠에만 쓴다. 지금 `.board-toggle`/`.toolbar__theme-toggle`은 이미 인디고 액센트(`#eef2ff` 배경 + `#6366f1` 테두리)를 쓰고 있는데, "크롬은 중립, 콘텐츠(노드/그룹)만 색"이라는 Excalidraw 원칙과는 약간 어긋난다 — 사용자가 "shadcn 기본 스타일이 싫다"고 한 것과 맞물려, 버튼류를 더 무채색에 가깝게 빼고 색을 노드/그룹 쪽에 집중시키는 방향이 "생기 있는 콘텐츠 vs 조용한 크롬"의 대비를 더 살릴 수 있다.
3. **spacing 스케일은 지금 당장 안 급하다.** 값 자체는 이미 Excalidraw와 비슷한 자릿수라 밀도 감각이 크게 어긋나지 않는다 — `flow.css`를 다음에 손댈 기회에 `--space-factor` 같은 단일 배수 변수 하나만 얹으면 충분하고, 지금 이것 때문에 별도 작업을 벌일 필요는 없다.

---

## 6. 결론 요약

| 질문 | 결론(제안, 미확정) |
|---|---|
| roughness/bowing 값을 바꿔야 하나? | 아니다 — 지금 값(0.8/0.6)이 Excalidraw 자체 기본값(1)보다도 절제돼 있고, 작은 도형엔 절제가 맞다는 Excalidraw 자체 규칙과도 일치한다. |
| 8색 팔레트가 Excalidraw 감성과 맞나? | 맞다 — "진한 선 + 파스텔 채움" 구조가 이미 일치한다(테두리=진한 hex, 배경=10% 알파 틴트). 웜톤을 뺀 것도 기존 시맨틱 색과 안 겹치려는 타당한 선택이라 바꿀 필요 없음. |
| 그룹 프레임에 rough를 적용할까? | 접힌/지도 모드 그룹은 그대로 두고, 펼쳐진(상세 모드) 그룹만 크기별 메모이즈 캐시로 rough 적용을 검토 — 단 실제 대규모 fixture로 프로파일링한 뒤 결정. |
| 다크모드 대비는 괜찮나? | 지금도 WCAG 그래픽 기준(3:1)은 통과하지만 여유가 적다(~3.7:1) — `groupColor.ts`가 이미 만든 다크 인디고(#818cf8)로 바꾸면 ~5.5:1로 개선. `roughStyle.ts`를 라이트/다크 2쌍(4장)으로 늘리는 걸 제안. |
| 손글씨체를 어디까지? | 그룹/컴포넌트 라벨(콘텐츠)에만, 툴바/버튼/카운트(크롬)엔 안 씀 — 단 짧은 camelCase 식별자에서 실제 판독성은 폰트를 넣고 눈으로 검증 필요. |
| 나머지 톤앤매너 | 버튼/툴바를 더 중립색으로 빼서 "색은 콘텐츠에만" 원칙을 살리는 걸 검토. spacing 스케일은 급하지 않음. |

---

## 7. 다이어그램 밖 — 전체 UI를 3개 레이어로 나눠서 보기

지금까지(1~6절)는 전부 **콘텐츠**(그룹/컴포넌트 노드) 얘기였다. 이 도구가 실제로 그리는 화면은 성격이 다른 3개 레이어로 나뉜다:

| 레이어 | 예시 | 개수 규모 | 성능 제약 |
|---|---|---|---|
| ① 콘텐츠 (다이어그램) | 그룹 프레임, 컴포넌트 노드 | O(n) — 수백~수천 개 | **있음** — 1~6절이 다룬 캐싱/게이팅이 전부 이것 때문 |
| ② 패널 크롬 (도킹 패널 내부) | 툴바, 검색창, 체크박스, 다크모드 토글 | O(1) — 인스턴스 1개 | 없음 |
| ③ 오버레이/포인터 (호스트 페이지 위에 얹는 것) | 플로팅 버튼(`board-toggle-group`), DOM 하이라이트 박스(`dom-highlight-overlay__box`) | O(1)~O(few) — 버튼 2~3개, 하이라이트 요소 1~3개 | 없음 |

**중요한 발견**: ①의 "정적 이미지 캐싱"·"뷰포트 게이팅" 같은 장치는 전부 "노드가 수천 개일 수 있다"는 문제에서 나온 것이지, rough.js 자체가 원래 느려서가 아니다. ③(플로팅 버튼, DOM 하이라이트 박스)은 애초에 개수가 노드 수와 무관하게 항상 한 자릿수라 **①에서 고민한 성능 제약이 처음부터 적용되지 않는다** — 매 렌더 라이브로 rough.js를 계산해도 전혀 문제없다. 사용자가 "재밌겠다"고 한 지점이 정확히 이 자리다: ①보다 훨씬 자유롭게 실험할 수 있는 영역이다.

②(패널 크롬)는 5절에서 이미 다룬 "크롬은 중립, 색은 콘텐츠에만"(Excalidraw의 UI 크롬=Assistant 산세리프, 캔버스만 손글씨) 원칙을 그대로 적용하는 게 맞다고 본다. ③은 성격이 다르다 — 패널 "안"의 설정 UI가 아니라, 도구가 호스트 페이지 위로 **손을 뻗어 뭔가를 가리키거나 조작하는** 동작에 가깝다(버튼을 눌러 패널을 열고, 하이라이트로 요소를 짚어준다). Excalidraw로 비유하면 ②는 "패널/메뉴"에 가깝고 ③은 오히려 "캔버스 위에 실제로 그려지는 마크"에 더 가깝다 — 그래서 ③은 손글씨/러프 은유를 ②보다 대담하게 써도 Excalidraw의 원래 구분("크롬 vs 콘텐츠")과 모순되지 않는다.

## 8. 플로팅 버튼(`BoardOverlay.tsx`) — 손그림 적용 제안

지금 `.board-toggle`은 `border: 1px solid #6366f1; background: #eef2ff;` 같은 각 잡힌 사각 버튼이다(`flow.css`). 두 개(`🎯 요소 선택`, `render-board 열기/닫기`)뿐이고, **라벨 텍스트 자체가 상태에 따라 길이가 바뀐다**(`요소 선택` ↔ `요소 선택 중… (취소)`, `열기` ↔ `닫기`) — 그래서 애초에 `roughStyle.ts`처럼 "고정 크기 2장을 캐싱"하는 트릭을 쓸 이유도, 필요도 없다(7절의 결론대로 그럴 필요 자체가 없는 O(1) 자리다).

**제안(draft)**:
- 버튼 배경에 rough.js로 그린 손그림 사각/둥근 사각 테두리를 **라이브로**(렌더마다 새로 계산해도 무방) 씌운다.
- `board-toggle--pick-active`(픽 모드 켜짐) 상태에 roughness/strokeWidth를 살짝 올려 "지금 활성 상태"를 선이 더 부산해지는 것으로 표현하는 아이디어 — 색만 바꾸는 지금 방식(`background: #6366f1`)보다 "지금 도구가 활성화돼 있다"는 손짓 느낌을 더 살릴 수 있다.
- 이 자리는 향후 추가될 다른 플로팅 버튼(필터/주석 등 미구현 UX 기능, `project-status.md` 2절 표 참고)에도 그대로 확장되는 공통 컴포넌트로 만들어두면 매번 새로 고민할 필요가 없다.

성능 검증이 필요 없는 자리라 이건 실제로 구현 난이도가 낮다 — 다만 여전히 "실제로 그려보고 눈으로 확인"은 필요하다(조사만으로 최종 톤을 확정할 수 없음).

## 9. DOM 하이라이트 박스("React Scan 스타일") — 손그림 적용 제안 + 아키텍처 주의점

`DomHighlightOverlay.tsx`가 그리는 것: `interactionStore`가 넘긴 실제 DOM 요소의 `getBoundingClientRect()`를 재서 `document.body`에 포탈로 절대좌표 박스를 얹는다(2px 실선 인디고 테두리 + 옅은 배경 wash, `HIGHLIGHT_DURATION_MS=1600ms` 후 자동 소멸). 이 자리도 O(1)~O(few)라 7절 기준으로 손그림을 자유롭게 실험할 수 있다.

**선례 확인**: rough.js와 같은 저자(Preet Shihn, rough-stuff 조직)가 만든 [Rough Notation](https://github.com/rough-stuff/rough-notation)이 정확히 이 문제("이미 존재하는 임의의 DOM 요소를 손그림 스타일로 표시")를 다루는 라이브러리다. `box`/`circle`/`highlight`(형광펜 워시)/`underline`/`strike-through`/`crossed-off`/`bracket` 7종 주석 타입을 제공하고, 애니메이션(기본 800ms, "그려지는" 느낌)이 내장돼 있다(3.83kb gzip). "임의 요소를 손그림으로 짚어준다"는 발상 자체가 이미 검증된 관례라는 근거가 된다.

**단, 그대로 채택하면 안 되는 이유(실제 소스 확인)**: Rough Notation 공식 문서가 명시하길, `annotate()`는 **SVG를 대상 요소의 형제(sibling)로 실제 DOM에 삽입**한다 — 원문: `"This will add an SVG element as a sibling to the element, which may be troublesome in certain situations like in a <table>"`. 이건 이 프로젝트가 지금 `flow.css`/`DomHighlightOverlay.tsx` 주석에서 명시하는 원칙 — **"호스트 페이지 DOM에 손대지 않는다"**(`pointer-events: none`, 포탈로 `document.body`에만 그리고 좌표만 읽음) — 와 정면으로 부딪힌다. 계측 대상이 임의의 제3자 앱(그 자체로 React일 수도 있는)이라, 그 DOM 트리에 형제 노드를 실제로 끼워 넣으면 호스트의 CSS 선택자(`:nth-child` 등)나 React 재조정에 영향을 줄 위험이 있다 — 라이브러리 저자 스스로도 "테이블 같은 구조에서 문제가 될 수 있다"고 인정한 한계다.

**제안(draft)**: Rough Notation을 새 의존성으로 추가하지 말고, **이미 있는 `roughjs` 의존성과 이미 있는 `document.body` 포탈 구조를 그대로 쓰되, 그려지는 내용만 clean CSS border → rough.js SVG로 바꾼다.** 즉 지금처럼 `getBoundingClientRect()`로 좌표만 읽고, 그 좌표에 맞춰 `roughStyle.ts`와 같은 방식(`rough.generator().rectangle(...)`)으로 SVG 경로를 **이번엔 라이브로**(캐싱 불필요, O(few)라서) 그려서 오버레이 안에 넣는다 — 호스트 DOM에는 지금처럼 여전히 아무것도 삽입하지 않는다. Rough Notation의 `highlight` 타입(형광펜 워시)이 주는 발상은 `fillStyle: 'hachure'`(대각선 빗금 채움, Excalidraw의 실제 옵션 중 하나, 1-1절 참고)로 흉내 낼 수 있어 지금의 단순 `rgba` 배경보다 "마커로 표시했다"는 은유가 더 강해진다.
- **애니메이션**: `HIGHLIGHT_DURATION_MS`(1600ms) 동안 나타났다 사라지는 지금 구조에, Rough Notation 식의 "그려지는" 애니메이션(SVG stroke 애니메이션으로 손이 지금 막 그은 것처럼)을 짧게 얹으면 "방금 마커로 짚었다"는 느낌이 강해질 수 있다 — 다만 구체적 구현 방식(stroke-dasharray offset 등)은 이 조사에서 검증하지 않았다.

## 10. 스티키노트 주석 기능과의 연결 (참고)

`docs/project-status.md` 2절의 미구현 UX 표에 있는 "캔버스 주석(스티키노트)" — [`2026-07-17-react-flow-ux-capabilities.md`](2026-07-17-react-flow-ux-capabilities.md)가 공식 `AnnotationNode` 예제로 가능하다고 이미 조사해둔 기능 — 은 손그림 미학과 가장 자연스럽게 맞아떨어지는 자리다. 스티키노트 자체가 종이/손글씨 은유의 원형이라, 이 기능을 실제로 구현할 때가 1-3절에서 다룬 손글씨체를 가장 부담 없이 시험해볼 자리로 보인다(콘텐츠 라벨의 camelCase 판독성 문제도 없다 — 스티키노트는 사용자가 직접 자유 텍스트를 쓰는 자리이므로).

---

## 관련 문서

- 기존 부분 구현: [`src/visualization/lib/roughStyle.ts`](../../src/visualization/lib/roughStyle.ts) · [`groupColor.ts`](../../src/visualization/lib/groupColor.ts) · [`colorModePreference.ts`](../../src/visualization/lib/colorModePreference.ts)
- 오버레이/포인터 레이어(7~9절): [`src/visualization/BoardOverlay.tsx`](../../src/visualization/BoardOverlay.tsx) · [`src/visualization/components/DomHighlightOverlay.tsx`](../../src/visualization/components/DomHighlightOverlay.tsx) · [`src/visualization/lib/interactionStore.ts`](../../src/visualization/lib/interactionStore.ts)
- 다이어그램 표기법 조사(색상 규칙 초안): [`2026-07-17-diagram-notation-conventions.md`](2026-07-17-diagram-notation-conventions.md)
- React Flow UX 기능 조사(스티키노트 포함): [`2026-07-17-react-flow-ux-capabilities.md`](2026-07-17-react-flow-ux-capabilities.md)
- UI 철학("색상은 되돌리기 쉬운 영역"): [`../ui-philosophy.md`](../ui-philosophy.md)
- 뷰포트 기반 부분 재계산(그룹 프레임 rough 캐싱 논의의 전제): [ADR-0017](../decisions/0017-viewport-based-partial-recompute.md)
- 그룹 수 실측치: [ADR-0019](../decisions/0019-library-hint-whitelist-inversion.md)
- 양방향 인터랙션(하이라이트 박스의 배경): [ADR-0024](../decisions/0024-board-dom-bidirectional-interaction.md) · [ADR-0026](../decisions/0026-bidirectional-interaction-implementation.md)

## 출처

**Excalidraw 소스 (로컬 체크아웃, `experiments/real-app-validation/excalidraw/`)**
- rough.js 옵션: `packages/element/src/shape.ts` (`generateRoughOptions`, `adjustRoughness`)
- roughness 프리셋/기본값, stroke width: `packages/common/src/constants.ts`
- 색 팔레트: `packages/common/src/colors.ts` (`COLOR_PALETTE`, 다크모드 필터 `applyDarkModeFilter`)
- 폰트: `packages/common/src/constants.ts`(`FONT_FAMILY`), `packages/excalidraw/css/styles.scss`(`--ui-font`), `packages/excalidraw/index-node.ts`
- spacing 토큰: `packages/excalidraw/css/theme.scss`, `Island.scss`, `Stack.scss`

**웹**
- [Excalidraw](https://excalidraw.com/)
- [Why is Excalidraw so fucking good? - Off by one](https://offbyone.us/posts/why-is-excalidraw-so-good/)
- [Rough Notation (GitHub, rough-stuff)](https://github.com/rough-stuff/rough-notation) — DOM 요소를 형제 SVG로 삽입하는 방식(README에 명시) 확인, 새 의존성으로 채택하지 않기로 한 근거
