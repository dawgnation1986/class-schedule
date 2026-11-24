/** 验证码自动识别: 把登录页验证码图片交给 OCR 服务识别
 *  - 仅上传验证码图片, 不上传账号/密码
 *  - 支持多个平台, 依次尝试: 自定义接口 → 百度智能云 → ocr.space(内置免费 Key)
 *  - 识别失败一律回退手动输入, 不影响正常登录 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SWITCH_KEY = 'captcha.auto.v1';
const KEY_KEY = 'captcha.ocr-key.v1';
const BAIDU_AK_KEY = 'captcha.baidu-ak.v1';
const BAIDU_SK_KEY = 'captcha.baidu-sk.v1';
const CUSTOM_URL_KEY = 'captcha.ocr-url.v1';
/** ocr.space 公开测试 Key(有频率限制), 用户可换自己的免费 Key */
const DEFAULT_OCR_KEY = 'helloworld';

export type OcrConfig = {
  /** ocr.space Key, 留空用内置测试 Key */
  ocrSpaceKey: string;
  /** 百度智能云 OCR 的 API Key / Secret Key */
  baiduAk: string;
  baiduSk: string;
  /** 自定义 OCR 接口(兼容 ocr.space 的 base64Image 表单格式) */
  customUrl: string;
};

let enabledCache: boolean | null = null;
let configCache: OcrConfig | null = null;
const subs = new Set<() => void>();

export function subscribeCaptchaAuto(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** 是否开启"自动识别验证码并登录"(默认关闭) */
export async function getCaptchaAutoEnabled(): Promise<boolean> {
  if (enabledCache !== null) return enabledCache;
  try {
    enabledCache = (await AsyncStorage.getItem(SWITCH_KEY)) === '1';
  } catch {
    enabledCache = false;
  }
  return enabledCache;
}

export async function setCaptchaAutoEnabled(on: boolean): Promise<void> {
  enabledCache = on;
  await AsyncStorage.setItem(SWITCH_KEY, on ? '1' : '0').catch(() => {});
  subs.forEach((f) => f());
}

/** 导入备份后清空内存缓存, 让新配置立即生效 */
export function resetCaptchaOcrCache(): void {
  enabledCache = null;
  configCache = null;
  subs.forEach((f) => f());
}

/** 当前 OCR 配置(全部留空 = 只用内置 ocr.space) */
export async function getOcrConfig(): Promise<OcrConfig> {
  if (configCache) return configCache;
  try {
    const pairs = await AsyncStorage.multiGet([KEY_KEY, BAIDU_AK_KEY, BAIDU_SK_KEY, CUSTOM_URL_KEY]);
    const map = new Map(pairs);
    configCache = {
      ocrSpaceKey: map.get(KEY_KEY) ?? '',
      baiduAk: map.get(BAIDU_AK_KEY) ?? '',
      baiduSk: map.get(BAIDU_SK_KEY) ?? '',
      customUrl: map.get(CUSTOM_URL_KEY) ?? '',
    };
  } catch {
    configCache = { ocrSpaceKey: '', baiduAk: '', baiduSk: '', customUrl: '' };
  }
  return configCache;
}

export async function saveOcrConfig(c: OcrConfig): Promise<void> {
  configCache = {
    ocrSpaceKey: c.ocrSpaceKey.trim(),
    baiduAk: c.baiduAk.trim(),
    baiduSk: c.baiduSk.trim(),
    customUrl: c.customUrl.trim(),
  };
  const entries: [string, string][] = [
    [KEY_KEY, configCache.ocrSpaceKey],
    [BAIDU_AK_KEY, configCache.baiduAk],
    [BAIDU_SK_KEY, configCache.baiduSk],
    [CUSTOM_URL_KEY, configCache.customUrl],
  ];
  await Promise.all(
    entries.map(([k, v]) => (v ? AsyncStorage.setItem(k, v) : AsyncStorage.removeItem(k))),
  ).catch(() => {});
}

export type CaptchaOcrResult = { ok: true; text: string; via?: string } | { ok: false; error: string };

/** 清洗识别结果: 验证码只保留字母数字, 长度 3~8 视为有效 */
function cleanText(raw: string): string | null {
  const text = raw.replace(/[^0-9A-Za-z]/g, '');
  if (text.length < 3 || text.length > 8) return null;
  return text.toUpperCase();
}

function dataUriBase64(dataUri: string): string {
  const i = dataUri.indexOf(',');
  return i >= 0 ? dataUri.slice(i + 1) : dataUri;
}

let lastRequestAt = 0;

async function recognizeWithOcrSpace(dataUri: string, key: string): Promise<string | null> {
  // 先用引擎 2(适合验证码), 失败再用引擎 1
  for (const engine of ['2', '1']) {
    try {
      if (engine === '1') await new Promise((r) => setTimeout(r, 1100)); // 免费 Key 约 1 次/秒
      const body = new FormData();
      body.append('base64Image', dataUri);
      body.append('language', 'eng');
      body.append('OCREngine', engine);
      body.append('scale', 'true');
      body.append('isOverlayRequired', 'false');
      const r = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { apikey: key },
        body,
      });
      if (!r.ok) continue;
      const j = (await r.json()) as {
        ParsedResults?: { ParsedText?: string }[];
        ErrorMessage?: string | string[];
        ErrorDetails?: string;
      };
      const text = cleanText(j.ParsedResults?.[0]?.ParsedText ?? '');
      if (text) return text;
    } catch {
      // 网络异常则尝试下一个引擎
    }
  }
  return null;
}

/** 自定义接口: 与 ocr.space 相同的表单格式, 返回 ParsedResults[0].ParsedText 或 {text} */
async function recognizeWithCustom(url: string, dataUri: string): Promise<string | null> {
  try {
    const body = new FormData();
    body.append('base64Image', dataUri);
    body.append('language', 'eng');
    const r = await fetch(url, { method: 'POST', body });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      ParsedResults?: { ParsedText?: string }[];
      text?: string;
      result?: string;
    };
    return cleanText(j.ParsedResults?.[0]?.ParsedText ?? j.text ?? j.result ?? '');
  } catch {
    return null;
  }
}

let baiduToken: { token: string; exp: number } | null = null;

async function baiduTokenFor(ak: string, sk: string): Promise<string> {
  if (baiduToken && Date.now() < baiduToken.exp) return baiduToken.token;
  const url =
    'https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials' +
    `&client_id=${encodeURIComponent(ak)}&client_secret=${encodeURIComponent(sk)}`;
  const r = await fetch(url, { method: 'POST' });
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('token');
  baiduToken = {
    token: j.access_token,
    exp: Date.now() + Math.max(60, (j.expires_in ?? 2592000) - 300) * 1000,
  };
  return j.access_token;
}

/** 百度智能云通用文字识别(免费额度, 国内速度快, 适合中文/数字验证码) */
async function recognizeWithBaidu(ak: string, sk: string, dataUri: string): Promise<string | null> {
  try {
    const token = await baiduTokenFor(ak, sk);
    const body = new URLSearchParams();
    body.append('image', dataUriBase64(dataUri));
    body.append('language_type', 'CHN_ENG');
    body.append('detect_direction', 'false');
    const r = await fetch(
      `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { words_result?: { words: string }[] };
    const words = (j.words_result ?? []).map((w) => w.words).join('');
    return cleanText(words);
  } catch {
    baiduToken = null; // token 失效/网络异常, 下次重新获取
    return null;
  }
}

/** 识别验证码图片(data URI), 返回清洗后的大写字母数字 */
export async function recognizeCaptcha(dataUri: string): Promise<CaptchaOcrResult> {
  if (!dataUri.startsWith('data:image')) return { ok: false, error: '验证码图片无效' };
  const cfg = await getOcrConfig();

  // 1. 自定义接口(用户自己填的优先)
  if (cfg.customUrl) {
    const t = await recognizeWithCustom(cfg.customUrl, dataUri);
    if (t) return { ok: true, text: t, via: '自定义接口' };
  }
  // 2. 百度智能云(填了 AK/SK 才启用)
  if (cfg.baiduAk && cfg.baiduSk) {
    const t = await recognizeWithBaidu(cfg.baiduAk, cfg.baiduSk, dataUri);
    if (t) return { ok: true, text: t, via: '百度 OCR' };
  }
  // 3. ocr.space 兜底
  const key = cfg.ocrSpaceKey || DEFAULT_OCR_KEY;
  // 免费 Key 限制约 1 次/秒, 连续重试时稍等, 避免被限流
  const wait = 1200 - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const t = await recognizeWithOcrSpace(dataUri, key);
  if (t) return { ok: true, text: t, via: 'ocr.space' };
  return { ok: false, error: '识别失败或服务不可用' };
}

// ---------- 通用图片 OCR(课表截图, 需要文字坐标) ----------

/** 一段识别出的文字及其在图片中的位置(像素) */
export type OcrLine = { text: string; x: number; y: number; w: number; h: number };

export type ImageOcrResult = { ok: true; lines: OcrLine[]; via: string } | { ok: false; error: string };

/** 自定义接口(通用文字, 不清洗结果) */
async function recognizeCustomText(url: string, dataUri: string): Promise<string | null> {
  try {
    const body = new FormData();
    body.append('base64Image', dataUri);
    body.append('language', 'chs');
    const r = await fetch(url, { method: 'POST', body });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      ParsedResults?: { ParsedText?: string }[];
      text?: string;
      result?: string;
    };
    const text = (j.ParsedResults?.[0]?.ParsedText ?? j.text ?? j.result ?? '').trim();
    return text || null;
  } catch {
    return null;
  }
}

/** 百度通用文字识别(带位置), 版面还原更可靠 */
async function recognizeWithBaiduLayout(ak: string, sk: string, dataUri: string): Promise<OcrLine[] | null> {
  try {
    const token = await baiduTokenFor(ak, sk);
    const body = new URLSearchParams();
    body.append('image', dataUriBase64(dataUri));
    body.append('language_type', 'CHN_ENG');
    body.append('detect_direction', 'true');
    body.append('paragraph', 'false');
    const r = await fetch(
      `https://aip.baidubce.com/rest/2.0/ocr/v1/general?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      words_result?: {
        words: string;
        location?: { left?: number; top?: number; width?: number; height?: number };
      }[];
    };
    const lines = (j.words_result ?? [])
      .map((w) => ({
        text: w.words ?? '',
        x: w.location?.left ?? 0,
        y: w.location?.top ?? 0,
        w: w.location?.width ?? 0,
        h: w.location?.height ?? 0,
      }))
      .filter((l) => l.text.trim());
    return lines.length ? lines : null;
  } catch {
    baiduToken = null;
    return null;
  }
}

/** ocr.space 的 overlay 模式(返回每行文字的外框) */
async function recognizeWithOcrSpaceLayout(dataUri: string, key: string): Promise<OcrLine[] | null> {
  try {
    const body = new FormData();
    body.append('base64Image', dataUri);
    body.append('language', 'chs');
    body.append('OCREngine', '1');
    body.append('isOverlayRequired', 'true');
    body.append('scale', 'true');
    const r = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: key },
      body,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      ParsedResults?: {
        TextOverlay?: {
          Lines?: {
            LineText?: string;
            MaxHeight?: number;
            Words?: { WordText?: string; Left?: number; Top?: number; Width?: number; Height?: number }[];
          }[];
        };
      }[];
    };
    const lines = j.ParsedResults?.[0]?.TextOverlay?.Lines ?? [];
    const out = lines
      .map((l) => {
        const words = l.Words ?? [];
        if (!words.length) {
          return { text: l.LineText ?? '', x: 0, y: 0, w: 0, h: l.MaxHeight ?? 0 };
        }
        const left = Math.min(...words.map((w) => w.Left ?? 0));
        const top = Math.min(...words.map((w) => w.Top ?? 0));
        const right = Math.max(...words.map((w) => (w.Left ?? 0) + (w.Width ?? 0)));
        return {
          text: l.LineText ?? words.map((w) => w.WordText ?? '').join(''),
          x: left,
          y: top,
          w: right - left,
          h: l.MaxHeight ?? Math.max(...words.map((w) => w.Height ?? 0)),
        };
      })
      .filter((l) => l.text.trim());
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * 识别一张普通图片(课表截图)并返回带坐标的文字行。
 * 顺序: 百度(有 AK/SK) → 自定义接口 → ocr.space。
 */
export async function recognizeImageLayout(dataUri: string): Promise<ImageOcrResult> {
  if (!dataUri.startsWith('data:image')) return { ok: false, error: '图片无效' };
  const cfg = await getOcrConfig();

  if (cfg.baiduAk && cfg.baiduSk) {
    const lines = await recognizeWithBaiduLayout(cfg.baiduAk, cfg.baiduSk, dataUri);
    if (lines) return { ok: true, lines, via: '百度 OCR' };
  }

  if (cfg.customUrl) {
    const text = await recognizeCustomText(cfg.customUrl, dataUri);
    if (text) {
      const rows = text.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
      if (rows.length) {
        return {
          ok: true,
          lines: rows.map((t, i) => ({ text: t, x: 0, y: i * 20, w: 0, h: 18 })),
          via: '自定义接口',
        };
      }
    }
  }

  const key = cfg.ocrSpaceKey || DEFAULT_OCR_KEY;
  const wait = 1200 - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const lines = await recognizeWithOcrSpaceLayout(dataUri, key);
  if (lines) return { ok: true, lines, via: 'ocr.space' };

  return { ok: false, error: '识别失败：可换清晰截图，或在主站登录页的 OCR 设置里填百度 AK/SK' };
}
