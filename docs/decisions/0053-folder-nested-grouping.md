# ADR-0053: 폴더 단위 2단 중첩 그룹핑 (folder > file > component)

- 상태: 채택됨(구현)
- 날짜: 2026-07-18

## 맥락 (Context)

그룹핑은 파일 단위였다 — 컴포넌트를 "그 JSX가 쓰인 소스 파일"(사용 위치, ADR-0007)로 묶어 프레임 하나로 그린다. 사용자는 한 단계 위인 **폴더 단위**로도 묶고 싶어 했다(예: `domains/dataflow/` 폴더가 `DataFlowPanel.tsx` + `StateFlowDemo.tsx` 두 파일 그룹을 하나의 도메인으로). 이는 다음 작업인 downfall(barycenter) 레이아웃이 배치할 "그룹 단위(입자성)"를 먼저 확정하는 의미가 있다.

**예전엔 막혔던 이유(조사로 규명):** 그룹핑이 쓰는 bippy `getSource`는 Vite 소스맵을 심볼리케이션하며 경로를 파일명만으로 깎는다 — 소스맵 `sources`가 실제로 `["DataFlowPanel.tsx"]`라 폴더 정보가 원천에 없다. **지금 되는 이유:** React 19 파이버의 `_debugStack`(owner 스택)에 전체 경로가 URL로 살아있다(`at DemoApp (…/src/fixtures/DemoApp.tsx:106:20)`) — DevTools와 같은 런타임 파이버 관찰이지, 우리 레포 파일을 읽는 게 아니다. 이걸 직접 파싱해 폴더를 복구한다. 실측으로 fixture 컴포넌트 전부(40개) 경로 복구 성공. dev 전용이지만 `getSource`도 dev 전용이라 지원 범위 축소 아님. 경로가 없으면 파일 그룹핑으로 폴백.

## 검토한 대안 (Options)

- **파일↔폴더 전환 토글(평면)** — 그룹 키를 파일명→상위폴더로 바꾸는 토글. 기존 프레임/레이아웃을 그대로 재사용해 위험이 가장 낮지만, 폴더와 파일을 동시에 보여주지 못한다.
- **2단 중첩(폴더 프레임 > 파일 프레임 > 컴포넌트)** — 채택(사용자 선택). 폴더가 파일 그룹들을 감싸는 바깥 프레임. 정보량이 가장 크다(폴더와 그 안 파일 구조를 한눈에). 레이아웃 엔진에 바깥 배치 레벨을 더해야 하지만, 아래 설계로 코어 재작성 없이 얹었다.
- **폴더 깊이 슬라이더** — src 기준 N단계. 유연하지만 UI 복잡하고, 대개 "상위 폴더 1단"이면 충분해 과설계.

## 결정 (Decision)

**툴바 "폴더로 묶기" 토글(`nestFolders`, 기본 off)로 켜면 파일 그룹을 상위 폴더 프레임으로 묶는다.** React Flow 3중 부모 중첩: `folder:<path>` > `group:<fileKey>` > component. churn 최소화 지렛대 셋:

1. **그룹 키는 그대로 파일 basename.** 새 `groupPath`(전체 경로, `_debugStack` 파싱)는 **폴더 키 유도(=dirname)에만** 쓴다. 그룹 키를 전체 경로로 바꾸면 `colorIndexForGroup` 해시가 전부 바뀌고 "토글 끄면 기존과 동일" 보장이 깨진다.
2. **`LayoutResult`의 모든 `frame`은 월드 좌표 유지.** 그래야 `shouldExpandGroup(frame, group)` 뷰포트 컬링 계약이 안 변한다(Canvas 무변경). toFlow가 emit 시점에만 폴더-상대 좌표로 변환.
3. **폴더 프레임은 파일 그룹 ≥2개일 때만.** 1개면 폴더 박스가 파일 프레임과 겹쳐 중복이라 파일 프레임을 그냥 최상위 밴드에 둔다. 2번째 파일이 들어오면 폴더가 생기고 두 파일이 안으로 — 실제 구조 변화라 재배치 정당.

- **엔진(`layout.ts`)**: 기존 밴드 배치(2·3단계)를 공유 함수 `packUnits`로 추출해 두 레벨에서 재사용 — 폴더 안 파일 배치(안쪽 미니 waterfall, 깊이는 폴더 내 최소=0 정규화)와 최상위 단위(폴더+단독 그룹) 배치(바깥). `computeLayout(nodes, { nestFolders })`, off면 기존 평면 코드 그대로 + `folders: []`(바이트 동일). 순서 안정성: 폴더의 자리 = 멤버 그룹의 **최소 groupOrder 인덱스**(가장 먼저 등장한 파일 슬롯 상속) → 파일이 늘어도 폴더 자리 불변.
- **`toFlow.ts`**: 그룹 루프 전에 `type:'folder'` 프레임을 먼저 push(부모-먼저 규칙). 중첩 그룹은 `parentId=folder:<path>` + `position = 월드 - 폴더 월드`. 컴포넌트/엣지/boundary-frame 무변경(컴포넌트는 여전히 `parentId:group:<key>`).
- **`FolderNode.tsx`**: 새 노드 타입(GroupNode 오버로드 안 함) — 파일 프레임 고유 관심사(rough 테두리/경계 링/heat/팔레트)를 안 섞고, `boundaryFrames.ts`가 `type==='group'`으로 키잉해 폴더를 자동 무시하게. zIndex:-2(파일 프레임 -1 뒤), 은은한 실선 + 폴더 라벨(줌 역-스케일).

## 근거 (Rationale)

- **데이터 원천의 정직한 활용.** 폴더는 런타임 파이버 `_debugStack`에서 온다(대상 앱 자신의 구조). 못 얻으면 파일 그룹핑으로 조용히 폴백해 안전.
- **코어 재작성 회피.** 월드 좌표 유지 + shape B(flat groups + 병렬 folders) + `packUnits` 재사용으로, 컬링/검색/추적/boundary 로직을 하나도 안 건드렸다. 토글 off는 바이트 단위로 기존과 동일(유닛으로 못박음).
- **구조 안정성 유지.** 폴더가 최초 등장 파일의 슬롯을 상속해, 파일이 늘어도 디바 그램이 안 흔들린다(ADR-0008 원칙).

## 결과 (Consequences)

- **바뀐 것**: `sourceHints.ts`(`usagePathFromStack` + `groupPath` 반환), `types.ts`/`store.ts`(`groupPath` 캐시), `normalize.ts`(그룹→경로 맵 + `VisibleNode.groupPath`), `layout.ts`(`packUnits` + nested 경로 + `folders`/`parentFolder`), `toFlow.ts`(folder 프레임 emit + 중첩 좌표 + `FolderNodeData`), 새 `FolderNode.tsx`, `Canvas.tsx`(`nestFolders` 상태·toFlow 전달·"폴더로 묶기" 체크박스), `flow.css`(`.folder-node` + 다크).
- **검증**: `tsc` 클린, 유닛 316개 통과(신규: `usagePathFromStack` 4, 엔진 nested 5, toFlow nested 3, flat byte-identical 포함). Playwright 실측 — 토글 off→folder 0, on→`dataflow` 폴더(count 11) 안에 DataFlowPanel/StateFlowDemo 두 파일 프레임이 **공간적으로 포함**, off로 되돌리면 folder 0, 콘솔 에러 0. React Flow 음수-z 3중 중첩 시각 확인(스크린샷).
- **되돌리기 쉬움**: 토글 off면 기존 파일 뷰. 데이터/색/컬링 로직 불변.
- **남긴 것(후속)**: 폴더 단위 수동 접기(현재 수동 접기는 파일 그룹 단위), 폴더 프레임 뷰포트 컬링 최적화(현재 폴더 프레임은 항상 emit — 라벨뿐이라 저비용), 폴더 색/경계 링 요약, 폴더 1↔2 파일 진동 시 재배치. basename→2폴더 매핑은 첫 등장으로 결정적(기존 basename 충돌의 잔여 케이스).
- **관련 문서**: 그룹핑 힌트 [ADR-0007](0007-grouping-hint-feasibility.md), 그룹핑 노이즈/화이트리스트 [ADR-0019](0019-library-hint-whitelist-inversion.md), 그룹 waterfall [ADR-0034](0034-group-level-waterfall-layout.md), 뷰포트 컬링 [ADR-0017](0017-viewport-based-partial-recompute.md), 리스트 접기 [ADR-0046](0046-list-coalescing.md).

## 다음 (이 작업 후)

downfall(barycenter) 레이아웃 — 이제 확정된 top-level unit(폴더+단독 그룹)과 폴더 내부에 barycenter 정렬을 적용해 간선 교차를 줄인다(레이아웃 안정성 라운드 2/3).
