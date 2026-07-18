# ADR-0042: npm 공개 배포 준비 + MIT 라이선스

- 상태: 채택됨(배포 준비 완료 — 실제 `npm publish`는 소유자 계정으로 실행)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0023](0023-production-hardening-tests-and-package-prep.md)이 "패키지 배포 준비(공개 API·`build:lib`·peerDependencies)는 하되 **실제 npm publish는 스코프 밖**"으로 두었고, [`project-status.md`](../project-status.md) 7-2가 "배포/생존 전략(오픈소스화 여부)은 **기능 완성 후 논의**"로 의도적으로 보류했다. [ADR-0036](0036-distribution-connection-implementation.md)에서 연결 방식(CLI init + 번들러 주입)이 Vite·Turbopack·webpack 세 경로 모두 원커맨드로 캔버스까지 실측 완료되면서, "개발자가 실제로 설치해 쓸 수 있는가"의 마지막 남은 조각이 **실제 npm 등록**만 남았다.

소유자가 "지금 등록하고 나중에 오픈소스에 맞게 다듬는다"는 방향으로 배포를 결정했다. 이 ADR은 그 결정과 배포 준비 내용을 기록한다.

## 오해 정리 — publish ≠ 소스 공개

핵심 전제: **npm publish는 소스 저장소를 공개하는 것이 아니다.** `package.json`의 `"files": ["dist-lib", "cli"]`가 배포 범위를 제한하므로, 실제로 올라가는 것은:

- 올라감: `dist-lib`(빌드된 번들 JS + `.d.ts`), `cli`(CLI/플러그인 JS), `package.json`, `README.md`, `LICENSE`
- 안 올라감: `src/`(TypeScript 원본), `docs/`, `experiments/`, `scripts/`

즉 엔진 소스(`src/`)는 번들된 형태로만 나간다. 다만 npm 공개 레지스트리라 **배포된 JS 아티팩트는 누구나 설치·열람 가능**하다(특히 `cli/*`는 비번들 JS). "실행은 되지만 코드는 숨김"이 아니라는 점은 감수한다. "오픈소스"(공개 저장소 + 라이선스로 소스를 의도적으로 여는 것)는 별개 결정이며, 지금은 MIT 라이선스만 부여하고 저장소 공개/커뮤니티화는 이후로 둔다.

## 결정 (Decision)

**MIT 라이선스로 `react-render-board`를 npm 공개 레지스트리에 배포한다. 시작 버전 `0.1.0`.**

배포 준비로 다음을 반영했다:

- `package.json`: `"private": true` 제거, `version` `0.0.0`→`0.1.0`, `license: "MIT"`, `author`, `repository`/`homepage`/`bugs`(GitHub), `keywords`, `publishConfig.access: "public"`, `engines.node: ">=18"`, `scripts.prepublishOnly: "npm run build:lib"`(publish 직전 항상 새로 빌드하는 게이트).
- `LICENSE`(MIT) 신규.
- `README.md`에 "설치 & 사용" 섹션 추가(`npm install` → `npx react-render-board init` → `npm run dev`, 번들러별 표), 라이선스 줄을 "미정"→MIT로.

`npm pack --dry-run`으로 배포 산출물을 실측 검증했다: `react-render-board-0.1.0.tgz`, 49개 파일, 패키지 75.2 kB — `dist-lib`(공개 API+inject 런타임)·`cli`·`README`·`LICENSE`·`package.json`만 포함, `src/`·`docs/`·`experiments/` 없음.

## 근거 (Rationale)

- **이름 사용 가능**: `npm view react-render-board` → 404(미등록). 선점 리스크 없음.
- **MIT**: 선행 프로젝트(React-Sight 등) 대부분 MIT라 참고 코드 활용에 유리하고, "나중에 오픈소스화" 방향과도 정합적. 없으면 "all rights reserved"라 남이 법적으로 못 쓴다.
- **`prepublishOnly`로 빌드 게이트**: publish 직전 `build:lib`가 강제 실행돼, 낡거나 깨진 `dist-lib`가 올라가는 걸 막는다.
- **`0.1.0`(1.0.0 아님)**: 아직 "제품 완성"이 아니라 "설치해 쓸 수 있는 초기 버전"임을 semver로 표현. 이후 다듬어 올린다.

## 결과 (Consequences)

- **실제 업로드는 소유자가 실행**: `npm publish`는 npm 계정 인증이 필요하고(현 환경 `npm whoami` → ENEEDAUTH), 72시간 후 사실상 삭제 불가한 **되돌리기 어려운 공개 행동**이라, 도구/에이전트가 임의 실행하지 않는다. 준비는 여기까지 끝났고, 소유자는 아래 pre-flight만 확인 후 `npm publish` 한 번으로 배포한다.
- **Pre-flight 체크리스트**:
  1. `npm run build:lib` 그린 (현재 동시 세션의 `roleMarkers`/`Canvas.tsx` 진행 중 편집으로 일시 red — 그 편집이 끝나야 함).
  2. `npm run lint` 그린.
  3. `npm login`(또는 토큰) 후 `npm whoami` 확인.
  4. `npm publish`(공개). 첫 배포 후 이름·각 버전은 선점된다.
- **되돌리기**: package.json/README/LICENSE 변경은 로컬이라 되돌리기 쉽다. 그러나 **일단 `npm publish`한 뒤에는** 되돌리기 어렵다(unpublish 제약).
- **전략 보류 일부 해제**: project-status 7-2의 "배포는 완성 후 논의"를 이 결정으로 부분적으로 연다 — 단 "저장소 공개/커뮤니티 확산"까지 여는 것은 아니고, "설치 가능한 패키지 배포"까지다.

## 관련
- 배포 준비 선행: [ADR-0023](0023-production-hardening-tests-and-package-prep.md) · 연결 방식 구현: [ADR-0036](0036-distribution-connection-implementation.md)
