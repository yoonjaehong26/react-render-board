// 여러 도메인에서 재사용되는 공유 컴포넌트. ADR-0007이 확인한 "사용 위치" 그룹핑 의미를
// 실제 상호작용으로 보여주기 위한 fixture다 — 같은 Button이 shell/checkout/notifications
// 어디서 렌더되느냐에 따라 groupHint(=그 JSX가 쓰인 파일)가 달라진다.
interface ButtonProps {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
}

export function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button type="button" className={`demo-button demo-button--${variant}`} onClick={onClick}>
      {label}
    </button>
  );
}
