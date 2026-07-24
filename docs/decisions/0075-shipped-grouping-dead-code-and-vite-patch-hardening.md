# ADR-0075: 배포판 그룹핑 죽은 코드(ADR-0067 재발) 수정 + Vite 패치 정규식 경화

- 상태: 채택됨
- 날짜: 2026-07-24

## 맥락 (Context)

오픈소스 기여자 유치(ADR-0074)에 앞서 npm 배포 대상 코드(`dist-lib`의 소스 + `cli/`)를 "커뮤니티의 어떤 개발자라도 합리적이라 느낄 수준인가" 기준으로 레이어별(cli / 훅킹·데이터 / 시각화) 검토했다. 타입 위생(`any`·`@ts-ignore` 0), 성능 불변식(ADR-0017/0050) 준수, 테스트 1:1 커버리지는 상위권으로 확인됐으나, **배포 산출물을 손상시키는 결함 두 종류**가 나왔다.

### 결함 1 (CRITICAL) — 배포된 모든 버전에서 그룹핑이 죽어 있었음
`src/data/store.ts`의 groupHint 해석 게이트가 `if (!import.meta.env.DEV) return`로 되어 있었다. 이는 **ADR-0067이 "중대 사고"로 기록하고 `docs/architecture.md` 불변 규칙 2번으로 금지한 바로 그 패턴**이다: `build:lib`(production `vite build`)이 `import.meta.env.DEV`를 리터럴 `false`로 정적 치환 → `if (!false) return` → 뒤따르는 `resolveGroupHints`/`sourceHints` 전체가 트리셰이킹으로 제거. ADR-0067 수정이 `fiberInspector.ts`/`domInteraction.ts`에만 적용되고 `store.ts`는 누락됐다.

- 실측(수정 전 `dist-lib`): `getSource`/`sourceHints`/`bippy source` import **0건**.
- git blame: 이 라인은 라이브 MVP 최초 커밋부터 존재 → **npm에 배포된 모든 버전(0.1.0~0.2.3)에서 도메인 그룹핑(이 도구의 핵심 정체성)이 한 번도 동작한 적 없음.** 노드가 영구히 "(그룹 확인 중…)"에 남는다.
- 세 안전망이 전부 놓친 이유는 ADR-0067과 동일: 데모(`npm run dev`)·vitest는 DEV=true라 정상 동작, e2e 매트릭스는 "노드 N개"만 보고 그룹 라벨은 검증 안 함.
- ADR-0071(실사용 "77개 전부 그룹 확인 중 영구 정지", 근본 원인 미규명)의 증상과 정확히 일치한다 — 설치 사용자에게는 ADR-0071/0073의 타임아웃·동시성 코드가 애초에 실행되지 않았으므로, 그 리포트의 실제 원인이 이것이었을 개연성이 높다(단정 아님 — hang 결함 자체도 유닛 테스트로 실증된 실재 결함).

### 결함 2 (CRITICAL, cli) — Vite config 자동 패치가 흔한 config를 문법 오류로 파손
`cli/init-core.mjs`의 `initVite`가 정규식으로 사용자 vite.config를 수정하는데:
- **C2**: `/^\s*import\s.+?$/gm`로 "마지막 import 뒤"를 찾아 삽입 → 마지막 import가 멀티라인(Prettier가 긴 import를 여러 줄로 쪼갠 흔한 포맷)이면 첫 줄 `import {`까지만 매칭돼 **중괄호 한가운데에** 새 import를 삽입 → config 문법 오류.
- **C3**: 파일 내 **첫** `plugins: [` 매치를 치환 → `css: { postcss: { plugins: [...] } }`나 `worker.plugins`가 최상위보다 앞에 있으면 엉뚱한 배열에 주입 → dev 서버 파손.
- postinstall이 자동 실행되므로 `npm install`만으로 사용자 빌드를 깨뜨릴 수 있는 조합. 백업/git-dirty 확인도 없음.
- 대조: webpack 어댑터(`webpack.cjs`)는 "파싱하지 않고 파일 끝에 wrap 한 줄 추가 + 모호하면 폴백" 원칙이라 안전 — Vite 경로만 취약한 문자열 수술을 하고 있었다.

## 검토한 대안 (Options)

- 결함 1: (A) `store.ts`만 `isDevEnvironment()`로 교체. (B) A + **재발 방지 가드**(같은 사고 3회차 방지). → B. 한 줄 수정으로는 "네 번째 파일에서 또 재발"을 못 막는다.
- 결함 2: (A) 정규식을 더 정교하게. (B) webpack식 "모호하면 폴백" 원칙을 Vite에도 적용 + import는 파일 맨 앞(ESM 호이스팅). → B. 정교한 정규식은 config 문법의 무한한 변형을 못 이긴다 — "확실할 때만 자동, 아니면 수동 안내"가 파손보다 낫다.

## 결정 (Decision)

1. **결함 1**: `store.ts`의 게이트를 `if (!isDevEnvironment()) return`으로 교체(`import.meta`를 안 건드리는 런타임 체크라 정적 치환에 안 걸림). 근거 주석에 ADR-0067/0075 명시.
2. **재발 방지 가드**: `src/hooking/devEnvironmentGuard.test.ts` — 주석을 걷어낸 소스에서 `import.meta.env`가 `devEnvironment.ts` 밖에 실행 코드로 존재하면 `npm run test`가 실패. `import.meta.glob('?raw')`로 로드(node:fs 미의존, jsdom 동작). **CI 없이 유닛 테스트 한 개로 막는다**("과한 프로세스 금지" 원칙, ADR-0063과 같은 결).
3. **빌드 산출물 실증**: 수정 후 `build:lib` → `dist-lib` 청크에 `getSource`/`groupHint`(21+13건)/`RRB_DEV`/`getSource 타임아웃` 콘솔 문자열이 실제로 존재함을 확인(수정 전 0건 → 생존).
4. **결함 2**: Vite 패치를 순수 함수 `patchViteConfig(src)`로 추출(`init-core.mjs`가 export, next.mjs/webpack.cjs의 순수 패처 패턴과 통일) — import는 파일 맨 앞에 붙이고(멀티라인 import 파손 제거), `plugins:[` 매치가 **정확히 1개일 때만** 자동 주입(0개=배열 없음, 2개+=모호 → 둘 다 수동 안내 폴백). 유닛 테스트 `cli/initVite.test.mjs`(멀티라인 import·중첩 plugins·happy·멱등 5케이스). vitest include에 `cli/**/*.test.mjs` 추가.

## 근거 (Rationale)

- 그룹핑은 이 도구의 정체성이라 "조용히 죽어 있음"은 기능 부재보다 나쁘다(사용자는 도구가 고장 났다고 판단). 한 줄 수정이지만 사고의 본질은 "금지 패턴이 grep 없이 재발했다"이므로, 수정보다 **가드가 본체**다.
- Vite 패치는 "편의 기능이 사용자 빌드를 깨뜨리면 안 된다"는 게 절대 우선 — 자동 처리 범위를 좁히더라도 파손 0이 옳다. 순수 함수 추출로 불변 규칙 7("고쳤다는 주장은 테스트로")도 만족.

## 결과 (Consequences)

- **배포 필요**: 0.1.0~0.2.3 사용자는 그룹핑이 죽은 버전을 쓰고 있다. 미배포 상태인 `0.2.4`에 이 수정을 담아(또는 `0.2.5`로) 내보내야 한다 — publish는 소유자 2FA 행동.
- Vite 자동 패치 커버리지가 소폭 축소된다(중첩 plugins 있는 config는 수동 안내로 폴백). 파손 위험과의 트레이드오프로 의도된 것이며, 폴백 시 `printViteManual()`이 정확한 수동 절차를 출력한다.
- 남은 검토 후속(별도 진행): postinstall 자동 수정 정책 축소 여부(소유자 결정 필요), 사용자 대면 문자열 영어화(콘솔·UI·생성 파일), BoardContent(약 1,060줄) 훅 추출·`layoutForest` 이름 충돌·`absPos` 중복 정리. 이들은 파손이 아니라 품질/접근성 개선이라 이 커밋과 분리한다.
- e2e 매트릭스에 그룹 라벨 단언 추가는 후속 과제로 남긴다(가드 유닛 테스트 + 빌드 실증으로 이번 재발 경로는 이미 이중으로 막힘).
