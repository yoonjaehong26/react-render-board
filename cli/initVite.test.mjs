// patchViteConfig 순수 함수 회귀 테스트 (ADR-0075). 예전 정규식 방식은 두 흔한 config 형태를
// 문법 오류로 파손했다: (1) 멀티라인 import(Prettier가 긴 import를 쪼갠 경우) 중괄호 안에 삽입,
// (2) css.postcss.plugins 같은 최상위가 아닌 plugins 배열에 오삽입. 아래 케이스로 고정한다.
import { describe, it, expect } from 'vitest';
import { patchViteConfig } from './init-core.mjs';

describe('patchViteConfig (ADR-0075)', () => {
  it('injects import + plugin into a simple config', () => {
    const src = [
      `import { defineConfig } from 'vite';`,
      `import react from '@vitejs/plugin-react';`,
      ``,
      `export default defineConfig({ plugins: [react()] });`,
    ].join('\n');
    const r = patchViteConfig(src);
    expect(r.status).toBe('patched');
    expect(r.code).toContain(`import { rrbInjectPlugin } from 'react-render-board/vite'`);
    expect(r.code).toContain('rrbInjectPlugin(), react()');
  });

  it('does NOT corrupt a multi-line import (the C2 bug)', () => {
    const src = [
      `import {`,
      `  defineConfig,`,
      `  loadEnv,`,
      `} from 'vite';`,
      `import react from '@vitejs/plugin-react';`,
      ``,
      `export default defineConfig({ plugins: [react()] });`,
    ].join('\n');
    const r = patchViteConfig(src);
    expect(r.status).toBe('patched');
    // 삽입된 import가 기존 멀티라인 import 중괄호 안으로 들어가면 `{ ... import ... }`가 생긴다.
    // 파일 맨 앞에 붙는 새 방식에서는 그런 깨진 형태가 없어야 한다.
    expect(r.code).not.toMatch(/\{\s*\n[^}]*import \{ rrbInjectPlugin/);
    // 원래 멀티라인 import는 온전히 남아 있어야 한다.
    expect(r.code).toContain(`import {\n  defineConfig,\n  loadEnv,\n} from 'vite';`);
    // 새 import는 파일 맨 앞 줄이어야 한다.
    expect(r.code.startsWith(`import { rrbInjectPlugin } from 'react-render-board/vite'\n`)).toBe(true);
    // 플러그인은 최상위 plugins 배열에 주입돼야 한다.
    expect(r.code).toContain('rrbInjectPlugin(), react()');
  });

  it('skips (no corruption) when a nested plugins array is present (the C3 bug)', () => {
    const src = [
      `import { defineConfig } from 'vite';`,
      `import react from '@vitejs/plugin-react';`,
      `import autoprefixer from 'autoprefixer';`,
      ``,
      `export default defineConfig({`,
      `  css: { postcss: { plugins: [autoprefixer()] } },`,
      `  plugins: [react()],`,
      `});`,
    ].join('\n');
    const r = patchViteConfig(src);
    // 최상위 plugins와 postcss.plugins가 둘 다 있어 어느 배열이 맞는지 모호 → 손대지 않고 폴백.
    expect(r.status).toBe('skip');
    expect(r.reason).toBe('ambiguous-plugins-array');
  });

  it('skips when there is no plugins array at all', () => {
    const src = `import { defineConfig } from 'vite';\nexport default defineConfig({ server: { port: 3000 } });`;
    const r = patchViteConfig(src);
    expect(r.status).toBe('skip');
    expect(r.reason).toBe('no-plugins-array');
  });

  it('is idempotent — already-configured config is left unchanged', () => {
    const src = `import { rrbInjectPlugin } from 'react-render-board/vite';\nexport default { plugins: [rrbInjectPlugin()] };`;
    expect(patchViteConfig(src).status).toBe('already');
  });
});
