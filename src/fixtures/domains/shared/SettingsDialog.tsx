// 공유 컨테이너 Dialog의 첫 번째 사용처(별도 파일 = 별도 그룹). Dialog를 여기서 쓰면 그 Dialog
// 인스턴스는 SettingsDialog.tsx 그룹에 들어가고, Dialog의 내부(Dialog.tsx 그룹)는 이 파일을 부모로
// 갖는다. ProfileDialog.tsx와 함께 Dialog.tsx 그룹을 다중 부모로 만든다.
import { Dialog } from './Dialog';

export function SettingsDialog() {
  return (
    <Dialog title="설정">
      <p>테마 · 알림 · 계정</p>
    </Dialog>
  );
}
