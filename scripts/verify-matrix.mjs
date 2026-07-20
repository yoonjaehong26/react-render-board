// 배포/설치 "연결 방식"의 번들러별 e2e 검증을 한 번에 순회하는 오케스트레이터.
//
// 매트릭스는 전 축(번들러×패키지매니저×React버전)을 곱하지 않는다 — 번들러/프레임워크만
// 진짜 축(주입 지점이 실제로 다름)이고, 나머지는 축이 아니라 별도의 얕은 엣지케이스다(ADR-0072).
// 여기서는 기존에 각자 검증된 verify-init*.mjs 스크립트를 그대로 재사용해 순회만 한다 —
// 새 어서션을 만들지 않는다(중복 방지).
//
// 커밋마다 도는 게 아니라 publish 직전 1회 수동 실행용(무겁고 네트워크/컴파일 의존이라 flaky).
// vitest처럼 pass/fail 표만 보고, 뭔가 이상할 때만 verify-output/matrix/*.png를 열어본다.
//
// 실행: node scripts/verify-matrix.mjs   (npm run verify:matrix)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const logDir = path.join(repoRoot, 'verify-output/matrix');
mkdirSync(logDir, { recursive: true });

// 번들러/프레임워크 축 — 진짜로 다른 주입 지점만 (ADR-0072). PM 엣지케이스(pnpm strict,
// yarn Berry PnP)는 아직 스크립트가 없어 이 표에 없다 — 만들면 여기 추가한다.
const STACKS = [
  { key: 'vite', label: 'Vite', script: 'verify-init.mjs' },
  { key: 'webpack', label: 'webpack', script: 'verify-init-webpack.mjs' },
  { key: 'rspack', label: 'Rspack', script: 'verify-init-rspack.mjs' },
  { key: 'next-turbopack', label: 'Next.js (Turbopack)', script: 'verify-init-next-canvas.mjs' },
];

function runOne(stack) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn('node', [path.join(repoRoot, 'scripts', stack.script)], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => {
      const durationSec = ((Date.now() - start) / 1000).toFixed(1);
      writeFileSync(path.join(logDir, `${stack.key}.log`), out);
      const skipped = /건너뜁니다/.test(out);
      const status = skipped ? 'SKIP' : code === 0 ? 'PASS' : 'FAIL';
      resolve({ ...stack, status, durationSec, code });
    });
  });
}

async function main() {
  console.log('\x1b[1m── react-render-board 배포 매트릭스 검증 ──\x1b[0m');
  console.log(`대상: ${STACKS.map((s) => s.label).join(', ')}\n`);

  const results = [];
  // 순차 실행: 각 스크립트가 repoRoot에서 npm pack/build:lib을 공유해 동시 실행 시 서로의
  // tgz/lock을 덮어쓴다(webpack·next-canvas 스크립트의 원상복구 로직이 repoRoot 기준).
  for (const stack of STACKS) {
    process.stdout.write(`▸ ${stack.label} 실행 중…`);
    const result = await runOne(stack);
    const icon = result.status === 'PASS' ? '\x1b[32m✓\x1b[0m' : result.status === 'SKIP' ? '\x1b[33m—\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`\r${icon} ${stack.label} — ${result.status} (${result.durationSec}s)`);
    results.push(result);
  }

  console.log('\n\x1b[1m결과 요약\x1b[0m');
  console.log('─'.repeat(50));
  for (const r of results) {
    const icon = r.status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : r.status === 'SKIP' ? '\x1b[33mSKIP\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`${icon}  ${r.label.padEnd(24)} ${r.durationSec}s  (log: verify-output/matrix/${r.key}.log)`);
  }
  console.log('─'.repeat(50));

  const failed = results.filter((r) => r.status === 'FAIL');
  const skipped = results.filter((r) => r.status === 'SKIP');
  if (skipped.length) {
    console.log(`\x1b[33m건너뜀 ${skipped.length}건\x1b[0m — 스캐폴드 node_modules 미설치(각 experiments/bundler-injection-spike/* 확인).`);
  }
  if (failed.length) {
    console.error(`\x1b[31m실패 ${failed.length}건 — 위 로그(verify-output/matrix/*.log) 확인.\x1b[0m`);
    process.exitCode = 1;
  } else {
    console.log('\x1b[32m전체 통과.\x1b[0m 이상해 보이면 verify-output/matrix/*.png 스크린샷도 확인하세요.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
