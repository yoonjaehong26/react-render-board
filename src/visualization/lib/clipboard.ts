/**
 * 사용자 제스처 안에서 target card를 클립보드로 보낸다. navigator.clipboard가 없는 비보안 로컬
 * 환경도 있어, 오래된 execCommand 폴백을 남긴다. 복사가 둘 다 실패하면 호출자가 UI로 알린다.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable');
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = (document as Document & { execCommand?: (command: string) => boolean }).execCommand?.('copy') ?? false;
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy failed');
}
