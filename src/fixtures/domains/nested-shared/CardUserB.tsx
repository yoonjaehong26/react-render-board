// 공유 컨테이너 SharedCard의 두 번째 사용처(별도 파일). CardUserA와 함께 SharedCard.tsx를
// 다중 부모로 만든다.
import { SharedCard } from './SharedCard';

export function CardUserB() {
  return <SharedCard title="B">우측 사용처</SharedCard>;
}
