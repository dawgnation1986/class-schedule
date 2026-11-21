/** 验证码自动识别: 把登录页验证码图片交给 OCR 服务识别
 *  - 仅上传验证码图片, 不上传账号/密码
 *  - 默认使用 ocr.space; 配额不足时可在登录页填写自己的 Key
 *  - 识别失败一律回退手动输入, 不影响正常登录 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SWITCH_KEY = 'captcha.auto.v1';
const KEY_KEY = 'captcha.ocr-key.v1';
/** ocr.space 公开测试 Key(有频率限制), 用户可换自己的免费 Key */
const DEFAULT_OCR_KEY = 'helloworld';

let enabledCache: boolean | null = null;
let keyCache: string | null = null;
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

/** 自定义 OCR Key(留空用内置 Key) */
export async function getCaptchaOcrKey(): Promise<string> {
  if (keyCache !== null) return keyCache;
  try {
    keyCache = (await AsyncStorage.getItem(KEY_KEY)) ?? '';
  } catch {
    keyCache = '';
  }
  return keyCache;
}

export async function setCaptchaOcrKey(key: string): Promise<void> {
  keyCache = key.trim();
  if (keyCache) await AsyncStorage.setItem(KEY_KEY, keyCache).catch(() => {});
  else await AsyncStorage.removeItem(KEY_KEY).catch(() => {});
}

export type CaptchaOcrResult = { ok: true; text: string } | { ok: false; error: string };

let lastRequestAt = 0;

/** 识别验证码图片(data URI), 返回清洗后的大写字母数字 */
export async function recognizeCaptcha(dataUri: string): Promise<CaptchaOcrResult> {
  if (!dataUri.startsWith('data:image')) return { ok: false, error: '验证码图片无效' };
  const key = (await getCaptchaOcrKey()) || DEFAULT_OCR_KEY;

  // 免费 Key 限制约 1 次/秒, 连续重试时稍等, 避免被限流
  const wait = 1200 - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

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
      const text = (j.ParsedResults?.[0]?.ParsedText ?? '').replace(/[^0-9A-Za-z]/g, '');
      if (text.length >= 3 && text.length <= 8) return { ok: true, text: text.toUpperCase() };
    } catch {
      // 网络异常则尝试下一个引擎
    }
  }
  return { ok: false, error: '识别失败或服务不可用' };
}
