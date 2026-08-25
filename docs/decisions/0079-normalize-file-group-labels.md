# 0079. 파일 그룹 라벨은 경로가 아니라 basename으로 정규화한다

- 상태: 채택됨
- 날짜: 2026-08-25
- 관련: ADR-0007(사용 위치 기반 groupHint), ADR-0019(라이브러리 힌트 흡수), ADR-0053(폴더 중첩)

## 맥락

`bippy/source`의 `getSource(fiber).fileName`은 소스맵·번들러에 따라 `Button.tsx` 또는
`src/features/cart/Button.tsx`처럼 서로 다른 형태를 반환한다. 구현은 이를 그룹 키와 프레임
라벨로 그대로 썼기 때문에, 어떤 환경에서는 파일 그룹 헤더가 전체 폴더 구조로 길게 노출됐다.

ADR-0053은 애초에 "그룹 키는 파일 basename, 전체 경로는 groupPath로 폴더 키만 유도"하도록
정했지만, 실제 정규화가 빠져 있었다.

## 결정

**앱 소스 `fileName`은 `sourceHints.ts`에서 basename으로 정규화해 `groupHint`로 저장한다.**

- `groupHint`: 항상 `Button.tsx` 같은 파일명. 파일 그룹의 키·프레임 라벨·색 해시에 쓴다.
- `groupPath`: React `_debugStack`에서 얻은 전체 경로를 그대로 보관한다. "폴더로 묶기"의
  폴더 프레임과 경로 툴팁만 이 값을 쓴다.
- `../…` 또는 `node_modules`를 포함한 라이브러리 경로는 절대 자르지 않는다. ADR-0019의
  라이브러리 판별이 이 문자열을 이용해 조상 앱 그룹으로 흡수하기 때문이다.

## 결과

- Vite·Next·Turbopack 등에서 source map의 path 표기가 달라도 파일 그룹 라벨이 일관된다.
- 폴더 구조 정보는 사라지지 않고 기존 `groupPath` 경로를 통해 유지된다.
- 서로 다른 폴더의 동명 파일은 기존 ADR-0053과 같은 basename 충돌 한계를 계속 가진다. 이
  변경은 그 한계를 새로 만들지 않고, 원래 설계를 실제로 복구한다.
