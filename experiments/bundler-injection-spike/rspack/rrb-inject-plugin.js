const INJECT_SCRIPT = `<script>
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
</script>`;

class RrbInjectPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('RrbInjectPlugin', (compilation) => {
      const HtmlWebpackPlugin = require('html-webpack-plugin');
      HtmlWebpackPlugin.getHooks(compilation).beforeEmit.tapAsync(
        'RrbInjectPlugin',
        (data, cb) => {
          data.html = data.html.replace('<head>', `<head>\n${INJECT_SCRIPT}`);
          cb(null, data);
        }
      );
    });
  }
}

module.exports = RrbInjectPlugin;
