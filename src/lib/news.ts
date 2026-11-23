/** 每日新闻: 中国新闻网官方 RSS(免 key、稳定开放) + 本地缓存
 *  同时订阅「要闻导读」与「即时新闻」, 任一可用即可展示; 全部失败时回退上次缓存 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NewsItem = {
  /** 以链接作为唯一 id */
  id: string;
  title: string;
  link: string;
  summary: string;
  /** 来源频道 */
  source: string;
  /** MM-DD HH:mm */
  time: string;
  /** 时间戳(ms) */
  ts: number;
};

const FEEDS = [
  { url: 'https://www.chinanews.com.cn/rss/importnews.xml', source: '中国新闻网 · 要闻' },
  { url: 'https://www.chinanews.com.cn/rss/scroll-news.xml', source: '中国新闻网 · 即时' },
];

const TTL = 15 * 60 * 1000;
const CACHE_KEY = 'news-cache-v1';
const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

let memCache: { at: number; list: NewsItem[] } | null = null;

/** XML 片段 → 纯文本(去标签、解实体) */
function cleanXml(raw: string): string {
  return (raw || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** RFC822(RSS pubDate) → 时间戳; Hermes 对非 ISO 解析不稳, 这里手动解析 */
function parsePubDate(pub: string): number {
  const m = pub.match(
    /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/,
  );
  if (!m) return 0;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return 0;
  const utc = Date.UTC(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
  let offset = 0;
  if (m[7]) {
    const sign = m[7][0] === '-' ? -1 : 1;
    offset = sign * (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(3, 5))) * 60 * 1000;
  }
  return utc - offset;
}

function fmtTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function parseFeed(xml: string, source: string): NewsItem[] {
  const out: NewsItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const pick = (tag: string) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
      return cleanXml((block.match(r) ?? [])[1] ?? '');
    };
    const title = pick('title');
    const link = pick('link');
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const ts = parsePubDate(pick('pubDate'));
    out.push({
      id: link,
      title,
      link,
      summary: pick('description').slice(0, 140),
      source,
      time: fmtTime(ts),
      ts,
    });
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取每日新闻(合并两个官方频道, 按时间倒序)
 * force=true 时忽略 15 分钟内存缓存
 */
export async function fetchDailyNews(force = false): Promise<{ list: NewsItem[]; cached: boolean }> {
  if (!force && memCache && Date.now() - memCache.at < TTL) {
    return { list: memCache.list, cached: false };
  }

  const results = await Promise.allSettled(
    FEEDS.map(async (f) => parseFeed(await fetchText(f.url), f.source)),
  );
  const merged = new Map<string, NewsItem>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) if (!merged.has(item.link)) merged.set(item.link, item);
  }
  const list = [...merged.values()].sort((a, b) => b.ts - a.ts).slice(0, 40);

  if (list.length) {
    memCache = { at: Date.now(), list };
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ at: memCache.at, list })).catch(() => {});
    return { list, cached: false };
  }

  // 全部失败 → 展示上次成功缓存
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { list?: NewsItem[] };
      if (Array.isArray(c.list) && c.list.length) return { list: c.list, cached: true };
    }
  } catch {
    // 缓存损坏 → 抛错
  }
  throw new Error('新闻加载失败，请检查网络后重试');
}
