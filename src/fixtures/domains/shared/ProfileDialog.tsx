// 공유 컨테이너 Dialog의 두 번째 사용처(별도 파일 = 별도 그룹). SettingsDialog.tsx와 함께
// Dialog.tsx 그룹을 "부모 2개"로 만든다 — 공유 UI 레인이 겨냥하는 다중 부모 그룹.
import { Dialog } from './Dialog';

export function ProfileDialog() {
  return (
    <Dialog title="프로필">
      <p>이름 · 아바타 · 소개</p>
    </Dialog>
  );
}
