/**
 * liquid-glass-js WebView 注入脚本
 * 在「液态玻璃」界面模式下, 向主站 WebView 页面注入原版 liquid-glass-js
 * (https://github.com/dashersw/liquid-glass-js), 生成真折射玻璃悬浮面板。
 * 依赖: html2canvas(JSdelivr CDN) + container.js/button.js(JSdelivr GH CDN)
 * 安全策略: 仅主框架运行 / 全局单例 / WebGL2 检测 / 全链路 try-catch 静默降级
 */

/** 玻璃组件样式(来自库内 glass.css, 仅组件类不污染原站) */
const LG_CSS = `
.glass-container { position: relative; display: flex; align-items: center; justify-content: center; gap: 20px; padding: 10px; box-sizing: border-box; }
.glass-container-circle { aspect-ratio: 1 / 1; flex-shrink: 0; flex-grow: 0; }
.glass-container-pill { flex-shrink: 0; flex-grow: 0; }
.glass-button { position: relative; box-shadow: 0 25px 50px rgba(0,0,0,0.25); cursor: pointer; pointer-events: auto; flex-shrink: 0; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.glass-button-circle { aspect-ratio: 1 / 1; flex-shrink: 0; flex-grow: 0; }
.glass-button-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 1; pointer-events: none; font-weight: 500; color: white; font-family: system-ui, -apple-system, sans-serif; white-space: nowrap; }
`;

const CDN = {
  html2canvas: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  container: 'https://cdn.jsdelivr.net/gh/dashersw/liquid-glass-js@main/container.js',
  button: 'https://cdn.jsdelivr.net/gh/dashersw/liquid-glass-js@main/button.js',
};

/** 注入脚本: 挂载真折射玻璃悬浮面板(回顶部 / 刷新 / 关闭) */
export const GLASS_JS = `
(function(){
  try {
    if (window.top !== window) return;          // 仅主框架, 避免iframe重复
    if (window.__lgInstalled) return;           // 单例
    window.__lgInstalled = true;

    // WebGL2 前置检测(库的硬性要求, 不支持则静默放弃)
    if (!document.createElement('canvas').getContext('webgl2')) return;

    // 组件样式
    if (!document.getElementById('lg-css')) {
      var st = document.createElement('style');
      st.id = 'lg-css';
      st.textContent = ${JSON.stringify(LG_CSS)};
      document.head.appendChild(st);
    }

    // 串行加载依赖脚本
    function loadSeq(srcs, done) {
      var i = 0;
      (function next() {
        if (i >= srcs.length) return done();
        var sc = document.createElement('script');
        sc.src = srcs[i++];
        sc.onload = next;
        sc.onerror = function(){ /* 静默: 网络不可用则放弃玻璃面板 */ };
        document.head.appendChild(sc);
      })();
    }

    loadSeq([${JSON.stringify(CDN.html2canvas)}, ${JSON.stringify(CDN.container)}, ${JSON.stringify(CDN.button)}], function(){
      try {
        if (typeof Container !== 'function' || typeof Button !== 'function' || typeof html2canvas !== 'function') return;

        var c = new Container({ borderRadius: 30, type: 'pill', tintOpacity: 0.22 });
        c.element.style.cssText = 'position:fixed;right:14px;bottom:110px;z-index:2147483646;';

        var bTop = new Button({ text: '顶部', size: 15, type: 'pill', onClick: function(){
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }});
        var bReload = new Button({ text: '刷新', size: 15, type: 'pill', onClick: function(){
          location.reload();
        }});
        var bClose = new Button({ text: '×', size: 17, type: 'circle', onClick: function(){
          try { c.element.remove(); } catch(e){}
          window.__lgInstalled = false;
        }});

        c.addChild(bTop);
        c.addChild(bReload);
        c.addChild(bClose);
        document.body.appendChild(c.element);
      } catch (e) { /* WebGL/采样失败等一律静默, 不影响原站功能 */ }
    });
  } catch (e) { /* 任何异常不影响原站 */ }
})(); true;
`;
