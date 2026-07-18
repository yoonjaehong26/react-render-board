import type { PricingSummary } from '../pricing';
import { Button } from '../../../../shared/Button';

// 결제 위젯 — shouldFail이 true면 렌더 중 던져 상위 CheckoutErrorBoundary가 fallback으로 바뀐다
// ("에러 유발" 버튼이 이 플래그를 켠다). 평소엔 결제예정금액을 보여준다.
export function CheckoutPanel({
  pricing,
  shouldFail,
  onCheckout,
  onSimulateError,
}: {
  pricing: PricingSummary;
  shouldFail: boolean;
  onCheckout: () => void;
  onSimulateError: () => void;
}) {
  if (shouldFail) {
    throw new Error('fixture: 결제 처리 실패(의도된 에러)');
  }
  return (
    <div className="checkout-panel-v2">
      <Button label={`${pricing.grandTotal.toLocaleString()}원 결제하기`} onClick={onCheckout} />
      <Button label="결제 오류 재현" variant="ghost" onClick={onSimulateError} />
    </div>
  );
}
