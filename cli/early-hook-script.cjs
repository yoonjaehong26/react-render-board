// 조기 <head> 훅 스크립트 본문 — Next(layout <script>)와 webpack(html-webpack-plugin
// beforeEmit)이 공유한다(ADR-0036). React/Next보다 먼저 동기 실행돼:
//  1) dev 신호(__RRB_DEV__)를 세우고,
//  2) __REACT_DEVTOOLS_GLOBAL_HOOK__를 심거나(없을 때) 이미 있으면 그 onCommitFiberRoot를
//     한 번만 감싸(wrap) 초기 커밋부터 관찰하며 root별 최신 FiberRoot를 버퍼링해(늦게 뜨는
//     보드 런타임이 재생),
//  3) 폴백 플로팅 버튼을 띄운다(런타임이 뜨면 BoardOverlay 토글이 대신하고 이 버튼은 제거됨).
// classic(비-module) 동기 스크립트라 defer되는 앱 번들보다 항상 먼저 실행된다.
//
// this에 의존하지 않는다(ADR-0065 버그 수정): react-scan 등 다른 devtools 훅 도구가 이미 설치된
// 훅을 발견하면 자기 걸 덧씌우면서 우리 inject를 this 바인딩 없이(예: 참조만 복사해 호출) 호출하는
// 실사용 사례가 실측됐다 — 그 경우 `this.renderers`가 undefined가 돼 매 커밋마다 예외가 터지고
// 노드가 "그룹 확인 중…"에서 멈췄다. renderers를 클로저 변수로 잡아 this를 아예 안 써, 어떻게
// 호출되든(바인딩 없이·call/apply로·다른 this로) 항상 올바르게 동작하게 한다.
//
// 기존 훅이 이미 있으면 감싼다(ADR-0070 버그 수정): 예전엔 `if (!hook)`일 때만 자체 훅을
// 설치하고 이미 있으면 아무것도 안 했다. 그런데 **브라우저의 React DevTools/React Scan 확장은
// 콘텐츠 스크립트를 document_start에 실행해 이 <head> 인라인 스크립트보다도 먼저 훅을 심는다** —
// 그러면 `if (!hook)`이 항상 거짓이라 우리 버퍼링이 아예 안 걸리고, Next처럼 하이드레이션
// 커밋이 런타임 부팅보다 먼저 끝나는 앱(정적 화면이면 이후 커밋도 없음)은 보드가 영구히
// "0/0 노드"가 됐다(실사용 발견·확진). 그래서 훅이 이미 있으면 **그 onCommitFiberRoot를
// 원본 보존한 채 한 번만 재할당(monkey-patch)해** 우리 버퍼도 함께 채운다.
//
// 왜 이 wrap은 안전한가(ADR-0065에서 무한 재귀로 폐기한 시도와 다른 점):
//  - 폐기된 시도는 onCommitFiberRoot를 get/set 접근자로 바꿔 "다중 리스너 디스패처"로 만든
//    구조였다 — 다른 도구가 "현재 값을 캡처해 감싸 재대입"하는 패턴을 쓰면 getter가 항상 같은
//    dispatch를 돌려주고 그 dispatch가 자기 리스너(래퍼)를 다시 호출해 무한 루프가 됐다.
//  - 이번 것은 **평범한 함수 프로퍼티를 딱 한 번 재할당**하는 단순 wrap이다(get/set 아님).
//    __rrbPatched__ 플래그로 중복 wrap을 막고, 원본을 apply로 이어 호출해 확장(DevTools
//    Components 패널 등)도 그대로 살아 있게 한다. React는 매 커밋 hook.onCommitFiberRoot를
//    프로퍼티로 새로 읽어 호출하므로(캐싱 안 함) 한 번 감싸두면 이후 모든 커밋에 걸린다.
//  - 타이밍상으로도 안전하다: 이 코드는 <head> 인라인이라 파싱 중 동기 실행되고, React가 실제로
//    hook.onCommitFiberRoot를 호출하는 건 하이드레이션(번들 로드 후)이라 훨씬 뒤다.
const EARLY_HOOK_SCRIPT_BODY = `
(function () {
  if (window.__RRB_INJECTED__) return;
  window.__RRB_INJECTED__ = true;
  window.__RRB_DEV__ = true;

  window.__RRB_ROOTS__ = window.__RRB_ROOTS__ || new Map();
  // FiberRoot 객체 자체를 키로 쓴다(커밋마다 같은 FiberRoot 객체가 재사용되므로 root당 1엔트리).
  // rendererID 키였을 땐 한 renderer의 여러 root(대상 앱 + Next dev 오버레이 같은 도구 UI root)
  // 중 마지막 커밋 것만 남아, 런타임 부팅 시 재생(drain)에서 앱 root가 유실될 수 있었다(ADR-0068).
  function rrbBufferRoot(root) {
    window.__RRB_COMMITS__ = (window.__RRB_COMMITS__ || 0) + 1;
    try { window.__RRB_ROOTS__.set(root, root); } catch (e) {}
  }

  var rrbHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!rrbHook) {
    // 훅이 아직 없다 — 우리가 심는다(this 비의존, 위 주석 참고).
    var rrbRenderers = new Map();
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      isDisabled: false, supportsFiber: true, renderers: rrbRenderers,
      inject: function (r) { var id = rrbRenderers.size + 1; rrbRenderers.set(id, r); return id; },
      onCommitFiberRoot: function (rendererID, root) { rrbBufferRoot(root); },
      onCommitFiberUnmount: function () {},
      onPostCommitFiberRoot: function () {},
    };
  } else if (!rrbHook.__rrbPatched__) {
    // 이미 있다(DevTools/React Scan 확장 등이 document_start에 선점) — onCommitFiberRoot만
    // 원본 보존하며 한 번 감싼다(위 "왜 안전한가" 참고).
    rrbHook.__rrbPatched__ = true;
    var rrbOriginalOnCommit = rrbHook.onCommitFiberRoot;
    rrbHook.onCommitFiberRoot = function (rendererID, root) {
      rrbBufferRoot(root);
      if (typeof rrbOriginalOnCommit === 'function') return rrbOriginalOnCommit.apply(this, arguments);
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
