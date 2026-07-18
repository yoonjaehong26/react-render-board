import { useCallback, useEffect, useState } from 'react';

// 사용자 요청 — "실제 클라이언트 라우팅(URL이 바뀌며 페이지 전환)"을 보드가 어떻게 관찰하는지
// 보여주기 위한 최소 라우터. react-router 같은 라이브러리를 새로 들이지 않는다 — 이 데모에
// 필요한 건 "경로 두 개를 History API로 오가기"뿐이라 굳이 의존성을 늘릴 이유가 없다
// (CLAUDE.md: 근거 없이 도구를 늘리지 않는다). Vite dev 서버 기본값(appType: 'spa')이 알 수
// 없는 경로도 index.html로 서빙해주므로 새로고침/딥링크도 그대로 동작한다.
export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
      setPath(to);
    }
  }, []);

  return { path, navigate };
}
