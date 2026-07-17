// Vite dev server 플러그인 스파이크.
//
// 목표: 앱 소스(src/*.tsx, src/*.ts 등)를 단 한 줄도 건드리지 않고, dev 서버가 서빙하는
// HTML에 계측용 <script>를 주입할 수 있는가?
//
// 방법: Vite의 공식 훅인 transformIndexHtml을 사용한다. 이 훅은 index.html이 브라우저로
// 나가기 직전(dev 모드에서는 매 요청마다) 호출되며, HTML 문자열 자체를 변형하거나
// (배열 형태의) 태그 디스크립터를 주입할 수 있다. `injectTo: 'head-prepend'`를 쓰면
// Vite가 알아서 <head> 여는 태그 바로 뒤에 삽입해준다 — 즉, 문서 안의 어떤 <script
// type="module">보다도 먼저 파싱/실행되는 위치다.
//
// 이 스크립트는 classic(비-module, non-async, non-defer) <script> 이므로 브라우저가
// 이를 "문서를 계속 파싱하기 전에 즉시 동기 실행"한다. 반면 index.html의
// <script type="module" src="/src/main.tsx">는 사양상 항상 defer처럼 동작한다(모듈
// 스크립트는 기본적으로 지연 실행됨). 따라서 head 안에 넣은 classic 스크립트가
// body 끝에 있는 module 스크립트보다 항상 먼저 실행된다 — 이 순서는 verify.mjs에서
// 콘솔 로그 순서로 실제 검증한다(가정하지 않고 관찰).
import type { Plugin } from 'vite';

const INJECTED_SCRIPT = `
(function () {
  window.__RRB_INJECTED__ = true;

  var btn = document.createElement('button');
  btn.id = 'rrb-floating-button';
  btn.textContent = 'RRB';
  btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;width:48px;height:48px;border-radius:50%;background:#6d28d9;color:#fff;border:none;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);';
  function mount() { if (document.body) document.body.appendChild(btn); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      isDisabled: false,
      supportsFiber: true,
      renderers: new Map(),
      inject: function (renderer) {
        var id = this.renderers.size + 1;
        this.renderers.set(id, renderer);
        console.log('[rrb-spike] renderer injected, id=', id);
        return id;
      },
      onCommitFiberRoot: function (rendererID, root) {
        var t = root && root.current && root.current.type;
        var name = t ? (t.name || t.displayName || typeof t) : (root && root.current ? 'tag=' + root.current.tag : 'unknown');
        console.log('[rrb-spike] onCommitFiberRoot fired! rendererID=', rendererID, 'rootFiber=', name);
      },
      onCommitFiberUnmount: function () {},
      onPostCommitFiberRoot: function () {},
    };
    console.log('[rrb-spike] created __REACT_DEVTOOLS_GLOBAL_HOOK__ stub (none existed)');
  } else {
    console.log('[rrb-spike] __REACT_DEVTOOLS_GLOBAL_HOOK__ already existed');
  }
})();
`;

export function rrbInjectPlugin(): Plugin {
  return {
    name: 'rrb-inject-plugin',
    transformIndexHtml: {
      // Vite 5+ 객체 형태 훅. order: 'pre' + injectTo: 'head-prepend'로
      // <head> 여는 태그 바로 다음(다른 어떤 플러그인이 넣는 태그보다도 앞)에 삽입되도록 한다.
      order: 'pre',
      handler() {
        return [
          {
            tag: 'script',
            injectTo: 'head-prepend',
            children: INJECTED_SCRIPT,
          },
        ];
      },
    },
  };
}
