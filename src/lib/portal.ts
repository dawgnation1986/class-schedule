/**
 * 主站(学院综合管理平台)登录与桌面应用列表
 *
 * 流程(实测):
 *  1. GET /loginp.aspx?login=1 → 会话 Cookie + __VIEWSTATE/__VIEWSTATEGENERATOR/__EVENTVALIDATION
 *  2. GET /SystemSet/AuthCode.aspx → 随机验证码图片(Jpeg, 依赖同一会话)
 *  3. POST /loginp.aspx?login=1 (userName/password/txtAuthCode/btnSubmit=登录)
 *     → 302 /Desktop.aspx?xm=姓名 → 登录成功
 *  4. GET /Desktop.aspx → 解析 <dl> 应用列表(title + href)
 *
 * 站点设计为每次访问都要重新登录(验证码随机), 因此每次都建立全新会话。
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SITE = 'https://jwtk.cshbxy.com';
/** 主站域名(供拼接应用页 URL) */
export const PORTAL_SITE = SITE;
// Web 端走 Metro 同源代理(见 metro.config.js), 原生端直连
const BASE = Platform.OS === 'web' ? '/timetable-proxy' : SITE;

const SESSION_KEY = 'portal.session.v1';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/jpeg,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

/** 携带登录会话抓取主站页面 HTML (原生端带 Cookie, Web 端由代理转发浏览器 Cookie) */
export async function fetchPortalHtml(path: string): Promise<string> {
  const url = `${BASE}${path.startsWith('/') ? path : '/' + path}`;
  const r = await fetch(url, { headers: withCookie(BROWSER_HEADERS, sessionCookie) });
  if (!r.ok) throw new Error(`加载失败 (HTTP ${r.status})`);
  return r.text();
}

/** 携带登录会话 POST 回发 ASP.NET 表单 (供 aspform.postback 使用, 支持 multipart 文件上传) */
export async function postPortalForm(action: string, body: URLSearchParams | FormData): Promise<string> {
  const url = `${BASE}${action.startsWith('/') ? action : '/' + action}`;
  const isForm = typeof body === 'string' || body instanceof URLSearchParams;
  const r = await fetch(url, {
    method: 'POST',
    headers: withCookie(
      isForm ? { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' } : BROWSER_HEADERS,
      sessionCookie,
    ),
    body: isForm ? body.toString() : body,
  });
  if (!r.ok) throw new Error(`提交失败 (HTTP ${r.status})`);
  return r.text();
}

export type PortalApp = { title: string; href: string };

/** 最近一次成功登录的会话 Cookie (供原生请求携带登录态) */
let sessionCookie = '';
export function getPortalCookie(): string {
  return sessionCookie;
}

export type LoginState = {
  cookie: string; // 原生端手动维护的会话 Cookie(Web 端由浏览器自动管理)
  vs: string;
  g: string;
  ev: string;
  captchaUri: string; // 验证码图片 data URI
};

export type LoginResult =
  | { ok: true; name: string; apps: PortalApp[] }
  | { ok: false; message: string };

function mergeCookie(jar: string, setCookie: string | null): string {
  if (!setCookie) return jar;
  const parts = setCookie.split(/,(?=[^;]+?=)/);
  let out = jar;
  for (const part of parts) {
    const kv = part.split(';')[0].trim();
    if (!kv.includes('=')) continue;
    const name = kv.split('=')[0];
    const re = new RegExp(`(^|;\\s*)${name}=[^;]*`);
    out = re.test(out) ? out.replace(re, `$1${kv}`) : out ? `${out}; ${kv}` : kv;
  }
  return out;
}

function withCookie(headers: Record<string, string>, cookie: string): Record<string, string> {
  // Web 端浏览器禁止手动设置 Cookie 头, 由浏览器自动携带(同源代理)
  if (Platform.OS === 'web' || !cookie) return headers;
  return { ...headers, Cookie: cookie };
}

function extractHidden(html: string, name: string): string {
  const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`));
  return m ? m[1] : '';
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** 第 1-2 步: 打开登录页并获取随机验证码 */
export async function loadLoginPage(): Promise<LoginState> {
  let cookie = '';
  const r1 = await fetch(`${BASE}/loginp.aspx?login=1`, {
    headers: withCookie(BROWSER_HEADERS, cookie),
  });
  if (!r1.ok) throw new Error(`打开登录页失败 (HTTP ${r1.status})`);
  cookie = mergeCookie(cookie, r1.headers.get('set-cookie') || '');
  const html = await r1.text();

  const r2 = await fetch(`${BASE}/SystemSet/AuthCode.aspx`, {
    headers: withCookie(BROWSER_HEADERS, cookie),
  });
  if (!r2.ok) throw new Error(`获取验证码失败 (HTTP ${r2.status})`);
  cookie = mergeCookie(cookie, r2.headers.get('set-cookie') || '');
  const bytes = new Uint8Array(await r2.arrayBuffer());
  // 按魔数判断真实格式(站点曾在 jpeg/png 之间变更)
  const head = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';

  return {
    cookie,
    vs: extractHidden(html, '__VIEWSTATE'),
    g: extractHidden(html, '__VIEWSTATEGENERATOR'),
    ev: extractHidden(html, '__EVENTVALIDATION'),
    captchaUri: `data:${head};base64,${bytesToBase64(bytes)}`,
  };
}

/** 第 3-4 步: 提交登录, 成功后抓取桌面应用列表 */
export async function submitLogin(
  state: LoginState,
  username: string,
  password: string,
  captcha: string,
): Promise<LoginResult> {
  const body = new URLSearchParams({
    __VIEWSTATE: state.vs,
    __VIEWSTATEGENERATOR: state.g,
    __EVENTVALIDATION: state.ev,
    userName: username,
    password,
    // 站点 2026-10 改版: 验证码字段由 txtAuthCode 改名为 captchaInput
    captchaInput: captcha,
    rememberme: 'on',
    btnSubmit: '登录',
  });
  const r = await fetch(`${BASE}/loginp.aspx?login=1`, {
    method: 'POST',
    redirect: 'manual',
    headers: withCookie(
      {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      state.cookie,
    ),
    body: body.toString(),
  });
  const html = await r.text().catch(() => '');

  // 失败: 仍停留在登录页, 服务器通常以 alert 提示
  const alert = html.match(/alert\(['"]([^'"]+)['"]\)/);
  if (r.status !== 302 || !/Desktop\.aspx/i.test(r.headers.get('location') || '')) {
    return { ok: false, message: alert ? alert[1] : '登录失败，请检查账号或验证码' };
  }

  // 成功: /Desktop.aspx?xm=%e8%b5%9e... 提取姓名
  sessionCookie = state.cookie;
  let name = '';
  try {
    const loc = r.headers.get('location') || '';
    name = decodeURIComponent(loc.split('xm=')[1] || '');
  } catch {
    name = '';
  }

  // 第 4 步: 拉取桌面页, 解析应用列表
  const rd = await fetch(`${BASE}/Desktop.aspx`, {
    headers: withCookie(BROWSER_HEADERS, state.cookie),
  });
  const desktop = await rd.text();
  const apps: PortalApp[] = [];
  const seen = new Set<string>();
  for (const m of desktop.matchAll(/<a[^>]*href='([^']+)'[^>]*title='([^']+)'/g)) {
    const href = m[1].replace(/^(\.\.\/)+/, '/');
    const title = m[2].trim();
    if (!seen.has(href) && title) {
      seen.add(href);
      apps.push({ title, href });
    }
  }

  // 持久化会话: 下次启动直接复用(过期则自动降级到登录页)
  await AsyncStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ cookie: state.cookie, name, apps, at: Date.now() }),
  );
  return { ok: true, name, apps };
}

/** 持久会话 */
export type PortalSession = { cookie: string; name: string; apps: PortalApp[]; at: number };

/** 尝试用本地保存的会话进入桌面; 失效则清除并返回 null */
export async function tryRestoreSession(): Promise<PortalSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PortalSession;
    if (!s.cookie) return null;
    const r = await fetch(`${BASE}/Desktop.aspx`, {
      headers: withCookie(BROWSER_HEADERS, s.cookie),
      redirect: 'manual',
    });
    // 302 → 会话失效(跳回登录页); 200 且能解析出应用列表 → 有效
    if (r.status !== 200) {
      await clearSession();
      return null;
    }
    const html = await r.text();
    if (/loginp\.aspx|name="userName"/i.test(html) || !/<dl|title='/i.test(html)) {
      await clearSession();
      return null;
    }
    sessionCookie = s.cookie;
    return s;
  } catch {
    return null;
  }
}

/** 退出登录: 清除本地持久会话 */
export async function clearSession(): Promise<void> {
  sessionCookie = '';
  await AsyncStorage.removeItem(SESSION_KEY);
}
