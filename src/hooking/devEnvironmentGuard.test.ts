// 회귀 방지 가드 (ADR-0067·ADR-0075). `import.meta.env`는 devEnvironment.ts 안에서만 실행 코드로
// 쓰여야 한다. 다른 파일에서 `if (!import.meta.env.DEV) return` 같은 dev 게이트를 직접 쓰면,
// build:lib(production vite build)이 그 값을 리터럴 false로 정적 치환해 뒤따르는 코드 전체가
// 트리셰이킹으로 사라진다 — Alt+클릭 역방향 인터랙션(ADR-0067)과 그룹핑 힌트(ADR-0075)가 배포
// 산출물에서 실제로 통째로 죽어 있었다. 반드시 isDevEnvironment()를 거쳐야 한다. 이 테스트는
// 소스에서 주석을 걷어낸 뒤 그 실수를 CI(=npm run test) 단계에서 잡는다.
//
// 소스 로딩은 node:fs가 아니라 Vite 네이티브 import.meta.glob(?raw)을 쓴다 — jsdom 환경에서도
// 동작하고 @types/node에 의존하지 않는다.
import { describe, it, expect } from 'vitest';

// src/ 아래 모든 .ts/.tsx를 원문 문자열로 로드(테스트 파일 제외는 아래에서 처리).
const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** 라인 주석(//)과 블록 주석은 걷어내되 문자열 리터럴은 대충 보존하는 러프 스트리퍼. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '') // 블록 주석
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // 라인 주석(http:// 같은 건 앞 문자 보존으로 회피)
}

describe('import.meta.env dev-gate guard (ADR-0067/0075)', () => {
  it('is not used as executable code outside devEnvironment.ts', () => {
    const offenders: string[] = [];
    for (const [path, code] of Object.entries(sources)) {
      if (path.endsWith('/devEnvironment.ts')) continue; // 유일하게 허용된 파일.
      if (/\.(test|spec)\.(ts|tsx)$/.test(path)) continue; // 테스트 파일 제외.
      if (path.includes('/fixtures/')) continue; // 데모 fixture는 배포 대상 아님.
      if (stripComments(code).includes('import.meta.env')) offenders.push(path);
    }
    expect(
      offenders,
      `import.meta.env를 직접 쓰지 말고 isDevEnvironment()를 쓰세요 (ADR-0067/0075). 위반: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
