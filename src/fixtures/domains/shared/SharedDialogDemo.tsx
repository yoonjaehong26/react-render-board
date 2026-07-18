// 공유 컨테이너 데모 진입점 — 서로 다른 두 파일(SettingsDialog/ProfileDialog)이 같은 공유 Dialog를
// 쓰게 해, Dialog.tsx 그룹을 다중 부모로 만든다. DemoApp이 이걸 한 줄로 마운트한다.
import { SettingsDialog } from './SettingsDialog';
import { ProfileDialog } from './ProfileDialog';

export function SharedDialogDemo() {
  return (
    <section>
      <h2>shared dialog</h2>
      <SettingsDialog />
      <ProfileDialog />
    </section>
  );
}
