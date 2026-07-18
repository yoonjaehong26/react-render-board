// 공유 UI 레인 "먼 부모" 스트레스(pillar ②, ADR-0061 검증). SharedDialogDemo(SettingsDialog/
// ProfileDialog)와 **멀리 떨어진** 위치에서 같은 공유 Dialog를 한 번 더 쓴다 → Dialog.tsx 그룹의
// 부모가 트리에서 좌우로 크게 벌어진다. 레인은 부모 centroid(중앙)에 놓이고, 사용선은 상시가
// 아니라 칩 + 호버로만 뜨므로 먼 부모여도 화면이 안 지저분해지는지 실측하는 fixture.
import { Dialog } from './Dialog';

export function FarDialogDemo() {
  return (
    <section>
      <h2>far dialog</h2>
      <Dialog title="원격 사용처">
        <p>SharedDialogDemo와 멀리 떨어진 공유 Dialog 사용처</p>
      </Dialog>
    </section>
  );
}
