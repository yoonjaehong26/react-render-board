import { useEffect, useRef, useState } from 'react';
import { Button } from '../shared/Button';

// 고빈도 렌더 갱신 스트레스 테스트용 fixture. setInterval로 지정된 Hz만큼 state를 갱신해
// 초당 여러 번 지속적으로 커밋이 발생하는 상황(애니메이션/실시간 데이터/폴링/WebSocket)을
// 재현한다 — 지금까지의 실 앱 검증(ADR-0009)은 "도형 몇 개를 수동으로 그리는" 짧은
// 상호작용이었고, 지속적 고빈도 부하는 검증되지 않았다.
// rAF가 아니라 setInterval을 쓴다: rAF는 화면 갱신 주기(보통 60Hz)에 묶여서 그 이상으로는
// 콜백이 스킵되므로, "몇 Hz부터 한계가 드러나는가"를 60Hz 너머까지 밀어붙이려면 화면 주기와
// 무관하게 타이머가 동작해야 한다.
// history는 최근 HISTORY_SIZE개만 유지한다 — fixture 자체가 무한정 메모리를 늘리면 관찰
// 대상(react-render-board)의 누수와 fixture의 누수가 뒤섞여 메모리 측정이 무의미해진다.
const HISTORY_SIZE = 24;
const PRESET_HZ = [10, 30, 60, 120, 240];

export function LiveFeed() {
  const [hz, setHz] = useState(0);
  const [tickCount, setTickCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (hz <= 0) return;
    startedAtRef.current = performance.now();
    const intervalMs = 1000 / hz;
    const id = setInterval(() => {
      setTickCount((c) => c + 1);
      setElapsedMs(performance.now() - startedAtRef.current);
      setHistory((prev) => {
        const next = prev.length >= HISTORY_SIZE ? prev.slice(1) : prev;
        return [...next, Math.random()];
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [hz]);

  return (
    <section>
      <h2>live feed (고빈도 갱신)</h2>
      <p data-testid="live-feed-status">
        {hz > 0 ? `${hz}Hz 실행 중` : '정지'} · tick {tickCount} · {(elapsedMs / 1000).toFixed(1)}s
      </p>
      <div className="live-feed__bars" aria-hidden="true">
        {history.map((v, i) => (
          <span key={i} className="live-feed__bar" style={{ height: `${4 + v * 36}px` }} />
        ))}
      </div>
      <div>
        {PRESET_HZ.map((preset) => (
          <Button
            key={preset}
            label={`${preset}Hz 시작`}
            onClick={() => {
              setTickCount(0);
              setHistory([]);
              setHz(preset);
            }}
          />
        ))}
        <Button label="정지" variant="ghost" onClick={() => setHz(0)} />
      </div>
    </section>
  );
}
