# react-render-board

작업 시작 전 반드시 [`docs/project-status.md`](docs/project-status.md)를 먼저 읽는다. 지금까지의 전체 조사·실험·검증·결정을 요약한 살아있는 스냅샷이며, 필요한 개별 ADR([`docs/decisions/`](docs/decisions/))로 링크가 연결돼 있다. 이 파일부터 읽지 않고 코드나 문서를 바로 고치지 않는다.

## 이 프로젝트의 원칙

- **코드는 버려도 되지만, 왜 이렇게 결정했는지는 버리면 안 된다.** 의미 있는 결정을 내렸으면 `docs/decisions/`에 다음 빈 번호로 ADR을 추가하고, `docs/decisions/README.md` 인덱스와 `docs/project-status.md`를 갱신한다.
- **과한 프로세스/도구 투자를 하지 않는다.** CI/CD, 컨트리뷰팅 가이드, 린트 규칙 확장, 새 프레임워크/네이티브 언어(Rust 등) 도입은 실제로 막힌 증거(예: 프로파일링 결과) 없이 먼저 하지 않는다. 이 프로젝트가 조사한 선행 프로젝트들은 기술이 아니라 이런 종류의 곁가지에 시간을 쓰다 동기를 잃고 죽었다.
- **여러 세션이 동시에 이 레포를 건드릴 수 있다.** 작업 전 `git status`와 최근 ADR 번호를 확인해 충돌을 피한다. 예상 밖의 파일 변경을 발견하면 임의로 덮어쓰지 말고 사용자에게 확인한다.

## 빠른 시작

- `npm run dev` — 라이브 MVP 실행 (좌: 계측 대상 데모 앱, 우: 실시간 보드)
- `npm run build` — 타입체크 + 빌드
- `npm run typecheck` — 타입체크만 (`tsc -b`, 빌드 산출물 없이 빠르게)
- `npm run build:lib` — 라이브러리 빌드 (`src/index.ts` 공개 API, `dist-lib/` — 실제 npm publish는 별도, ADR-0023)
- `npm run lint` — oxlint
- `npm run test` — 레이어별 유닛 테스트 (vitest, `npm run test:watch`로 반복 실행)
- `npm run verify` — 자체 fixture 회귀 검증 (Playwright)

> **커밋 전 `npm run typecheck`를 1회 돌린다.** `npm run test`(vitest)는 타입을 스트립해 타입 오류를 못 잡고, `npm publish`는 `build:lib`(테스트 파일 제외)만 타므로, 테스트 파일의 타입 드리프트가 세 안전망을 전부 빠져나간 채 커밋이 쌓일 수 있다(실제로 발생 — ADR-0063). CI 없이 이 한 줄로 막는다.
