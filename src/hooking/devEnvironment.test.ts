import { describe, it, expect, afterEach } from 'vitest';
import { isDevEnvironment } from './devEnvironment';

describe('isDevEnvironment', () => {
  afterEach(() => {
    window.__RRB_DEV__ = undefined;
  });

  it('window.__RRB_DEV__가 true면 dev로 본다(주입 레이어 경로, ADR-0067 핵심 계약)', () => {
    // 이 체크가 dev/build:lib 시점의 import.meta.env.DEV 정적 치환에 안 걸리는 게 이 함수의
    // 핵심 존재 이유다 — window.__RRB_DEV__는 순수 런타임 프로퍼티 접근이라 트리셰이킹 대상이
    // 되지 않는다. vitest 환경에서는 import.meta.env.DEV/process.env.NODE_ENV를 다른 모듈을
    // 거쳐 안정적으로 "false"로 스텁할 수 없어(vi.stubEnv가 이미 트랜스파일된 모듈의
    // import.meta.env 참조까지는 못 미친다), 나머지 폴백 분기는 domInteraction.test.ts/
    // fiberInspector.test.ts에서 isDevEnvironment 자체를 vi.mock으로 대체해 검증한다.
    window.__RRB_DEV__ = true;
    expect(isDevEnvironment()).toBe(true);
  });

  it('window.__RRB_DEV__가 없으면 다른 신호(이 저장소의 실제 dev 환경)로 폴백해 true를 유지한다', () => {
    // 이 저장소 자신을 vitest(Vite 기반)로 테스트하는 지금 이 순간 자체가 "dev 환경"이므로,
    // import.meta.env.DEV/NODE_ENV 폴백이 자연스럽게 true를 준다 — 별도 스텁 없이 실제 값 그대로.
    window.__RRB_DEV__ = undefined;
    expect(isDevEnvironment()).toBe(true);
  });
});
