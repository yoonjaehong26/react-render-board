# ADR-0063: 커밋 전 타입체크 규칙 — `npm run typecheck` 한 줄로 방지, CI는 아직 안 함

- 상태: 채택됨
- 날짜: 2026-07-18

## 맥락 (Context)

문서-현실 정합성 검토(1축) 중, **커밋된 `main`이 `npm run build`에서 타입 오류로 실패**하는 것을 발견했다:

```
src/data/store.test.ts(93,54): error TS2741: Property 'groupPath' is missing
  in type '{ id: number; groupHint: string; }' but required in type 'GroupHintResult'.
  (그 외 116·129·148행 동일, 총 4곳)
```

ADR-0053(폴더 중첩 그룹핑)이 `GroupHintResult`에 `groupPath: string | null`을 **필수**로 추가했는데, `store.test.ts`의 mock 객체 4곳이 갱신되지 않은 채 커밋됐다. 이 상태로 여러 커밋이 며칠간 쌓였다.

문제의 핵심은 오류 자체가 아니라 **아무 신호 없이 방치됐다**는 것이다. 세 개의 안전망이 이 오류를 전부 놓쳤다:

1. **`npm run test`(vitest)** — esbuild가 타입을 스트립하므로 타입 오류를 못 잡는다. 335개 테스트가 전부 초록이었다.
2. **`npm publish`(0.2.0)** — `prepublishOnly` → `build:lib`가 `tsconfig.lib.json`(테스트 파일 제외)만 타입체크하므로 통과했다. 즉 **출하물은 멀쩡했고 배포도 정당**했다 — 이 오류는 테스트 파일에만 있어 `dist-lib`에 안 들어간다.
3. **CI 없음** — push 시 검증하는 것이 없다(게다가 `origin/main`은 43커밋 뒤처져 아무것도 push되지 않은 상태였다).

`tsc`를 포함하는 유일한 명령은 `npm run build`인데, 여러 세션이 병행 편집하는 동안 아무도 이를 커밋 전에 돌리지 않았다.

## 검토한 대안 (Options)

- **A. 규칙 한 줄만 (무-도구)** — `typecheck` npm 스크립트(`tsc -b`) 추가 + CLAUDE.md에 "커밋 전 1회" 규칙. 새 의존성/훅/CI 없음. 강제력은 규율에 의존.
- **B. 네이티브 git pre-commit 훅** — `core.hooksPath`로 레포에 커밋되는 훅에서 `tsc` 자동 실행, 실패 시 커밋 차단. husky 등 의존성 없이 셸 스크립트만. 단, 각 clone에서 `hooksPath` 1회 설정 필요, `--no-verify`로 우회 가능.
- **C. GitHub Actions CI** — push/PR마다 `build`+`test`. 가장 강하지만, 현재 origin이 43커밋 뒤처지고 로컬 병행 세션이 주 워크플로라 지금은 발동 시점이 실제 커밋보다 한참 늦다.

## 결정 (Decision)

**대안 A.** `npm run typecheck`(`tsc -b`) 스크립트를 추가하고, CLAUDE.md 빠른 시작에 "커밋 전 `npm run typecheck` 1회" 규칙을 명시한다. pre-commit 훅과 CI는 **지금은 도입하지 않는다.**

## 근거 (Rationale)

CLAUDE.md의 대원칙 — **"과한 프로세스/도구 투자를 하지 않는다. CI/CD 등은 실제로 막힌 증거 없이 먼저 하지 않는다. 선행 프로젝트들은 기술이 아니라 이런 곁가지에 시간을 쓰다 동기를 잃고 죽었다"** — 을 그대로 적용했다.

이번 사건은 그 원칙이 요구하는 "막힌 증거"를 처음으로 만들었다. 하지만 증거가 가리키는 **근본 원인은 "CI가 없어서"가 아니라 "아무도 `tsc`를 안 돌려서"**다. 가장 작은 개입(무-도구 규칙 + 전용 스크립트)이 그 원인을 정확히 겨냥한다. 훅·CI는 이 규칙이 실제로 안 지켜진다는 **추가 증거가 쌓이면** 그때 올린다(대안 B가 다음 후보 — 병행 세션이 사람 기억에 의존하지 않으므로 이 레포 현실에 더 맞는다).

## 결과 (Consequences)

- `store.test.ts` 4곳에 `groupPath: null`을 채워 `npm run build`/`npm run typecheck`를 초록으로 복구했다(테스트는 groupHint 캐싱만 검증하므로 `null`이 가장 정직한 값).
- `docs/project-status.md`의 낡은 테스트 수(184 → **335**, 데이터 25 → **29**)도 같은 라운드에 정정했다.
- 강제력이 규율에 의존하므로 **다시 새어나갈 수 있다.** 그 재발이 곧 대안 B/C로 올릴 다음 증거다 — 되돌리기 쉬운(스크립트+문서 한 줄) 선택이라 언제든 강화 가능.
- 파생 통찰: `build:lib`(publish 게이트)와 `build`(개발 타입체크)의 tsconfig 범위가 달라, **"배포 성공"이 "타입체크 통과"를 보장하지 않는다.** 배포 초록불을 코드 건강의 증거로 읽으면 안 된다.
