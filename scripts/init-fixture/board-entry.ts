// 검증 전용 진입점: 배포된 패키지에서 'react-render-board/inject'가 가리킬 런타임을,
// 로컬 소스(src/inject.tsx)로 연결한다. verify-init.mjs가 플러그인의 entry로 이 파일
// (루트-상대 '/board-entry.ts')을 넘긴다 — 앱 소스(app.tsx)가 아니라 별도 파일이라
// "앱 무수정" 성질은 그대로다.
import '../../src/inject';
