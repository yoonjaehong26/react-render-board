// react-render-board — webpack / Rspack 자동 주입 헬퍼 (ADR-0021/0036).
//
// 두 가지를 함께 한다(dev 전용):
//   1) html-webpack-plugin의 beforeEmit 훅으로 서빙 HTML <head>에 조기 <script>를 넣는다 —
//      React보다 먼저 devtools 훅을 심어 초기 커밋을 잡고 버퍼링한다(cli/early-hook-script.cjs).
//      ADR-0021이 스파이크로 검증한 그 방식. 앱 소스는 안 건드리고 config만 바꾼다.
//   2) 보드 런타임(react-render-board/inject)을 추가 entry로 얹어 webpack이 번들하게 한다 —
//      런타임이 버퍼된 초기 커밋을 재생(drain)하고 BoardOverlay+캔버스를 마운트한다.
//
// 왜 entry만으론 부족한가: entry로 얹은 런타임 번들은 defer로 늦게 실행돼, 그것만으론
// React 초기 커밋을 놓치거나(빈 보드) react-refresh가 devtools 훅을 먼저 선점한다(ADR-0036의
// Turbopack 실측). 조기 <head> 스크립트가 훅 타이밍과 초기 커밋 버퍼링을 책임지고, entry는
// 실제 보드를 로드하는 역할만 맡는 2단 구조다.
//
// 주의(ADR-0021 실측): Rspack은 기본 HtmlRspackPlugin이 html-webpack-plugin과 별개라 이
// beforeEmit 훅이 없을 수 있다 — 그 경우 html-webpack-plugin으로 교체하거나 Rspack용 HTML
// 플러그인 훅에 맞춰야 한다. 이 헬퍼는 html-webpack-plugin이 있으면 그 훅을 쓰고, 없으면
// 조기 스크립트를 건너뛰고 entry만 얹는다(런타임 자체 가드로 동작은 하되 타이밍은 보장 못 함).
//
// entry 순서(실사용 결함 수정, 2026-07-19, ADR-0069): 예전엔 런타임을 entry "뒤에" 붙였는데,
// 실제 소비자 프로젝트(coverLetter, webpack+dev-server)에서 [앱, 런타임] 순서라 React DevTools
// 확장이 훅을 선점한 경우(조기 스크립트가 새 훅을 못 심는 환경) 런타임이 앱의 최초 커밋을
// 놓쳐 렌더 트리가 0개로 잡히는 결함이 실측됐다. [런타임, ...앱] 순서로 "앞에" 얹는다.
// CSS는 entry로 얹지 않는다 — css-loader 없는 소비자의 빌드를 깨뜨린다. 대신 런타임이 CSS를
// 문자열로 품고 부팅 시 <style>로 자기주입한다(src/inject.tsx, ADR-0069) — 로더 구성 무관.

const { EARLY_HOOK_SCRIPT_BODY } = require('./early-hook-script.cjs');

const DEFAULT_ENTRY = 'react-render-board/inject';
const EARLY_SCRIPT_TAG = `<script data-rrb-inject>${EARLY_HOOK_SCRIPT_BODY}</script>`;

// html-webpack-plugin의 beforeEmit에서 <head>에 조기 스크립트를 주입하는 webpack 플러그인.
class RenderBoardWebpackPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('RenderBoardWebpackPlugin', (compilation) => {
      // html-webpack-plugin을 직접 require 하지 않는다 — 이 파일은 소비자 프로젝트가 아니라
      // 라이브러리 위치에서 로드되므로 require가 엉뚱한(또는 없는) node_modules를 탄다(실측 결함).
      // 대신 사용자가 이미 등록한 HtmlWebpackPlugin 인스턴스의 생성자를 그대로 쓴다 — 버전·인스턴스
      // 일치가 보장되고 getHooks(compilation)가 정확히 그 플러그인의 훅을 준다.
      const hwpInstance = (compiler.options.plugins || []).find(
        (p) => p && p.constructor && p.constructor.name === 'HtmlWebpackPlugin',
      );
      if (!hwpInstance) return; // html-webpack-plugin 미사용 — entry만으로 동작(조기 스크립트 생략).
      const HtmlWebpackPlugin = hwpInstance.constructor;
      const hooks = typeof HtmlWebpackPlugin.getHooks === 'function' && HtmlWebpackPlugin.getHooks(compilation);
      if (!hooks || !hooks.beforeEmit) return;
      hooks.beforeEmit.tapAsync('RenderBoardWebpackPlugin', (data, cb) => {
        if (!data.html.includes('data-rrb-inject')) {
          data.html = data.html.includes('<head>')
            ? data.html.replace('<head>', `<head>\n${EARLY_SCRIPT_TAG}`)
            : `${EARLY_SCRIPT_TAG}\n${data.html}`;
        }
        cb(null, data);
      });
    });
  }
}

/**
 * 보드 런타임을 dev 빌드에 얹은 새 config를 돌려준다(webpack/Rspack 공통, 멱등).
 * @template {{ mode?: string, entry?: unknown, plugins?: unknown[] }} C
 * @param {C} config
 * @param {{ entry?: string, force?: boolean }} [options]
 * @returns {C}
 */
function withRenderBoard(config, options = {}) {
  const runtime = options.entry ?? DEFAULT_ENTRY;
  const isProd = config.mode === 'production' || process.env.NODE_ENV === 'production';
  if (isProd && !options.force) return config; // dev 전용

  // 순서가 계약이다(파일 상단 주석): 런타임 → 앱. 런타임이 앱보다 먼저 실행돼야
  // 조기 스크립트가 무력한 환경(DevTools 확장이 훅 선점)에서도 최초 커밋을 잡는다.
  config.entry = addEntry(config.entry, [runtime]);
  config.plugins = Array.isArray(config.plugins) ? config.plugins : [];
  if (!config.plugins.some((p) => p instanceof RenderBoardWebpackPlugin)) {
    config.plugins.push(new RenderBoardWebpackPlugin());
  }
  return config;
}

// 여러 형태의 entry를 보존하며 주입 모듈들(prepend 배열)을 "앞에" 추가한다(멱등 —
// 이미 들어 있는 모듈은 다시 넣지 않는다).
function addEntry(entry, prepend) {
  if (entry == null) return prepend.length === 1 ? prepend[0] : [...prepend];
  if (typeof entry === 'string') {
    const missing = prepend.filter((m) => m !== entry);
    return missing.length === 0 ? entry : [...missing, entry];
  }
  if (Array.isArray(entry)) {
    const missing = prepend.filter((m) => !entry.includes(m));
    return missing.length === 0 ? entry : [...missing, ...entry];
  }
  if (typeof entry === 'function') return async () => addEntry(await entry(), prepend);
  if (typeof entry === 'object') {
    if (Object.prototype.hasOwnProperty.call(entry, 'react-render-board')) return entry;
    // 객체 형태는 entry별 번들이 따로 나가므로 순서 보장이 약하다 — 보드 전용 키를 "맨 앞"에
    // 두어 html-webpack-plugin 스크립트 주입 순서에서라도 앞서게 한다.
    return { 'react-render-board': prepend.length === 1 ? prepend[0] : [...prepend], ...entry };
  }
  return entry;
}

// webpack.config 소스를 자동으로 withRenderBoard로 감싼다(가장 흔한 CJS 형태만, 멱등).
// 안전 원칙: 브레이스 매칭 같은 취약한 파싱을 하지 않는다. 대신 파일 끝에
// `module.exports = withRenderBoard(module.exports)`를 덧붙여, 최종 export가 config 객체이기만
// 하면 형태(객체 리터럴/변수/함수 호출 결과)에 무관하게 감싼다. 함수/배열/ESM export는
// 이 재감싸기가 안전하지 않으므로 건드리지 않고 폴백 사유를 돌려준다(CLI가 수동 안내).
// 반환: { changed, source, reason }.
function patchWebpackConfig(source) {
  if (/react-render-board\/webpack|withRenderBoard/.test(source)) {
    return { changed: false, source, reason: 'already-patched' };
  }
  const isEsm = /(^|\n)\s*export\s+default/.test(source) || /(^|\n)\s*import\s.+from/.test(source);
  if (isEsm) return { changed: false, source, reason: 'esm-config' };
  if (!/module\.exports\s*=/.test(source)) return { changed: false, source, reason: 'no-cjs-exports' };
  // 함수형(`module.exports = (env)=>` / `= function`)·배열형(`= [`)은 재감싸기가 위험 → 폴백.
  if (/module\.exports\s*=\s*(async\s+)?(function\b|\(|\[)/.test(source)) {
    return { changed: false, source, reason: 'function-or-array-config' };
  }
  const requireLine = "const { withRenderBoard } = require('react-render-board/webpack');\n";
  let out = source;
  if (/^#!/.test(out)) {
    const nl = out.indexOf('\n') + 1;
    out = out.slice(0, nl) + requireLine + out.slice(nl);
  } else {
    out = requireLine + out;
  }
  out = out.replace(/\s*$/, '\n') + 'module.exports = withRenderBoard(module.exports);\n';
  return { changed: true, source: out, reason: 'wrapped-cjs' };
}

module.exports = { withRenderBoard, RenderBoardWebpackPlugin, patchWebpackConfig, DEFAULT_ENTRY };
