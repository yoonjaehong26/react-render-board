import { useEffect, useState } from 'react';

// 1초마다 자기 state를 갱신해 지속적 고빈도(는 아니지만 꾸준한) 리렌더를 만드는 노드 —
// 변경 잔상(ADR-0032)이 "지금 자주 리렌더되는" 노드를 어떻게 발광시키는지 보기 좋은 트리거다.
// LiveFeed(초당 N회)보다 느긋해서 잔상이 식었다 다시 뜨는 걸 눈으로 볼 수 있다.
const DEADLINE_SECONDS = 3 * 3600; // 3시간 카운트다운(루프)

export function CountdownTimer() {
  const [remaining, setRemaining] = useState(DEADLINE_SECONDS);
  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => (r <= 0 ? DEADLINE_SECONDS : r - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = String(Math.floor(remaining / 3600)).padStart(2, '0');
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <span className="countdown-timer" aria-label="특가 남은 시간">
      {hh}:{mm}:{ss}
    </span>
  );
}
