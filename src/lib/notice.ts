/**
 * App 公告: 由官网后台配置下发（api/config.php）
 * 启动时检查未读公告并弹窗; "知道了"后本地记录不再重复弹出（更新时间变化会再次提醒）
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchSiteConfig } from './site';

const READ_KEY = 'notice.read.updated.v1';

export type NoticeInfo = {
  /** 唯一标识: 优先取后台更新时间, 无则用内容哈希 */
  id: string;
  title: string;
  content: string;
  updated: string;
};

function contentHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(36)}`;
}

/** 拉取当前生效的公告（未启用或内容为空返回 null） */
export async function fetchNotice(): Promise<NoticeInfo | null> {
  const cfg = await fetchSiteConfig();
  const n = cfg?.notice;
  if (!n?.enabled || !n.content?.trim()) return null;
  const updated = (n.updated ?? '').trim();
  return {
    id: updated || contentHash(n.content),
    title: n.title?.trim() || '公告',
    content: n.content.trim(),
    updated,
  };
}

/** 上次已读的公告 id */
export async function getNoticeReadId(): Promise<string | null> {
  return AsyncStorage.getItem(READ_KEY);
}

/** 标记公告已读（不再弹窗, 直到后台发布新公告） */
export async function markNoticeRead(id: string): Promise<void> {
  await AsyncStorage.setItem(READ_KEY, id);
}
