/** 宝贝回家公益数据: 解析官方公开列表/详情页, 每次随机展示一条寻亲信息
 *  来源: https://baobeihuijia.com/bbhj/ (仅做公益展示与官方入口跳转, 不保存到服务端)
 *  列表页缓存 10 分钟; 详情按 id 缓存在内存, 避免重复请求 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type BbhjRecord = {
  id: string;
  name: string;
  gender: string;
  category: string;
  /** 官方图片地址(可能为空) */
  photo: string;
  birthday: string;
  lostTime: string;
  lostPlace: string;
  height: string;
  feature: string;
  registerTime: string;
  /** 官网详情页 */
  detailUrl: string;
};

type Card = {
  id: string;
  name: string;
  category: string;
  photo: string;
  registerTime: string;
  href: string;
};

const BASE = 'https://baobeihuijia.com';
const LIST_URL = `${BASE}/bbhj/`;
const POOL_KEY = 'bbhj-pool-v1';
const POOL_TTL = 10 * 60 * 1000;
const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

/** 帮宝贝回家: 优先展示儿童相关分类 */
const ALLOWED = new Set(['家寻宝贝', '宝贝寻家', '流浪乞讨', '其他寻人']);

let poolCache: { at: number; cards: Card[] } | null = null;
const detailCache = new Map<string, Partial<BbhjRecord>>();

function decodeHtml(raw: string): string {
  return (raw || '')
    .replace(/<br\s*\/?>/gi, ' ')
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

function absolute(path: string | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path.replace('://www.baobeihuijia.com', '://baobeihuijia.com');
  return BASE + (path.startsWith('/') ? path : `/${path}`);
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
    });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseList(html: string): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  const chunks = html.split('<div class="person-image');
  for (const chunk of chunks.slice(1)) {
    const href = (chunk.match(/href="(\/bbhj\/contents\/\d+\/\d+\.html)"/) ?? [])[1];
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const id = (href.match(/(\d+)\.html$/) ?? [])[1] ?? href;
    const img = (chunk.match(/<img[^>]+src="([^"]+)"/) ?? [])[1];
    const category = decodeHtml((chunk.match(/<span class="badge[^"]*">([^<]+)<\/span>/) ?? [])[1] ?? '');
    const title = decodeHtml((chunk.match(/target="_blank">(\[\d+\][^<]*)<\/a>/) ?? [])[1] ?? '');
    const registerTime = decodeHtml((chunk.match(/注册日期：([\d-]+)/) ?? [])[1] ?? '');
    if (!img) continue; // 没有照片的卡片通常是占位, 跳过
    out.push({
      id,
      name: (title.replace(/^\[\d+\]/, '').trim() || '未署名'),
      category: category || '寻亲信息',
      photo: absolute(img),
      registerTime,
      href,
    });
  }
  return out;
}

/** 解析详情页: 字段都在 li > view-th/view-td 中 */
function parseDetail(html: string): Partial<BbhjRecord> {
  const fields: Record<string, string> = {};
  const re = /<li><div class='view-th'>([\s\S]*?)<\/div><div class='view-td'>([\s\S]*?)<\/div><\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let label = decodeHtml(m[1]);
    let value = decodeHtml(m[2]);
    const cut = label.indexOf('：');
    if (cut >= 0) {
      const inline = label.slice(cut + 1).trim();
      label = label.slice(0, cut).trim();
      if (!value && inline) value = inline;
    }
    if (label) fields[label] = value;
  }
  const photo = (html.match(/<div class="col-md-4">\s*<img[^>]+src="([^"]+)"/) ?? [])[1];
  const place = (fields['失踪地点'] || '')
    .replace(/,/g, ' ')
    .replace(/市辖区|undefined/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const rawHeight = (fields['失踪时身高'] || '').trim();
  const height = /未知|不详|^$/.test(rawHeight) ? '' : rawHeight.replace(/CM$/i, 'cm');
  const cleanTime = (v: string | undefined) =>
    !v || /^(\/|未知|不详|-+)$/.test(v.trim()) ? '' : v.trim();
  return {
    id: fields['寻亲编号'] || '',
    name: fields['姓名'] || '',
    gender: fields['性别'] || '',
    category: fields['寻亲类别'] || '',
    photo: absolute(photo),
    birthday: cleanTime(fields['出生日期']),
    lostTime: cleanTime(fields['失踪时间']),
    lostPlace: place,
    height,
    feature: fields['失踪者特征描述'] || fields['其他资料'] || '',
  };
}

async function getPool(): Promise<Card[]> {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL) return poolCache.cards;
  try {
    const cards = parseList(await fetchText(LIST_URL));
    if (cards.length) {
      poolCache = { at: Date.now(), cards };
      void AsyncStorage.setItem(POOL_KEY, JSON.stringify(poolCache)).catch(() => {});
      return cards;
    }
  } catch {
    // 网络失败 → 用本地缓存
  }
  if (poolCache) return poolCache.cards;
  try {
    const raw = await AsyncStorage.getItem(POOL_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { cards?: Card[] };
      if (Array.isArray(c.cards) && c.cards.length) {
        poolCache = { at: 0, cards: c.cards };
        return c.cards;
      }
    }
  } catch {
    // 缓存损坏
  }
  throw new Error('暂时无法获取寻亲信息，请检查网络后重试');
}

/** 随机获取一条寻亲信息; excludeId 用于“换一个”避免重复 */
export async function fetchRandomRecord(excludeId?: string): Promise<BbhjRecord> {
  const all = await getPool();
  const prefer = all.filter((c) => ALLOWED.has(c.category));
  const pool = prefer.length >= 4 ? prefer : all;
  const candidates = pool.filter((c) => c.id !== excludeId);
  const list = candidates.length ? candidates : pool;
  const card = list[Math.floor(Math.random() * list.length)];

  let detail = detailCache.get(card.id);
  if (!detail) {
    try {
      detail = parseDetail(await fetchText(BASE + card.href));
    } catch {
      detail = {};
    }
    detailCache.set(card.id, detail);
    if (detailCache.size > 60) {
      const first = detailCache.keys().next().value;
      if (first) detailCache.delete(first);
    }
  }

  const cleanName = (v: string) => {
    const t = (v || '').trim();
    return /^(无|未知|不详|未署名)?$/.test(t) ? '' : t;
  };

  return {
    id: detail.id || card.id,
    name: cleanName(detail.name || '') || cleanName(card.name) || '未署名',
    gender: detail.gender || '',
    category: detail.category || card.category,
    photo: detail.photo || card.photo,
    birthday: detail.birthday || '',
    lostTime: detail.lostTime || '',
    lostPlace: detail.lostPlace || '',
    height: detail.height || '',
    feature: detail.feature || '',
    registerTime: card.registerTime,
    detailUrl: BASE + card.href,
  };
}
