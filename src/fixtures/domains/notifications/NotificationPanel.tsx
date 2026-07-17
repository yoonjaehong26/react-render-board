import { useState } from 'react';
import { Button } from '../shared/Button';

// DemoApp에서 통째로 마운트/언마운트되는 도메인 — 그룹(캔버스의 영역 프레임) 자체가
// 통째로 나타나고 사라지는 상황을 검증하기 위한 fixture다.
function NotificationItem({ label }: { label: string }) {
  return <li>{label}</li>;
}

export function NotificationPanel() {
  const [notifications, setNotifications] = useState(['환영합니다']);

  return (
    <section>
      <h2>notifications</h2>
      <ul>
        {notifications.map((n) => (
          <NotificationItem key={n} label={n} />
        ))}
      </ul>
      <Button
        label="알림 추가"
        onClick={() => setNotifications((prev) => [...prev, `notice-${prev.length + 1}`])}
      />
    </section>
  );
}
