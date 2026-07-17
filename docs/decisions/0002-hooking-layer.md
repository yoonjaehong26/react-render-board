# ADR-0002: 훅킹 레이어를 직접 구현하지 않고 위임

- 상태: 채택됨 (**구체 라이브러리 확정: bippy** — [ADR-0022](0022-hooking-library-confirmed-bippy.md) 참고)
- 날짜: 2026-07-17

## 맥락

렌더 트리에 접근하려면 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`을 monkey-patch해야 한다. 선행 프로젝트(React-Sight, Realize 등)는 이 부분을 직접 구현했고, 정확히 여기서 가장 자주 깨졌다 (React 버전이 바뀔 때마다).

## 검토한 대안

- **직접 구현** — 선행 프로젝트들이 죽은 지점. React 내부 변경에 취약. ❌
- **bippy** — react-scan 제작자 툴킷. 가볍고(~4kb) 최신 React 특화, `secure`로 안전 가드. 활발히 관리. 단, React 내부 의존이라 프로덕션 리스크 존재.
- **react-devtools-core** — Meta 공식. 더 안정적/보수적. Manifest V3 대응. backend/frontend 분리.

## 결정

훅킹 레이어는 **직접 구현하지 않는다.** MVP 실험 단계에서는 **bippy**로 빠르게 검증하고, 안정성이 중요한 정식 단계에서 react-devtools-core와 재비교한다.

## 근거

- 이 레이어는 프로젝트에서 가장 복잡하고 자주 깨지는 부분인데, 이미 검증된 라이브러리가 존재한다.
- 원조 React-Sight 로드맵의 마지막 항목도 "react-devtools-backend에 훅킹해서 직접 재구현 안 하기"였다. 우리는 그것을 처음부터 실행한다.

## 결과

- React 버전 종속성 리스크가 크게 줄어든다.
- ~~로드맵의 4번(에러 핸들링/가드)이 bippy의 `secure`로 상당 부분 해결된다.~~ **정정 (2026-07-17, ADR-0005 발견 반영):** 실제 설치된 bippy 0.6.0에는 `secure` export가 없다. 에러 핸들링은 콜백을 수동 try/catch로 감싸 실험 1에서 자체 구현했다. `technical-options.md`가 언급한 `secure`는 문서와 실제 배포 버전 사이 API 드리프트로 보이며, 라이브러리 최종 확정 시 버전별로 재확인해야 한다.
- 라이브러리 선택은 아직 열려 있음 — MVP 후 벤치마크로 확정. **→ 2026-07-17, [ADR-0022](0022-hooking-library-confirmed-bippy.md)로 bippy 확정 완료.**

## 프로젝트 규칙 (2026-07-17 추가, ADR-0005 + ADR-0007 반영)

bippy는 README와 실제 배포된 코드 사이에 API 드리프트가 두 번 확인됐다(`secure()` — ADR-0005, `getFiberSource`/실제로는 `getSource` — ADR-0007). 우연이 아니라 반복되는 패턴으로 본다.

> **bippy 버전을 올리거나 새 유틸을 채택할 때는 README를 믿지 말고, 실제 설치된 패키지의 `.d.ts`/소스를 직접 확인한다.**
