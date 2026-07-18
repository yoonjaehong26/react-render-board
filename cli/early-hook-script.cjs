// 조기 <head> 훅 스크립트 본문 — Next(layout <script>)와 webpack(html-webpack-plugin
// beforeEmit)이 공유한다(ADR-0036). React/Next보다 먼저 동기 실행돼:
//  1) dev 신호(__RRB_DEV__)를 세우고,
//  2) __REACT_DEVTOOLS_GLOBAL_HOOK__를 심어 초기 커밋부터 관찰하며 rendererID별 최신 root를
//     버퍼링해(늦게 뜨는 보드 런타임이 재생),
//  3) 폴백 플로팅 버튼을 띄운다(런타임이 뜨면 BoardOverlay 토글이 대신하고 이 버튼은 제거됨).
// classic(비-module) 동기 스크립트라 defer되는 앱 번들보다 항상 먼저 실행된다.
//
// this에 의존하지 않는다(ADR-0065 버그 수정): react-scan 등 다른 devtools 훅 도구가 이미 설치된
// 훅을 발견하면 자기 걸 덧씌우면서 우리 inject를 this 바인딩 없이(예: 참조만 복사해 호출) 호출하는
// 실사용 사례가 실측됐다 — 그 경우 `this.renderers`가 undefined가 돼 매 커밋마다 예외가 터지고
// 노드가 "그룹 확인 중…"에서 멈췄다. renderers를 클로저 변수로 잡아 this를 아예 안 써, 어떻게
// 호출되든(바인딩 없이·call/apply로·다른 this로) 항상 올바르게 동작하게 한다.
//
// onCommitFiberRoot를 다중 리스너 슬롯(defineProperty get/set)으로 바꾸는 시도는 **폐기했다**:
// 실사용 중 무한 재귀로 실제 페이지가 멈추는 사고가 났다(다른 도구가 "현재 값을 캡처해 감싸서
// 재대입"하는 패턴을 쓰면, get()이 항상 같은 dispatch 함수를 돌려주고 그 dispatch가 자기
// 리스너 목록 안의 래퍼를 호출 → 래퍼가 다시 그 dispatch를 부르는 무한 루프가 됐다). react-scan과의
// 완전한 공존은 더 안전한 설계가 나오기 전까지 보류한다 — 지금은 단순 단일 슬롯으로 되돌린 상태다.
const EARLY_HOOK_SCRIPT_BODY = `
(function () {
  if (window.__RRB_INJECTED__) return;
  window.__RRB_INJECTED__ = true;
  window.__RRB_DEV__ = true;

  window.__RRB_ROOTS__ = window.__RRB_ROOTS__ || new Map();
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    var rrbRenderers = new Map();
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      isDisabled: false, supportsFiber: true, renderers: rrbRenderers,
      inject: function (r) { var id = rrbRenderers.size + 1; rrbRenderers.set(id, r); return id; },
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
