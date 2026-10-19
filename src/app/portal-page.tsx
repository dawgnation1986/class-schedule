import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchPortalHtml, getPortalCookie, PORTAL_SITE } from '@/lib/portal';

/** 页面是否是登录页(会话失效) */
const isLoginPage = (h: string) => /loginp\.aspx|txtAuthCode/i.test(h);

/** 注入到原站页面的 CSS: 统一视觉规范 (App 风格设计语言)
 *  规范: ①原站深蓝横幅带一律中性化, 页面标题居中加粗
 *        ②链接默认正文色无下划线, 交互链接(表格操作/分页/菜单)统一蓝色
 *        ③输入/下拉/按钮/文件选择统一圆角规格; 数据表格一律卡片化+斑马纹+横向滚动
 *        ④分页链接做成胶囊 chips; 长提示文本做成信息卡片(JS 分级), 必填星号保持内联红色 */
const SKIN_CSS = `
* { box-sizing: border-box; -webkit-tap-highlight-color: rgba(37,99,235,.10); }
html { -webkit-text-size-adjust: 100%; }
body {
  background: #f3f5f9; margin: 0; padding: 0 0 40px; color: #1f2937;
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
}
.container { max-width: 760px !important; margin: 0 auto; padding: 0 14px !important; width: 100%; }
img { max-width: 100% !important; height: auto; }

/* --- 原站深蓝横幅带: 中性化(由 JS 按亮度兜底处理任意颜色) --- */
div[style*="0163ac"], div[style*="084EA4"], div[style*="084ea4"] { background: transparent !important; padding: 0 !important; margin: 0 !important; height: auto !important; }
div[style*="0163ac"] img, div[style*="084EA4"] img { display: none !important; }
hr { display: none !important; }
p.text-center { font-size: 17px; font-weight: 800; color: #111827; text-align: center; margin: 14px 0 10px; letter-spacing: .5px; }

/* --- 链接规范: 默认正文色, 交互链接蓝色 --- */
a, u { color: #1f2937; text-decoration: none !important; }
table a, .dropdown-menu a, a[id*="Link"], a[href*="__doPostBack"] { color: #2563eb; font-weight: 500; }
a[style*="Red"], a[style*="red"] { color: #dc2626 !important; }

/* --- 表单控件: 兼容旧类名(.ddl/.button/无类名控件)统一美化 --- */
label.control-label { font-size: 13px; color: #6b7280; margin-bottom: 4px; display: inline-block; font-weight: 500; line-height: 1.5; }
.input-group { padding: 4px 0 !important; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; }
.input-group-addon { background: transparent !important; border: none !important; color: #374151 !important; font-size: 13px !important; padding-left: 0 !important; min-width: 64px; white-space: nowrap; flex-shrink: 0; }
select, textarea, input[type="text"], input[type="password"] {
  height: auto !important; min-height: 40px; line-height: 1.4 !important;
  border: 1px solid #d8dee8 !important; border-radius: 10px !important;
  background: #ffffff !important; color: #1f2937 !important; font-size: 14px !important;
  padding: 9px 10px !important; box-shadow: 0 1px 2px rgba(17,24,39,.04) !important;
  appearance: none; -webkit-appearance: none; vertical-align: middle; max-width: 100%;
}
/* 内联定宽的下拉: 放开宽度由内容决定, 否则文字横向截断 */
select[style*="width"] { width: auto !important; max-width: 100%; min-width: 88px; padding: 8px 10px !important; }
select[multiple] { padding: 4px !important; }
select.form-control, input.form-control, textarea.form-control {
  width: 100%; min-height: 44px; font-size: 15px !important; padding: 10px 12px !important;
}
select.form-control[disabled], input.form-control[disabled], input.form-control[readonly] { background: #f3f4f6 !important; color: #6b7280 !important; }
select:focus, input:focus, textarea:focus { border-color: #2563eb !important; outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,.15) !important; }

/* --- 文件选择: 醒目可点(原站 input[type=file] 默认几乎不可见) --- */
input[type="file"] {
  display: block !important; width: 100% !important; min-height: 44px;
  border: 1px dashed #b6c6f5 !important; border-radius: 10px !important;
  background: #f6f9ff !important; padding: 10px 12px !important;
  font-size: 13px !important; color: #374151 !important; margin: 8px 0;
}

/* --- 按钮规范 --- */
input[type="submit"], input[type="button"], input.button, button, .btn {
  height: auto !important; min-height: 40px; line-height: 1.4 !important;
  border: none !important; border-radius: 10px !important; font-size: 14px !important;
  padding: 10px 18px !important; min-width: 88px; cursor: pointer; vertical-align: middle;
}
input[type="submit"], .btn-primary {
  background: linear-gradient(135deg, #2563eb, #1d4ed8) !important; color: #fff !important;
  box-shadow: 0 2px 6px rgba(37,99,235,.35);
}
.btn-default { background: #fff !important; color: #374151 !important; border: 1px solid #d8dee8 !important; }
.dropdown-menu { border-radius: 12px !important; box-shadow: 0 8px 24px rgba(0,0,0,.12) !important; border: 1px solid #e5e7eb !important; }
.dropdown-menu > li > a { padding: 10px 16px !important; font-size: 14px; color: #1f2937 !important; }

/* --- 数据表格: 卡片化 + 斑马纹 + 横向滚动(列宽由内容决定, 消除大空档) --- */
.tbl-wrap {
  overflow-x: auto; -webkit-overflow-scrolling: touch;
  background: #fff; border-radius: 14px; border: 1px solid #eef1f5;
  box-shadow: 0 1px 3px rgba(17,24,39,.07), 0 1px 2px rgba(17,24,39,.04); margin: 10px 0;
}
.tbl-wrap table { width: 100% !important; }
table {
  border-collapse: separate !important; border-spacing: 0 !important;
  border: none !important; background: transparent !important; box-shadow: none !important; margin: 0 !important;
}
table td, table th {
  border: none !important; border-bottom: 1px solid #eef1f5 !important;
  padding: 10px 12px !important; font-size: 13px; line-height: 1.5; color: #1f2937;
  background: transparent !important; vertical-align: middle; word-break: break-word; text-align: left;
}
table th { white-space: nowrap; font-weight: 600; }
table tr:first-child td, table tr:first-child th { background: #f3f5f9 !important; font-weight: 700 !important; color: #4b5563 !important; font-size: 12px; white-space: nowrap; }
table tr:nth-child(even) td { background: #fafbfd !important; }
table tr:last-child td { border-bottom: none !important; }
table td:first-child, table th:first-child { color: #6b7280; }

/* --- 空表格占位行(JS 在仅剩表头时插入"暂无数据") --- */
table tr td.empty-cell {
  text-align: center !important; color: #9ca3af !important;
  padding: 24px 0 !important; background: #fff !important; font-size: 13px !important;
}

/* --- 分页链接: 胶囊 chips --- */
a[id*="LinkBut"] {
  display: inline-block; padding: 5px 13px; margin: 2px; border-radius: 999px;
  background: #fff; border: 1px solid #e5e7eb; color: #374151 !important; font-size: 12px;
}
span[style*="font-weight:bold"], span[style*="font-weight:bold;"] { color: #2563eb !important; }

/* --- 红色文本分级: 必填星号等短文本保持内联红色; 长提示(JS 加类)做成信息卡片 --- */
span[style*="Red"], span[style*="red"], font[color="red"], font[color="Red"] { color: #dc2626; }
.msg-card {
  display: block; background: #fff; border: 1px solid #eef1f5; border-left: 3px solid #f59e0b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; line-height: 1.7;
}

/* --- 顶部信息条(班级/学号/姓名/性别 JS 拆分成 chips) --- */
.info-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.info-chip {
  background: #fff; border: 1px solid #e8edf5; border-radius: 10px; padding: 6px 12px;
  font-size: 13px; color: #6b7280; box-shadow: 0 1px 2px rgba(17,24,39,.05);
}
.info-chip b { color: #111827; font-weight: 700; margin-left: 4px; }

/* --- 专业排名卡片 --- */
.rank-cards { display: flex; gap: 10px; margin: 10px 0; }
.rank-card {
  flex: 1; background: linear-gradient(160deg, #ffffff, #eef4ff); border: 1px solid #e3eafc;
  border-radius: 14px; padding: 14px 6px; text-align: center; box-shadow: 0 1px 3px rgba(37,99,235,.08);
}
.rc-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
.rc-value { font-size: 22px; font-weight: 800; color: #1d4ed8; }
.rc-value small { font-size: 12px; font-weight: 600; color: #374151; margin-left: 1px; }
.rc-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }

/* --- 隐藏原站悬浮挂件 --- */
[style*="position:fixed"], [style*="position: fixed"] { display: none !important; }
a { -webkit-touch-callout: none; }
`;

/** 弹窗拦截: 原站大量使用 window.open(页)+moveTo/resizeTo 的弹窗链接,
 *  返回假窗口对象保证后续调用不抛错(否则浏览器会回退执行 href 的 __doPostBack 刷新原页),
 *  同时改为当前页跳转。需在页面脚本执行前注入。 */
const POPUP_JS = `(function(){
  var fakeWin = { moveTo:function(){}, resizeTo:function(){}, close:function(){}, focus:function(){}, blur:function(){}, print:function(){}, closed:false, opener:null,
    document:{ write:function(){}, writeln:function(){}, close:function(){} } };
  window.open = function(u){ if (u) { location.href = u; } return fakeWin; };
})(); true;`;

/** 页面脚本: 视口兜底 + 样式注入 + 深色横幅中性化 + 信息条 chips 化
 *  + 红色文本分级 + 无用按钮/空占位清理 + 数据表格整理(列宽/空列/空态) + 排名卡片化 */
const INJECT_JS = `
(function(){
  if (!document.querySelector('meta[name="viewport"]')) {
    var m = document.createElement('meta');
    m.name = 'viewport';
    m.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(m);
  }
  if (!document.getElementById('app-skin')) {
    var s = document.createElement('style');
    s.id = 'app-skin';
    s.textContent = ${JSON.stringify(SKIN_CSS)};
    document.head.appendChild(s);
  }

  function txt(el){ return el ? (el.textContent || '').replace(/[\\u00a0\\s]+/g, '') : ''; }
  function hide(el){ if (el) el.style.display = 'none'; }

  // 深色横幅带(任意颜色): 背景转透明, 文字转正文色, 横幅图(校徽 BR.JPG)隐藏
  var divs = document.getElementsByTagName('div');
  for (var i = 0; i < divs.length; i++) {
    var bg;
    try { bg = getComputedStyle(divs[i]).backgroundColor; } catch (e) { continue; }
    var rgb = bg.match(/(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/);
    if (!rgb) continue;
    var bright = 0.299 * rgb[1] + 0.587 * rgb[2] + 0.114 * rgb[3];
    if (bright < 130) {
      divs[i].style.backgroundColor = 'transparent';
      divs[i].style.color = '#1f2937';
      divs[i].style.lineHeight = '1.6';
      var bims = divs[i].getElementsByTagName('img');
      for (var bi = 0; bi < bims.length; bi++) bims[bi].style.display = 'none';
    }
  }
  var brs = document.querySelectorAll('img[src*="BR.JPG"]');
  for (var br = 0; br < brs.length; br++) brs[br].style.display = 'none';

  // 顶部信息条(成绩页/花名册/实习页): "姓名：xx 性别：xx …" → chips
  var infoIds = ['Label_cj', 'Label_row1'];
  for (var q = 0; q < infoIds.length; q++) {
    var lbl = document.getElementById(infoIds[q]);
    if (!lbl || document.querySelector('.info-chips')) break;
    var parts = (lbl.textContent || '').split(/(?:[，,]|\\s)+/);
    var box = document.createElement('div');
    box.className = 'info-chips';
    var chips = 0;
    for (var pI = 0; pI < parts.length; pI++) {
      var seg = parts[pI].replace(/\\s+/g, ' ').trim();
      if (!seg) continue;
      var kv = seg.split(/[：:]/);
      var chip = document.createElement('span');
      chip.className = 'info-chip';
      chip.appendChild(document.createTextNode((kv[0] || seg).replace(/\\s+/g, '')));
      var val = kv.slice(1).join('：').trim();
      if (val) {
        var bEl = document.createElement('b');
        bEl.textContent = val;
        chip.appendChild(bEl);
      }
      box.appendChild(chip);
      chips++;
    }
    if (chips > 0) { lbl.parentNode.insertBefore(box, lbl); hide(lbl); }
  }

  // 红色文本分级: 长提示(>=7字) → 信息卡片; 必填星号等短文本保持内联
  var reds = document.querySelectorAll('span[style*="Red"], span[style*="red"], font[color="red"], font[color="Red"]');
  for (var r = 0; r < reds.length; r++) {
    var el = reds[r];
    var t = txt(el);
    if (!t || t.length < 7 || el.id === 'Label_cj') continue;
    el.className = 'msg-card';
    el.style.color = '#374151';
  }

  // 原站无用按钮: "刷新"(测评卷页的整页刷新按钮, App 下拉即可刷新)
  var subs = document.querySelectorAll('input[type="submit"], input[type="button"]');
  for (var sb = 0; sb < subs.length; sb++) {
    if (/^\\s*刷新\\s*$/.test(subs[sb].value || '')) hide(subs[sb]);
  }

  // 纯空白的小间隔 div 压平(消除大段空白)
  var ds = document.getElementsByTagName('div');
  for (var d = 0; d < ds.length; d++) {
    var dv = ds[d];
    if (dv.children.length > 0 || txt(dv)) continue;
    var hm = (dv.getAttribute('style') || '').match(/height\\s*:\\s*(\\d+)/i);
    if (hm && parseInt(hm[1], 10) <= 20) {
      dv.style.height = '0';
      dv.style.margin = '0';
      dv.style.padding = '0';
    }
  }

  // 原站写死 height 的容器, 内容放不下就自适应(否则换行文字叠到下一块)
  for (var d2 = 0; d2 < ds.length; d2++) {
    var dv2 = ds[d2];
    if (!/height\\s*:\\s*\\d+/.test(dv2.getAttribute('style') || '')) continue;
    if (dv2.scrollHeight > dv2.clientHeight + 2) dv2.style.height = 'auto';
  }

  // 原站部分页面没有 .container 外壳, 表格/表单会贴满屏幕边缘
  if (!document.querySelector('.container')) {
    var shell = document.createElement('div');
    shell.className = 'container';
    while (document.body.firstChild) shell.appendChild(document.body.firstChild);
    document.body.appendChild(shell);
  }

  // 数据表格整理: 去掉服务端写死的列宽 + 删整列皆空的列 + 空表补"暂无数据"
  var grids = document.querySelectorAll('table[id]');
  for (var g = 0; g < grids.length; g++) {
    var t = grids[g];
    if (t.id.indexOf('DataGrid') !== 0 && !t.querySelector('.HeadRow')) continue;
    var rs = t.rows;
    if (!rs.length) continue;
    // 列宽由内容决定(原站写死 width:25% 等, 造成"楚河汉界"式大空档)
    for (var r1 = 0; r1 < rs.length; r1++) {
      var c1 = rs[r1].cells;
      for (var x = 0; x < c1.length; x++) {
        c1[x].removeAttribute('width');
        c1[x].style.width = '';
      }
    }
    if (rs.length > 1) {
      // 删除整列皆空的列(如"床位""操作"列全是空白, 白占宽度)
      var cols = 0;
      for (var r0 = 0; r0 < rs.length; r0++) cols = Math.max(cols, rs[r0].cells.length);
      for (var c = cols - 1; c >= 0; c--) {
        var empty = true;
        for (var rr = 1; rr < rs.length; rr++) {
          var cell = rs[rr].cells[c];
          if (cell && cell.textContent.replace(/[\\u00a0\\s]/g, '') !== '') { empty = false; break; }
        }
        if (empty) {
          for (var r2 = 0; r2 < rs.length; r2++) {
            if (rs[r2].cells[c]) rs[r2].deleteCell(c);
          }
        }
      }
    } else if (rs[0].cells.length > 0) {
      // 只有表头(0 条记录): 补一行空态占位, 避免整块消失
      var er = t.insertRow(1);
      var ec = er.insertCell(0);
      if (rs[0].cells.length > 1) ec.colSpan = rs[0].cells.length;
      ec.className = 'empty-cell';
      ec.textContent = '暂无数据';
    }
  }

  // 0 条记录: 隐藏"共有0条记录…第x页"与分页链接
  var lr = document.getElementById('LabelRecord');
  if (lr && txt(lr) === '0') {
    hide(lr.closest ? lr.closest('font') : null);
    var links = document.querySelectorAll('a[id*="LinkBut"]');
    for (var lk = 0; lk < links.length; lk++) hide(links[lk]);
  }

  // 所有数据表格包一层横向滚动容器
  var tables = document.querySelectorAll('table');
  for (var i2 = 0; i2 < tables.length; i2++) {
    var tb = tables[i2];
    if (tb.parentElement && tb.parentElement.className === 'tbl-wrap') continue;
    var w = document.createElement('div');
    w.className = 'tbl-wrap';
    tb.parentNode.insertBefore(w, tb);
    w.appendChild(tb);
  }

  // 成绩页: 专业排名表格 → 摘要卡片
  var rank = null;
  for (var j = 0; j < tables.length; j++) {
    if (/专业学年排名|排名百分比/.test(tables[j].textContent)) { rank = tables[j]; break; }
  }
  if (rank && !document.querySelector('.rank-cards')) {
    var rows = rank.rows;
    var data = rows[rows.length - 1];
    var head = rows[0].cells, cells = data ? data.cells : [];
    var rk = document.createElement('div');
    rk.className = 'rank-cards';
    var made = 0;
    for (var k = 0; k < 3; k++) {
      var rankV = cells[k * 2] ? cells[k * 2].textContent.replace(/\\s+/g, '') : '';
      var pctV = cells[k * 2 + 1] ? cells[k * 2 + 1].textContent.replace(/\\s+/g, '') : '';
      var label = head[k] ? head[k].textContent.replace(/成绩专业排名|专业排名|百分比/g, '').replace(/\\s+/g, '') : '';
      if (!label) label = '第' + (k + 1) + '学年';
      if (!rankV && !pctV) continue;
      var card = document.createElement('div');
      card.className = 'rank-card';
      card.innerHTML = '<div class="rc-label">' + label + '</div>' +
        '<div class="rc-value">' + (rankV || '—') + (rankV ? '<small>名</small>' : '') + '</div>' +
        '<div class="rc-sub">' + (pctV ? '前 ' + pctV.replace('%', '') + '%' : ' ') + '</div>';
      rk.appendChild(card);
      made++;
    }
    if (made > 0) {
      var wrap = rank.closest ? rank.closest('.tbl-wrap') : null;
      var anchor = wrap || rank;
      anchor.parentNode.insertBefore(rk, anchor);
      anchor.style.display = 'none';
    }
  }
})();
true;
`;

/** 用引导页把登录会话 Cookie 写进 WebView 的 CookieStore, 再跳到目标页 */
function bootstrapHtml(cookie: string, targetUrl: string): string {
  const sets = cookie
    .split(/;\s*/)
    .filter((p) => p.includes('='))
    .map((p) => `document.cookie=${JSON.stringify(`${p}; path=/`)};`)
    .join('');
  return `<script>${sets}location.replace(${JSON.stringify(targetUrl)});</script>`;
}

/** 主站应用页面: 原站页面 + 样式注入 (WebView), 保留 App 外壳 */
export default function PortalPageScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const router = useRouter();
  const { title, path } = useLocalSearchParams<{ title?: string; path?: string }>();
  const p = typeof path === 'string' ? path : '';
  const webref = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [checking, setChecking] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstLoading, setFirstLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  const targetUrl = `${PORTAL_SITE}${p.startsWith('/') ? p : '/' + p}`;
  // 引导页 source 固定, 避免重渲染触发 WebView 重载
  const bootSource = useMemo(
    () => ({ html: bootstrapHtml(getPortalCookie(), targetUrl), baseUrl: `${PORTAL_SITE}/` }),
    [targetUrl],
  );

  // 先用轻量请求检查会话是否有效 (原生用登录会话 Cookie; Web 由浏览器携带)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await fetchPortalHtml(p);
        if (!alive) return;
        setNeedLogin(isLoginPage(h));
      } catch {
        if (alive) setLoadError('页面加载失败，请稍后重试');
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [p]);

  const onNavChange = useCallback(
    (nav: WebViewNavigation) => {
      // 会话失效会被重定向回登录页
      if (nav.url.includes('loginp.aspx')) setNeedLogin(true);
    },
    [],
  );

  /** Web 端: iframe 同源, 加载完注入同样的样式与 window.open 改写 */
  const onIframeLoad = useCallback(() => {
    setFirstLoading(false);
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      if (!doc.getElementById('app-skin')) {
        const s = doc.createElement('style');
        s.id = 'app-skin';
        s.textContent = SKIN_CSS;
        doc.head.appendChild(s);
      }
      iframeRef.current!.contentWindow!.open = (u: string | undefined) => {
        if (u) iframeRef.current!.contentWindow!.location.href = u;
        return null;
      };
      if (/loginp\.aspx/i.test(iframeRef.current!.contentWindow!.location.href)) setNeedLogin(true);
    } catch {
      // 跨域等异常忽略
    }
  }, []);

  const reload = useCallback(() => {
    setNeedLogin(false);
    setLoadError(null);
    setFirstLoading(true);
    if (Platform.OS === 'web') setIframeKey((k) => k + 1);
    else webref.current?.reload();
  }, []);

  const body = () => {
    if (checking) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#2563eb" />
        </View>
      );
    }
    if (needLogin) {
      return (
        <View style={[styles.center, { gap: Spacing.two, padding: Spacing.three }]}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>会话已失效，请到“主站”重新登录后再进入此页面。</Text>
          <Pressable onPress={() => router.navigate('/home')} style={[styles.loginBtn, { backgroundColor: '#2563eb' }]}>
            <Text style={{ color: '#fff', fontSize: 14 }}>去主站登录</Text>
          </Pressable>
        </View>
      );
    }
    if (loadError) {
      return (
        <View style={[styles.center, { gap: Spacing.two, padding: Spacing.three }]}>
          <Text style={{ color: '#ef4444' }}>{loadError}</Text>
          <Pressable onPress={reload} style={[styles.loginBtn, { backgroundColor: colors.backgroundElement }]}>
            <Text style={{ color: colors.text, fontSize: 14 }}>重试</Text>
          </Pressable>
        </View>
      );
    }
    if (Platform.OS === 'web') {
      // Web 预览: 走 Metro 同源代理 iframe (不做重点维护)
      return (
        <iframe
          key={iframeKey}
          ref={iframeRef as never}
          src={`/timetable-proxy${p.startsWith('/') ? p : '/' + p}`}
          onLoad={onIframeLoad}
          style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#f2f4f8' }}
          title={title || 'portal'}
        />
      );
    }
    return (
      <WebView
        ref={webref}
        source={bootSource}
        injectedJavaScript={INJECT_JS}
        injectedJavaScriptBeforeContentLoaded={POPUP_JS}
        injectedJavaScriptForMainFrameOnly={false}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
        onNavigationStateChange={onNavChange}
        onLoadEnd={(e) => {
          // 引导页不算加载完成, 目标页(及其回发页)加载完才收起指示器
          const u: string = e.nativeEvent.url || '';
          if (u.includes('loginp.aspx')) setNeedLogin(true);
          if (p && u.includes(p)) setFirstLoading(false);
        }}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        originWhitelist={['*']}
        style={{ backgroundColor: '#f2f4f8' }}
        renderError={() => (
          <View style={styles.center}>
            <Text style={{ color: colors.textSecondary }}>页面加载失败，请检查网络后重试</Text>
          </View>
        )}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.backgroundElement }]}>
          <Text style={{ color: colors.text, fontSize: 14 }}>← 返回</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {title || '应用'}
        </Text>
        {/* 右侧占位与返回按钮等宽, 保证标题真正居中; 加载中显示指示器(不设刷新按钮) */}
        <View style={styles.headerSide}>
          {firstLoading && !checking ? <ActivityIndicator size="small" color="#2563eb" /> : null}
        </View>
      </View>
      <View style={styles.body}>{body()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two },
  backBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 64, alignItems: 'center' },
  headerSide: { minWidth: 64, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 22 },
});
