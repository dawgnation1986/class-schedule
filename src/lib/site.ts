/**
 * 官网站点配置: API 地址可在"我的"页面手动修改, 默认指向 forum.lxs.cc.cd
 * 下发内容: 赞助收款码 + 公告（后台配置, api/config.php 输出）
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_SITE_URL = 'http://forum.lxs.cc.cd';
const KEY = 'site.url.v1';

let cache: string | null = null;
const subs = new Set<() => void>();

export function subscribeSiteUrl(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** 当前官网地址（优先内存缓存） */
export async function getSiteUrl(): Promise<string> {
  if (cache) return cache;
  const saved = normalize((await AsyncStorage.getItem(KEY)) ?? '');
  cache = saved || DEFAULT_SITE_URL;
  return cache;
}

/** 修改官网地址; 传 null 恢复默认。返回标准化后的地址 */
export async function setSiteUrl(url: string | null): Promise<string> {
  const next = url === null ? DEFAULT_SITE_URL : normalize(url);
  cache = next;
  if (next === DEFAULT_SITE_URL) await AsyncStorage.removeItem(KEY);
  else await AsyncStorage.setItem(KEY, next);
  subs.forEach((f) => f());
  return next;
}

export type SiteConfig = {
  sponsor: {
    wechat?: string | null;
    alipay?: string | null;
    note?: string;
    updated?: string | null;
  };
  notice: {
    enabled?: boolean;
    title?: string;
    content?: string;
    updated?: string | null;
    /** 多条公告（新结构, 最新在前, 仅含启用中的） */
    items?: Array<{
      id?: string;
      title?: string;
      content?: string;
      updated?: string | null;
    }>;
  };
};

/** 站点内相对路径 → 完整 URL */
export async function siteAssetUrl(path: string): Promise<string> {
  if (/^https?:\/\//.test(path)) return path;
  const base = await getSiteUrl();
  return `${base}/${path.replace(/^\/+/, '')}`;
}

/** 拉取官网下发的配置（8 秒超时, 失败返回 null 由调用方兜底） */
export async function fetchSiteConfig(): Promise<SiteConfig | null> {
  const base = await getSiteUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    // 加时间戳参数穿透任何中间缓存, 保证公告启停立即生效
    const r = await fetch(`${base}/api/config.php?t=${Date.now()}`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const j = (await r.json()) as SiteConfig;
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
