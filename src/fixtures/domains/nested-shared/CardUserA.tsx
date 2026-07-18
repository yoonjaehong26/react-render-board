// 공유 컨테이너 SharedCard의 첫 번째 사용처(별도 파일 = 별도 부모 그룹).
import { SharedCard } from './SharedCard';

export function CardUserA() {
  return <SharedCard title="A">좌측 사용처</SharedCard>;
}
