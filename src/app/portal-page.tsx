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

/** 注入到原站页面的 CSS: 统一视觉规范 (白底 + 蓝主色的 App 风格设计语言)
 *  规范: ①原站深蓝横幅带一律中性化, 页面标题居中加粗
 *        ②链接默认正文色无下划线, 交互链接(表格操作/分页/菜单)统一蓝色
 *        ③输入/下拉/按钮/文件选择统一圆角规格(下拉带箭头指示); 表单由 JS 重排为
 *          "label 在上 + 控件全宽在下"的竖排字段, 按钮归组等宽排列, 不再挤压截断
 *        ④数据表格一律卡片化+斑马纹+横向滚动, 列数多的表格 JS 设最小列宽防止挤成单字
 *        ⑤分页链接归组为居中胶囊 chips; 长提示文本做成信息卡片(JS 分级) */
const SKIN_CSS = `
* { box-sizing: border-box; -webkit-tap-highlight-color: rgba(37,99,235,.10); }
html { -webkit-text-size-adjust: 100%; }
body {
  background: #f4f6fa; margin: 0; padding: 0 0 48px; color: #1e293b;
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 15px; line-height: 1.6;
}
.container { max-width: 720px !important; margin: 0 auto; padding: 0 16px !important; width: 100%; }
img { max-width: 100% !important; height: auto; }

/* --- 原站深蓝横幅带: 中性化(由 JS 按亮度兜底处理任意颜色) --- */
div[style*="0163ac"], div[style*="084EA4"], div[style*="084ea4"] { background: transparent !important; padding: 0 !important; margin: 0 !important; height: auto !important; }
div[style*="0163ac"] img, div[style*="084EA4"] img { display: none !important; }
hr { display: none !important; }

/* --- 页面标题 --- */
p.text-center { font-size: 17px; font-weight: 700; color: #0f172a; text-align: center; margin: 18px 0 14px; letter-spacing: .5px; }

/* --- 链接规范: 默认正文色, 交互链接蓝色 --- */
a, u { color: #1e293b; text-decoration: none !important; }
table a, .dropdown-menu a, a[id*="Link"], a[href*="__doPostBack"] { color: #2563eb; font-weight: 500; }
a[style*="Red"], a[style*="red"] { color: #dc2626 !important; }

/* --- 表单: JS 重排后的竖排字段 + 原站旧结构(.input-group)兜底 --- */
.skin-form { margin: 2px 0 6px; }
.form-field { margin: 0 0 14px; }
.form-field .form-label { display: block; font-size: 13px; color: #64748b; font-weight: 600; margin: 0 0 6px; line-height: 1.5; }
.form-field select, .form-field input[type="text"], .form-field input[type="password"],
.form-field input[type="tel"], .form-field input[type="number"], .form-field input[type="date"], .form-field textarea {
  width: 100% !important; max-width: 100% !important;
}
label.control-label { display: block; font-size: 13px; color: #64748b; margin: 0 0 6px; font-weight: 600; line-height: 1.5; }
.input-group { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0 !important; margin-bottom: 12px; }
.input-group-addon { background: transparent !important; border: none !important; color: #475569 !important; font-size: 13px !important; padding-left: 0 !important; white-space: nowrap; flex-shrink: 0; }

/* --- 控件: 统一圆角/高度, 下拉带箭头指示 --- */
select, textarea, input[type="text"], input[type="password"] {
  height: auto !important; min-height: 44px; line-height: 1.4 !important;
  border: 1px solid #d9e1ec !important; border-radius: 12px !important;
  background: #fff !important; color: #1e293b !important; font-size: 15px !important;
  padding: 10px 12px !important; box-shadow: 0 1px 2px rgba(15,23,42,.05) !important;
  appearance: none; -webkit-appearance: none; vertical-align: middle; max-width: 100%;
  font-family: inherit;
}
select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important; background-position: right 12px center !important;
  background-size: 14px !important; padding-right: 34px !important;
}
select[style*="width"] { width: auto !important; max-width: 100%; min-width: 96px; }
select[multiple] { padding: 6px !important; background-image: none !important; }
select.form-control, input.form-control, textarea.form-control { width: 100%; min-height: 46px; padding: 11px 12px !important; }
select[disabled], input[disabled], input[readonly], textarea[disabled], textarea[readonly] { background: #f1f5f9 !important; color: #94a3b8 !important; }
select:focus, input:focus, textarea:focus { border-color: #2563eb !important; outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,.14) !important; }

/* --- 文件选择: JS 重构为"蓝色按钮 + 文件名"样式, 真实 input 透明覆盖(点击行为不变);
        未执行 JS 的场景(仅注入 CSS 的 web iframe)回退为醒目虚线框 --- */
input[type="file"] {
  display: block !important; width: 100% !important; min-height: 48px; box-sizing: border-box;
  border: 1.5px dashed #b9cdf5 !important; border-radius: 12px !important;
  background: #f6f9ff !important; padding: 12px 14px !important;
  font-size: 13px !important; color: #475569 !important; margin: 8px 0;
}
.file-box {
  position: relative; display: flex; align-items: center; gap: 10px;
  border: 1.5px dashed #b9cdf5; border-radius: 12px; background: #f6f9ff;
  padding: 10px 12px; margin: 8px 0; overflow: hidden;
}
.file-btn {
  display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 9px;
  background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff;
  font-size: 13px; font-weight: 600; white-space: nowrap;
  box-shadow: 0 2px 6px rgba(37,99,235,.25);
}
.file-name { font-size: 13px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
input[type="file"].file-native {
  position: absolute; top: 0; left: 0; width: 100% !important; height: 100%;
  min-height: 0 !important; opacity: 0; margin: 0 !important; padding: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer; z-index: 2;
}

/* --- 按钮组: JS 归组为 .btn-row, 等宽排列不截断 --- */
.btn-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 6px; }
.btn-row input[type="submit"], .btn-row input[type="button"], .btn-row button { flex: 1 1 auto; }
input[type="submit"], input[type="button"], input.button, button, .btn {
  height: auto !important; min-height: 44px; line-height: 1.4 !important;
  border: none !important; border-radius: 12px !important; font-size: 15px !important;
  padding: 11px 22px !important; min-width: 104px; cursor: pointer; vertical-align: middle;
  white-space: nowrap; font-family: inherit;
}
input[type="submit"], .btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important; color: #fff !important;
  box-shadow: 0 4px 10px rgba(37,99,235,.28);
}
input[type="button"], .btn-default { background: #fff !important; color: #334155 !important; border: 1px solid #d9e1ec !important; box-shadow: 0 1px 2px rgba(15,23,42,.05); }
.dropdown-menu { border-radius: 14px !important; box-shadow: 0 10px 30px rgba(15,23,42,.14) !important; border: 1px solid #e6ecf5 !important; }
.dropdown-menu > li > a { padding: 11px 16px !important; font-size: 14px; color: #1e293b !important; }

/* --- 数据表格: 卡片化 + 斑马纹 + 横向滚动(多列表格 JS 设最小列宽, 防止挤成单字竖排) --- */
.tbl-wrap {
  overflow-x: auto; -webkit-overflow-scrolling: touch;
  background: #fff; border-radius: 16px; border: 1px solid #e8edf4;
  box-shadow: 0 2px 6px rgba(15,23,42,.05); margin: 12px 0;
}
.tbl-wrap table { width: 100% !important; }
table {
  border-collapse: separate !important; border-spacing: 0 !important;
  border: none !important; background: transparent !important; box-shadow: none !important; margin: 0 !important;
}
table td, table th {
  border: none !important; border-bottom: 1px solid #eef2f7 !important;
  padding: 11px 14px !important; font-size: 13.5px; line-height: 1.55; color: #1e293b;
  background: transparent !important; vertical-align: middle; text-align: left;
  word-break: normal; overflow-wrap: break-word;
}
table th { white-space: nowrap; font-weight: 600; }
table tr:first-child td, table tr:first-child th { background: #f7f9fc !important; font-weight: 700 !important; color: #475569 !important; font-size: 12px; white-space: nowrap; }
table tr:nth-child(even) td { background: #fafbfd !important; }
table tr:last-child td { border-bottom: none !important; }
table td:first-child, table th:first-child { color: #64748b; }

/* --- 空表格占位行(JS 在仅剩表头时插入"暂无数据") --- */
table tr td.empty-cell {
  text-align: center !important; color: #94a3b8 !important;
  padding: 28px 0 !important; background: #fff !important; font-size: 13px !important;
}

/* --- 分页链接: 归组为居中胶囊 chips --- */
.pager { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 14px 0 4px; }
.pager a, a[id*="LinkBut"] {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 36px; padding: 7px 14px; border-radius: 999px;
  background: #fff; border: 1px solid #d9e1ec; color: #334155 !important; font-size: 13px; font-weight: 500;
}
span[style*="font-weight:bold"], span[style*="font-weight:bold;"] { color: #2563eb !important; }
.record-note { text-align: center; font-size: 12.5px; color: #94a3b8; margin: 10px 0; }

/* --- 红色文本分级: 必填星号等短文本保持内联红色; 长提示(JS 加类)做成素净信息条 --- */
span[style*="Red"], span[style*="red"], font[color="red"], font[color="Red"] { color: #dc2626; }
.msg-card {
  display: block; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #94a3b8;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; line-height: 1.75;
  color: #475569 !important; margin: 12px 0;
}

/* --- 单选/多选: 统一主题色 --- */
input[type="radio"], input[type="checkbox"] { accent-color: #2563eb; width: 16px; height: 16px; margin: 0 4px 0 0; vertical-align: middle; }
.choice-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; margin: 4px 0 14px; font-size: 14px; color: #334155; }
.choice-row span { white-space: nowrap; }

/* --- 表格内的小按钮(缴费/操作列等): 紧凑规格 --- */
table td input[type="submit"], table td input[type="button"], table td button {
  min-width: 0; min-height: 32px; padding: 6px 14px !important; font-size: 13px !important; border-radius: 9px !important;
}

/* --- 顶部信息条(班级/学号/姓名/性别 JS 拆分成 chips) --- */
.info-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.info-chip {
  background: #fff; border: 1px solid #e4eaf3; border-radius: 12px; padding: 7px 12px;
  font-size: 13px; color: #64748b; box-shadow: 0 1px 2px rgba(15,23,42,.04);
}
.info-chip b { color: #0f172a; font-weight: 700; margin-left: 4px; }

/* --- 专业排名卡片 --- */
.rank-cards { display: flex; gap: 10px; margin: 12px 0; }
.rank-card {
  flex: 1; background: linear-gradient(165deg, #ffffff, #eef4ff); border: 1px solid #dbe7fb;
  border-radius: 16px; padding: 16px 6px; text-align: center; box-shadow: 0 2px 8px rgba(37,99,235,.08);
}
.rc-label { font-size: 12px; color: #64748b; margin-bottom: 6px; }
.rc-value { font-size: 24px; font-weight: 800; color: #1d4ed8; }
.rc-value small { font-size: 12px; font-weight: 600; color: #475569; margin-left: 1px; }
.rc-sub { font-size: 12px; color: #64748b; margin-top: 2px; }

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
 *  + 红色文本分级 + 无用按钮/空占位清理
 *  + 表单重排(行内"标签+控件"堆叠 → 竖排字段, 按钮归组 .btn-row)
 *  + 分页链接归组(.pager) + 数据表格整理(最小列宽/删空列/空态/横向滚动) + 排名卡片化 */
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
      divs[i].style.color = '#1e293b';
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
    el.style.color = '#475569';
  }

  // 原站无用按钮: "刷新"(测评卷页的整页刷新按钮, App 下拉即可刷新)
  var subs = document.querySelectorAll('input[type="submit"], input[type="button"]');
  for (var sb = 0; sb < subs.length; sb++) {
    if (/^\\s*刷新\\s*$/.test(subs[sb].value || '')) hide(subs[sb]);
  }

  // 文件选择重构: 原生"选择文件"按钮无法用 CSS 美化 → 蓝色按钮+文件名,
  // 真实 input 透明覆盖整盒(点击仍走原生文件选择, 行为不变)
  var fins = document.querySelectorAll('input[type="file"]');
  for (var fi = 0; fi < fins.length; fi++) {
    var fin = fins[fi];
    if (fin.getAttribute('data-skinfile')) continue;
    fin.setAttribute('data-skinfile', '1');
    var fb = document.createElement('div');
    fb.className = 'file-box';
    var fbtn = document.createElement('span');
    fbtn.className = 'file-btn';
    fbtn.textContent = '选择文件';
    var fname = document.createElement('span');
    fname.className = 'file-name';
    fname.textContent = '未选择任何文件';
    fin.parentNode.insertBefore(fb, fin);
    fb.appendChild(fbtn);
    fb.appendChild(fname);
    fb.appendChild(fin);
    fin.className = (fin.className ? fin.className + ' ' : '') + 'file-native';
    fin.removeAttribute('style');
    if (fin.addEventListener) {
      fin.addEventListener('change', function () {
        var nm = this.parentNode.querySelector('.file-name');
        if (nm) nm.textContent = (this.files && this.files[0]) ? this.files[0].name : '未选择任何文件';
      });
    }
  }

  // 纯空白的小间隔 div 压平(消除大段空白)
  for (var d = 0; d < divs.length; d++) {
    var dv = divs[d];
    if (dv.children.length > 0 || txt(dv)) continue;
    var hm = (dv.getAttribute('style') || '').match(/height\\s*:\\s*(\\d+)/i);
    if (hm && parseInt(hm[1], 10) <= 20) {
      dv.style.height = '0';
      dv.style.margin = '0';
      dv.style.padding = '0';
    }
  }

  // 原站写死 height 的容器, 内容放不下就自适应(否则换行文字叠到下一块)
  for (var d2 = 0; d2 < divs.length; d2++) {
    var dv2 = divs[d2];
    if (!/height\\s*:\\s*\\d+/.test(dv2.getAttribute('style') || '')) continue;
    if (dv2.scrollHeight > dv2.clientHeight + 2) dv2.style.height = 'auto';
  }

  // ===== 表单重排: 行内塞在一起的"文字标签+控件+按钮" → 竖排字段 =====
  //  (label 在上 / 控件全宽在下, 按钮归组 .btn-row 等宽排列, 不再挤压截断)
  var CTRL = 'select,textarea,input[type="text"],input[type="password"],input[type="tel"],input[type="number"],input[type="email"],input[type="date"]';
  function isGridTable(t) {
    if (!t || !t.rows || t.rows.length <= 2) return false;
    return t.id.indexOf('DataGrid') === 0 || !!t.querySelector('.HeadRow');
  }
  function formifyBox(bx) {
    if (bx.getAttribute('data-skinform')) return;
    bx.setAttribute('data-skinform', '1');
    var nodes = [];
    for (var i0 = 0; i0 < bx.childNodes.length; i0++) nodes.push(bx.childNodes[i0]);
    var fields = document.createElement('div');
    fields.className = 'skin-form';
    var labelBuf = '';
    var btnRow = null;
    var choiceRow = null;
    function labelText() {
      return labelBuf.replace(/^[\\s\\u00a0:：]+/, '').replace(/[\\s\\u00a0:：]+$/, '');
    }
    function flushLoose() {
      var tt = labelBuf.replace(/^[\\s\\u00a0]+/, '').replace(/[\\s\\u00a0]+$/, '');
      labelBuf = '';
      if (!tt) return;
      var pe = document.createElement('div');
      pe.style.cssText = 'font-size:14px;color:#334155;margin:10px 0;';
      pe.textContent = tt;
      fields.appendChild(pe); // 按原顺序插入(题干/说明等散落文本)
    }
    function closeChoiceRow() {
      // 结束当前选项行: 行尾还挂着的短选项文字保留在本行
      if (!choiceRow) return;
      var tt = labelBuf.replace(/^[\\s\\u00a0]+/, '').replace(/[\\s\\u00a0]+$/, '');
      labelBuf = '';
      if (tt) {
        var osp = document.createElement('span');
        osp.textContent = tt;
        choiceRow.appendChild(osp);
      }
      choiceRow = null;
    }
    for (var i1 = 0; i1 < nodes.length; i1++) {
      var n = nodes[i1];
      if (n.nodeType === 3) {
        // 选项行进行中遇到长文本(下一题题干): 先收尾当前行
        if (choiceRow) {
          var cand = n.textContent.replace(/^[\\s\\u00a0]+/, '').replace(/[\\s\\u00a0]+$/, '');
          if (cand.length > 8) closeChoiceRow();
        }
        labelBuf += n.textContent;
        continue;
      }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toUpperCase();
      var type = (n.getAttribute('type') || '').toLowerCase();
      if (tag === 'BR' || tag === 'HR') { closeChoiceRow(); flushLoose(); continue; }
      // ASP.NET 隐藏域必须原位保留(回发依赖)
      if (tag === 'INPUT' && type === 'hidden') { fields.appendChild(n); continue; }
      var isCtrl = tag === 'SELECT' || tag === 'TEXTAREA' ||
        (tag === 'INPUT' && ['text','password','tel','number','email','date'].indexOf(type) >= 0);
      var isBtn = (tag === 'INPUT' && ['submit','button','image'].indexOf(type) >= 0) ||
        tag === 'BUTTON' || (tag === 'A' && /btn|button/i.test(n.className || ''));
      var isChoice = tag === 'INPUT' && (type === 'radio' || type === 'checkbox');
      if (isChoice) {
        // 单选/多选: 与紧邻的选项文字保持在一行, 不拆字段
        if (!choiceRow) {
          choiceRow = document.createElement('div');
          choiceRow.className = 'choice-row';
          fields.appendChild(choiceRow);
        }
        var opt = labelText();
        if (opt) {
          var osp = document.createElement('span');
          osp.textContent = opt;
          choiceRow.appendChild(osp);
          labelBuf = '';
        }
        if (n.style) { n.style.width = ''; n.style.height = ''; n.style.display = ''; }
        choiceRow.appendChild(n);
      } else if (isCtrl) {
        choiceRow = null;
        var f = document.createElement('div');
        f.className = 'form-field';
        var lb = labelText();
        if (lb) {
          var le = document.createElement('div');
          le.className = 'form-label';
          le.textContent = lb;
          f.appendChild(le);
        }
        n.removeAttribute('width');
        if (n.style) { n.style.width = ''; n.style.height = ''; n.style.display = ''; }
        f.appendChild(n);
        fields.appendChild(f);
        labelBuf = '';
      } else if (isBtn) {
        closeChoiceRow();
        flushLoose();
        if (!btnRow) { btnRow = document.createElement('div'); btnRow.className = 'btn-row'; }
        if (n.style) { n.style.width = ''; n.style.height = ''; }
        btnRow.appendChild(n);
      } else {
        choiceRow = null;
        var innerCtrls = n.querySelectorAll ? n.querySelectorAll(CTRL) : [];
        var t2 = txt(n);
        var hasChoice = n.querySelector ? n.querySelector('input[type="radio"],input[type="checkbox"]') : null;
        if (n.querySelector && n.querySelector('input[type="file"]')) {
          flushLoose();
          fields.appendChild(n); // 文件选择盒(JS 已重构): 整体保留
        } else if (hasChoice) {
          flushLoose();
          formifyBox(n); // 含单选/多选的子块: 递归整理, 防止选项被当文本吞掉
          fields.appendChild(n);
        } else if (innerCtrls.length > 0) {
          flushLoose();
          if (/input-group/.test(n.className || '')) {
            fields.appendChild(n); // 已有结构: 原样保留(CSS 兜底)
          } else if (n.tagName === 'TABLE' || isGridTable(n.querySelector ? n.querySelector('table') : null)) {
            fields.appendChild(n); // 数据表格: 不重排
          } else {
            formifyBox(n);
            fields.appendChild(n);
          }
        } else if (t2 && t2.length <= 24) {
          labelBuf += n.textContent; // 短文本作为下一个控件的 label
        } else {
          flushLoose();
          fields.appendChild(n);
        }
      }
    }
    flushLoose();
    if (btnRow) fields.appendChild(btnRow);
    while (bx.firstChild) bx.removeChild(bx.firstChild);
    bx.appendChild(fields);
  }
  var boxes = document.querySelectorAll('div,td,p,span,font');
  for (var bx = 0; bx < boxes.length; bx++) {
    var b = boxes[bx];
    if (b.closest && b.closest('[data-skinform]')) continue;
    var bTable = b.closest ? b.closest('table') : null;
    if (b.tagName === 'TD' && bTable && isGridTable(bTable)) continue;
    if (/(^|\\s)(container|navbar|nav)/.test(b.className || '')) continue;
    if (b.querySelectorAll(CTRL + ',input[type="radio"],input[type="checkbox"]').length < 2) continue;
    var innerGrid = b.querySelector('table');
    if (innerGrid && isGridTable(innerGrid)) {
      // 含结果表格的容器不整块重排, 只重排其不含表格的直接子容器
      var subs2 = b.children;
      for (var sx = 0; sx < subs2.length; sx++) {
        var sc = subs2[sx];
        if (sc.tagName === 'TABLE' || (sc.querySelector && sc.querySelector('table'))) continue;
        if (sc.querySelectorAll(CTRL + ',input[type="radio"],input[type="checkbox"]').length >= 2 && !(sc.closest && sc.closest('[data-skinform]'))) formifyBox(sc);
      }
      continue;
    }
    formifyBox(b);
  }

  // 分页链接归组: 同父级时直接给父级加 .pager; 混在其他内容里时新建 .pager 容器
  var pgLinks = document.querySelectorAll('a[id*="LinkBut"]');
  if (pgLinks.length) {
    var pgParent = pgLinks[0].parentNode;
    var sameParent = true;
    for (var pk = 1; pk < pgLinks.length; pk++) {
      if (pgLinks[pk].parentNode !== pgParent) { sameParent = false; break; }
    }
    if (sameParent && pgParent && pgParent.nodeType === 1 && !(pgParent.querySelector && pgParent.querySelector('table'))) {
      if ((pgParent.className || '').indexOf('pager') < 0) {
        pgParent.className = (pgParent.className ? pgParent.className + ' ' : '') + 'pager';
      }
    } else if (pgParent) {
      var pg = document.createElement('div');
      pg.className = 'pager';
      pgParent.insertBefore(pg, pgLinks[0]);
      for (var pm = 0; pm < pgLinks.length; pm++) pg.appendChild(pgLinks[pm]);
    }
  }
  // 记录条("共有x条记录…")弱化为居中灰字
  var lr = document.getElementById('LabelRecord');
  if (lr) {
    var lrBox = lr.closest ? (lr.closest('font') || lr) : lr;
    lrBox.className = 'record-note';
  }

  // 原站部分页面没有 .container 外壳, 表格/表单会贴满屏幕边缘
  if (!document.querySelector('.container')) {
    var shell = document.createElement('div');
    shell.className = 'container';
    while (document.body.firstChild) shell.appendChild(document.body.firstChild);
    document.body.appendChild(shell);
  }

  // 数据表格整理: 去掉服务端写死的列宽 + 删整列皆空的列 + 多列设最小列宽 + 空表补"暂无数据"
  var grids = document.querySelectorAll('table[id]');
  for (var g = 0; g < grids.length; g++) {
    var t = grids[g];
    if (t.id.indexOf('DataGrid') !== 0 && !t.querySelector('.HeadRow')) continue;
    var rs = t.rows;
    if (!rs.length) continue;
    for (var r1 = 0; r1 < rs.length; r1++) {
      var c1 = rs[r1].cells;
      for (var x = 0; x < c1.length; x++) {
        c1[x].removeAttribute('width');
        c1[x].style.width = '';
      }
    }
    // 多列表格: 每列保底 88px(容器可横向滚动), 课程名等长文本不再被挤成单字竖排
    var colCount = rs[0].cells.length;
    if (colCount >= 4) t.style.minWidth = Math.min(colCount * 88, 760) + 'px';
    // 短内容单元格(节次/日期/状态等)不折行, 保持一行整齐
    for (var r3 = 1; r3 < rs.length; r3++) {
      var c3 = rs[r3].cells;
      for (var x3 = 0; x3 < c3.length; x3++) {
        var ct = txt(c3[x3]);
        if (ct && ct.length <= 10) c3[x3].style.whiteSpace = 'nowrap';
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
  var lr0 = document.getElementById('LabelRecord');
  if (lr0 && txt(lr0) === '0') {
    hide(lr0.closest ? lr0.closest('font') : null);
    var links0 = document.querySelectorAll('a[id*="LinkBut"]');
    for (var lk = 0; lk < links0.length; lk++) hide(links0[lk]);
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
  const injectJs = INJECT_JS;
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
        injectedJavaScript={injectJs}
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
