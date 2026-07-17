# ADR-0022: 훅킹 라이브러리 확정 — bippy 유지, react-devtools-core 도입 보류

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락 (Context)

[ADR-0002](0002-hooking-layer.md)는 훅킹 레이어를 "MVP 단계에서는 bippy로 빠르게 검증하고, 안정성이 중요한 정식 단계에서 react-devtools-core와 재비교한다"며 라이브러리 선택을 열어뒀다. [`project-status.md`](../project-status.md) 7-3(b)가 정식 재구현 착수 조건으로 "ADR-0002의 열린 결정도 함께 확정"을 명시했으므로, 이 라운드에서 결론을 낸다.

지난 라운드 동안 bippy는 MVP를 훨씬 넘어서는 검증을 이미 통과했다: 실제 앱 3개(excalidraw, berry-admin, shadcn-admin) 전체, 대규모(9,818노드) 스트레스, 고빈도(240Hz) 렌더, class/에러바운더리/concurrent/lazy+Suspense 5개 패턴, P0~P4 백로그 수정까지 — 이 전 과정에서 bippy 자체에 기인한 크래시나 데이터 손상은 0건이었다(ADR-0009~0019). 즉 "안정성이 검증되지 않아 재비교가 필요하다"던 ADR-0002 작성 시점의 전제 자체가 더 이상 유효하지 않다.

## 검토한 대안 (Options)

- **bippy 유지** — 이미 위 규모로 실전 검증됨. 문서-코드 드리프트가 반복 발견됐으나(ADR-0002/0005/0007) 그때마다 프로젝트 규칙("버전 업 시 실제 `.d.ts`를 직접 확인")으로 대응해 왔고, 이번 조사(아래 근거 절)도 그 규칙을 그대로 실행해 얻은 결과다 — 리스크가 아니라 이미 관리되고 있는 알려진 패턴이다.
- **react-devtools-core로 교체** — Meta 공식 유지보수라는 장점은 있으나, 아래 근거에서 정리하듯 이 프로젝트의 임베딩 모델(ADR-0020)과 아키텍처가 근본적으로 다르다.

## 결정 (Decision)

**bippy를 훅킹 레이어의 최종 라이브러리로 확정한다. react-devtools-core는 도입하지 않는다.**

## 근거 (Rationale)

1. **아키텍처가 이 프로젝트의 임베딩 모델과 맞지 않는다.** [ADR-0020](0020-distribution-entry-ux-direction.md)은 "같은 페이지, 같은 JS 컨텍스트" 오버레이 구조를 아키텍처 전제조건으로 이미 확정했다(요소 클릭 연동 같은 후속 기능이 크로스탭 통신 없이 동작해야 하므로). bippy의 `instrument({ onCommitFiberRoot })`은 정확히 이 모델에 맞는 API — 같은 페이지 안에서 커밋을 직접 콜백으로 받는다. 반면 react-devtools-core는 React DevTools 확장의 2-프로세스 모델(별도 DevTools 패널/스탠드얼론 앱이 `Bridge`/`Wall` 위에서 `Agent`↔`Store`로 통신)을 위해 설계됐다 — 페이지에 주입되는 backend와, 그 backend가 직렬화한 데이터를 받는 완전히 별도의 frontend(다른 탭/프로세스)로 나뉘는 구조다. 이 프로젝트처럼 "같은 페이지 안에서 바로 쓸 데이터"가 목적이면, 그 Bridge/Wall 계층은 없는 통신 상대를 위해 직렬화·역직렬화 왕복을 하는 순수 오버헤드가 된다 — 로컬 트랜스포트(fake wall)를 만들어 우회하는 것 자체가 이 라이브러리가 애초에 상정하지 않은 사용법이라는 신호다.
2. **실전 검증 규모가 이미 재비교를 무의미하게 만들었다.** ADR-0002 작성 시점엔 "MVP 수준 검증뿐"이었지만, 지금은 실제 앱 3개·9,818노드·240Hz·5개 React 패턴·P0~P4 수정까지 거친 뒤다(위 맥락 절). 이 검증을 react-devtools-core로 반복하는 비용 대비, bippy를 계속 쓰는 데 새로 드러난 리스크가 없다.
3. **번들 크기와 관심사 범위가 이 프로젝트에 더 맞는다.** bippy는 ~4kb, Fiber 접근에 필요한 최소 API만 제공한다. react-devtools-core는 DevTools 프로토콜 전체(직렬화 규약, 프로파일링 데이터 인코딩 등)를 포함해 이 프로젝트가 쓰지 않을 코드까지 딸려온다.
4. **문서-코드 드리프트 리스크는 이미 관리되는 패턴이다.** `secure()`(ADR-0005), `getFiberSource`/실제로는 `getSource`(ADR-0007)에 이어, 이번 조사에서도 세 번째로 실제 배포된 `bippy@0.6.0`의 `dist/core.cjs`를 직접 읽어 `isHostFiber`/`isCompositeFiber`/`getFiberId`/`getDisplayName`의 실제 동작(태그 기반 분류 로직)을 재확인했다 — README를 믿지 않고 실제 코드를 확인한다는 ADR-0002의 프로젝트 규칙이 그대로 작동했다. 이는 bippy를 계속 쓰지 말아야 할 이유가 아니라, 계속 쓰기 위한 절차가 이미 자리 잡고 있다는 증거로 본다.
5. **배포 전략과의 정합성.** [ADR-0020](0020-distribution-entry-ux-direction.md)은 향후 CLI 자동 초기화(`npx react-render-board init`)를 bippy와 같은 저자가 만든 `react-scan`의 선례를 근거로 채택했다. 같은 저자의 두 도구(bippy + react-scan의 CLI 패턴)를 함께 쓰는 것이 생태계 정합성 측면에서도 자연스럽다.

## 결과 (Consequences)

- [ADR-0002](0002-hooking-layer.md)의 상태를 "채택됨(구체 라이브러리는 MVP 후 확정)"에서 "채택됨(bippy로 확정, 이 ADR 참고)"으로 갱신한다.
- `docs/decisions/README.md`의 ADR-0002 상태 컬럼도 함께 갱신한다.
- **되돌리기 비용**: 훅킹 레이어는 `src/hooking/fiberInspector.ts` 한 파일에 격리돼 있고 데이터 레이어가 소비하는 인터페이스(`RenderStore.handleCommit(fiber)`)는 라이브러리 종속적이지 않다 — 나중에 라이브러리를 바꿔야 할 근거가 생기면 이 파일만 다시 쓰면 되므로 되돌리기 쉬운 결정이다. 다만 지금 이 ADR로 "재비교 대기" 상태를 끝내는 것 자체가 목적이므로, 새로운 근거(예: bippy가 특정 React 버전에서 깨짐) 없이 다시 열지 않는다.
- react-devtools-core는 이 프로젝트 스코프에서 다시 검토하지 않는다. 단, DevTools 프로토콜과의 상호운용(예: 실제 React DevTools 확장이 이미 페이지에 붙어있을 때의 충돌 여부)이 실사용에서 문제로 드러나면 별도 ADR로 재검토할 수 있다 — 지금까지 3개 실제 앱 검증에서는 그런 충돌이 관찰되지 않았다.
