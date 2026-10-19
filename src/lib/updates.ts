/**
 * 应用内检查更新: 读取 GitHub Releases 最新版并与当前版本比对
 * 仓库: dawgnation1986/class-schedule (公开)
 * 发版约定: tag = v{version} (如 v1.0.0), release 资产里放 APK
 */

import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import { getMirrors, testAllMirrors, type Mirror } from './gh-mirrors';

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
  /** APK 文件大小 (字节, 未知为 null) */
  sizeHint: number | null;
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
      assets?: { name: string; size?: number; browser_download_url: string }[];
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
      sizeHint: apk?.size ?? null,
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

/** 下载事件: log 行 / 进度 */
export type DlEvent =
  | { type: 'log'; line: string }
  | { type: 'progress'; written: number; total: number; speed: number };

export function fmtSize(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
}

const APK_PATH = `${FileSystem.cacheDirectory}update.apk`;

/** 内置下载 APK: 自动测速排序镜像 → 依次尝试(单源 6 秒内 <200KB/s 判定为慢自动切换) */
export async function downloadApk(
  info: UpdateInfo,
  onEvent: (e: DlEvent) => void,
  cancelled: { current: boolean },
): Promise<string> {
  const apkUrl = info.apkUrl;
  if (!apkUrl) throw new Error('该版本没有 APK 资产');
  await FileSystem.deleteAsync(APK_PATH, { idempotent: true }).catch(() => {});

  onEvent({ type: 'log', line: '正在测试镜像连通性…' });
  let list: Mirror[] = [];
  try {
    const mirrors = await getMirrors();
    const tested = await testAllMirrors(mirrors);
    tested.sort((a, b) => (a.ms < 0 ? 1 : b.ms < 0 ? -1 : a.ms - b.ms));
    list = tested.map((t) => t.mirror);
    for (const t of tested) {
      onEvent({ type: 'log', line: `${t.mirror.name}: ${t.ms < 0 ? '不可用' : `${t.ms}ms`}` });
    }
  } catch {
    list = await getMirrors();
  }

  let lastErr: unknown = null;
  for (let i = 0; i < list.length; i++) {
    if (cancelled.current) throw new Error('已取消');
    const m = list[i];
    onEvent({ type: 'log', line: `[${i + 1}/${list.length}] 通过 ${m.name} 下载…` });
    try {
      const uri = await tryDownload(m.prefix + apkUrl, onEvent, cancelled, m.name);
      onEvent({ type: 'log', line: `下载完成，APK 已就绪` });
      return uri;
    } catch (e) {
      if (cancelled.current) throw new Error('已取消');
      lastErr = e;
      onEvent({ type: 'log', line: `✗ ${m.name} 失败：${e instanceof Error ? e.message : '未知错误'}` });
    }
  }
  throw lastErr ?? new Error('所有下载源均失败');
}

/** 单源下载, 6 秒速度检测, 过慢自动放弃换下一个源 */
async function tryDownload(
  url: string,
  onEvent: (e: DlEvent) => void,
  cancelled: { current: boolean },
  name: string,
): Promise<string> {
  const start = Date.now();
  let slowKicked = false;
  let lastBytes = 0;
  let lastTime = start;
  const resumable = FileSystem.createDownloadResumable(
    url,
    APK_PATH,
    {},
    (p) => {
      const nowT = Date.now();
      if (!slowKicked && nowT - start > 6000) {
        slowKicked = true;
        if (p.totalBytesWritten / ((nowT - start) / 1000) < 200 * 1024) {
          onEvent({ type: 'log', line: `${name} 速度过慢，切换下一个源…` });
          resumable.cancelAsync().catch(() => {});
          return;
        }
      }
      if (nowT - lastTime >= 800 || p.totalBytesWritten === p.totalBytesExpectedToWrite) {
        const speed = (p.totalBytesWritten - lastBytes) / Math.max((nowT - lastTime) / 1000, 0.001);
        lastBytes = p.totalBytesWritten;
        lastTime = nowT;
        onEvent({
          type: 'progress',
          written: p.totalBytesWritten,
          total: p.totalBytesExpectedToWrite,
          speed,
        });
      }
    },
  );
  try {
    const r = await resumable.downloadAsync();
    if (!r || r.status !== 200) throw new Error(`HTTP ${r?.status ?? '?'}`);
    return r.uri;
  } catch (e) {
    await resumable.cancelAsync().catch(() => {});
    throw e;
  }
}

/** 拉起系统 APK 安装器 */
export async function installApk(fileUri: string): Promise<void> {
  if (Platform.OS === 'web') {
    void Linking.openURL(RELEASES_PAGE);
    return;
  }
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  // SDK 57 的 expo-intent-launcher 不再导出 ACTION_INSTALL_PACKAGE 常量, 直接传原生 action
  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}
