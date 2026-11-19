/**
 * App 公告: 由官网后台配置下发（api/config.php, 支持多条）
 * 启动时弹最新一条未读公告; 弹窗与「公告」页可查看全部历史公告
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchSiteConfig } from './site';

const READ_KEY = 'notice.read.ids.v2';
const LEGACY_READ_KEY = 'notice.read.updated.v1';

export type NoticeInfo = {
  /** 唯一标识: 后台 id, 缺省时用内容哈希 */
  id: string;
  title: string;
  content: string;
  updated: string;
};

/** API 下发的原始公告项 */
type RawNotice = {
  id?: string;
  title?: string;
  content?: string;
  updated?: string | null;
};

function contentHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(36)}`;
}

function toNotice(n: RawNotice): NoticeInfo | null {
  const content = (n.content ?? '').trim();
  if (!content) return null;
  const updated = (n.updated ?? '').trim();
  const id = (n.id ?? '').trim() || updated || contentHash(content);
  return {
    id,
    title: (n.title ?? '').trim() || '公告',
    content,
    updated,
  };
}

/** 拉取全部启用中的公告（最新在前; 未启用或无内容返回空数组） */
export async function fetchNoticeList(): Promise<NoticeInfo[]> {
  const cfg = await fetchSiteConfig();
  const n = cfg?.notice;
  if (!n) return [];
  // 新结构: items 数组
  if (Array.isArray(n.items)) {
    return n.items.map(toNotice).filter((x): x is NoticeInfo => x !== null);
  }
  // 旧结构: 单条
  if (!n.enabled || !n.content?.trim()) return [];
  const one = toNotice(n);
  return one ? [one] : [];
}

/** 拉取最新一条公告（兼容旧调用; 无则 null） */
export async function fetchNotice(): Promise<NoticeInfo | null> {
  const list = await fetchNoticeList();
  return list[0] ?? null;
}

/** 已读公告 id 集合 */
export async function getNoticeReadIds(): Promise<string[]> {
  const raw = (await AsyncStorage.getItem(READ_KEY)) ?? '';
  const ids = raw.split(',').filter(Boolean);
  // 兼容 v1 旧记录（单个 id）
  const legacy = await AsyncStorage.getItem(LEGACY_READ_KEY);
  if (legacy) ids.push(legacy);
  return ids;
}

/** 标记公告已读（不再弹窗; 历史公告仍可在「公告」页查看） */
export async function markNoticeRead(id: string): Promise<void> {
  const ids = new Set(await getNoticeReadIds());
  ids.add(id);
  // 只保留最近 50 条, 防止无限增长
  const arr = [...ids].slice(-50);
  await AsyncStorage.setItem(READ_KEY, arr.join(','));
}
