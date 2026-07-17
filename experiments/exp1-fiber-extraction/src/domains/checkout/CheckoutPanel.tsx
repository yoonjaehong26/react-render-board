import { Button } from '../shared/Button'

// 스파이크 전용: 다른 도메인(shared)의 컴포넌트를 렌더하는 도메인(checkout) 컴포넌트.
// exp2(ADR-0006)가 발견한 "부모-자식이 다른 그룹에 속할 수 있음" 상황을 실제 파일 구조로 재현한다.
export function CheckoutPanel() {
  return (
    <section>
      <h2>checkout</h2>
      <Button label="pay" />
    </section>
  )
}
