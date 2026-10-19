/**
 * 应用内检查更新: 读取 GitHub Releases 最新版并与当前版本比对
 * 仓库: dawgnation1986/class-schedule (公开)
 * 发版约定: tag = v{version} (如 v1.0.0), release 资产里放 APK
 */

import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

const REPO = 'dawgnation1986/class-schedule';
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

/** 当前版本 (app.json version) */
export function currentVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

export type UpdateInfo = {
  hasUpdate: boolean;
  current: string;
  latest: string;
  /** APK 下载直链 (release 资产) */
  apkUrl: string | null;
  /** Release 说明 */
  notes: string;
  publishedAt: string;
};

function parseTag(tag: string): string {
  return tag.replace(/^v/i, '').trim();
}

/** 比较版本号: a > b 返回 1, a < b 返回 -1, 相等返回 0 (支持 1.2.3 数字段比较) */
function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** 查询最新 Release; 网络失败返回 null (不影响使用) */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  try {
    const r = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'class-schedule-app' },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      tag_name?: string;
      body?: string;
      published_at?: string;
      assets?: { name: string; browser_download_url: string }[];
    };
    if (!j.tag_name) return null;
    const latest = parseTag(j.tag_name);
    const current = currentVersion();
    const apk = (j.assets ?? []).find((a) => a.name.toLowerCase().endsWith('.apk'));
    return {
      hasUpdate: cmpVersion(latest, current) > 0,
      current,
      latest,
      apkUrl: apk?.browser_download_url ?? null,
      notes: j.body ?? '',
      publishedAt: j.published_at ?? '',
    };
  } catch {
    return null;
  }
}

/** 打开 APK 下载 (原生端用系统浏览器; Web 端打开 releases 页) */
export function openDownload(info: UpdateInfo): void {
  const url = info.apkUrl ?? RELEASES_PAGE;
  if (Platform.OS === 'web') {
    void Linking.openURL(RELEASES_PAGE);
  } else {
    void Linking.openURL(url);
  }
}

export { RELEASES_PAGE };
