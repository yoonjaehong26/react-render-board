// 조기 <head> 훅 스크립트 본문 — Next(layout <script>)와 webpack(html-webpack-plugin
// beforeEmit)이 공유한다(ADR-0036). React/Next보다 먼저 동기 실행돼:
//  1) dev 신호(__RRB_DEV__)를 세우고,
//  2) __REACT_DEVTOOLS_GLOBAL_HOOK__를 심어 초기 커밋부터 관찰하며 rendererID별 최신 root를
//     버퍼링해(늦게 뜨는 보드 런타임이 재생),
//  3) 폴백 플로팅 버튼을 띄운다(런타임이 뜨면 BoardOverlay 토글이 대신하고 이 버튼은 제거됨).
// classic(비-module) 동기 스크립트라 defer되는 앱 번들보다 항상 먼저 실행된다.
const EARLY_HOOK_SCRIPT_BODY = `
(function () {
  if (window.__RRB_INJECTED__) return;
  window.__RRB_INJECTED__ = true;
  window.__RRB_DEV__ = true;

  window.__RRB_ROOTS__ = window.__RRB_ROOTS__ || new Map();
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      isDisabled: false, supportsFiber: true, renderers: new Map(),
      inject: function (r) { var id = this.renderers.size + 1; this.renderers.set(id, r); return id; },
      onCommitFiberRoot: function (rendererID, root) {
        window.__RRB_COMMITS__ = (window.__RRB_COMMITS__ || 0) + 1;
        try { window.__RRB_ROOTS__.set(rendererID, root); } catch (e) {}
      },
      onCommitFiberUnmount: function () {},
      onPostCommitFiberRoot: function () {},
    };
  }

  function mountBtn() {
    // 실제 보드 런타임이 이미 떴으면(BoardOverlay 토글이 대신함) 폴백 버튼을 안 만든다 —
    // DOMContentLoaded가 런타임 부팅보다 늦게 오는 경우 stub이 되살아나는 레이스를 막는다.
    if (window.__RRB_BOOTED__) return;
    if (!document.body || document.getElementById('rrb-floating-button')) return;
    var b = document.createElement('button');
    b.id = 'rrb-floating-button';
    b.textContent = 'render-board 열기';
    b.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;padding:8px 12px;border-radius:8px;background:#6d28d9;color:#fff;border:none;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);';
    document.body.appendChild(b);
  }
  if (document.body) mountBtn(); else document.addEventListener('DOMContentLoaded', mountBtn);
})();`;

module.exports = { EARLY_HOOK_SCRIPT_BODY };
