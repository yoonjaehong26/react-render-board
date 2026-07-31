# 0077. Netlify 데모는 production이 아니라 development 모드로 빌드한다 (`npm run build:demo`)

- 상태: 채택
- 날짜: 2026-07-31
- 관련: ADR-0076(훅 설치 순서), Netlify 데모 배포

## 맥락

ADR-0076으로 훅 설치 순서 문제를 고쳐 배포된 데모가 커밋을 잡기 시작했다(93/347 노드). 그런데 재배포 후 사용자가 스크린샷을 보내왔다 — 그룹 이름이 번들 URL(`https://…/assets/index-xxx.js`)이고, 노드 이름이 `z`, `Wn`, `Zr`, `tr` 같은 한두 글자였다.

원인은 이 도구가 애초에 dev 전용으로 설계됐다는 전제 자체에 있다:

- **컴포넌트 이름**: React **production** 빌드는 함수/클래스 이름을 유지하지 않고(또는 Vite/rolldown이 identifier를 `z`, `Wn`처럼 minify), `getDisplayName`이 그 뭉개진 이름을 그대로 돌려준다.
- **그룹핑(`sourceHints.ts`)**: `getSource(fiber)`(bippy)는 프로덕션 sourcemap이 없으면 실패하고, `usagePathFromStack`이 파싱하는 `_debugStack`은 **React development 빌드에만 존재하는 owner 스택**이다(ADR-0007). 프로덕션 React 파이버엔 `_debugStack` 자체가 없다 — 그래서 `groupPath`가 전부 null이 되고, `groups.ts`의 폴백 그룹핑이 조상까지 거슬러 올라가다 결국 번들 파일 URL(스크립트 태그의 `src`)에 수렴한 것으로 보인다.

`npm run build`(`vite build`, 기본 production 모드)로는 이 두 전제 중 어느 것도 못 채운다. `VITE_IS_DEMO` 플래그(직전 커밋)는 "계측을 켤지"만 결정할 뿐, "켜진 계측이 쓸모 있는 데이터를 낼지"는 별개 문제였다.

## 결정

데모 전용 빌드 스크립트를 추가한다:

```json
"build:demo": "tsc -b && NODE_ENV=development vite build --mode development --minify false --sourcemap true"
```

- `--mode development` + `NODE_ENV=development`: Vite/React가 development 번들을 내보내게 해 `_debugStack`을 포함한 파이버 정보를 보존한다.
- `--minify false`: 함수/클래스 이름이 원본 그대로 남는다(`getDisplayName`이 뭉개진 이름 대신 실제 이름을 돌려줌).
- `--sourcemap true`: `getSource`(bippy)가 파일명을 심볼리케이션할 수 있게 한다.

`netlify.toml`의 `command`를 `npm run build` → `npm run build:demo`로 바꿨다.

## 결과

- 로컬 `vite preview` + Playwright 실측: 200% 줌에서 `Button`/`Boundary`/`Faulty` 등 실제 컴포넌트 이름과 `SHELL`/`FAR DIALOG` 등 정상 그룹 프레임 확인(이전엔 `z`/`Wn` + 번들 URL 그룹).
- **번들 크기가 커진다**(minify 없음, ~520KB → ~1.6MB) — 데모 사이트는 정적 호스팅이라 무관하지만, 이 스크립트를 다른 용도로 재사용하지 않는다(라이브러리 소비자용 `build:lib`은 그대로 프로덕션 최소화 유지).
- 교훈: "dev 게이트를 통과시키는 것"과 "dev 전용 정보(컴포넌트 이름, `_debugStack`)가 실제로 번들에 남아있는 것"은 서로 다른 전제다 — 이 도구를 어떤 형태로든 배포할 때는 둘 다 확인한다.
