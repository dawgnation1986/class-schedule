/** 配置备份与恢复: 关键设置 AsyncStorage 键值 → JSON 文本(可粘贴/分享/导入)
 *  v2: 覆盖全部可配置项 + 导出摘要; 导入按"存在才恢复"处理, 兼容 v1 旧备份。 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

import { getBackground, setBgSetting } from '@/lib/background';
import { DIR_BACKUP, hasClassAccess, writeText } from '@/lib/class-folder';
import { loadProfile, saveProfile } from '@/lib/profile';
import { loadSettings } from '@/lib/settings';

/** 备份项: 键值 + 展示用名称(设置页导出摘要按此分组) */
export const BACKUP_SECTIONS: { key: string; label: string }[] = [
  { key: 'settings.timetable.v1', label: '班级设置' },
  { key: 'settings.timetable-ui.v1', label: '课表界面' },
  { key: 'timetable.querystate.v1', label: '课表查询选项' },
  { key: 'schedule-times.v1', label: '作息时间' },
  { key: 'todos.v1', label: '待办' },
  { key: 'countdowns.v1', label: '倒计时' },
  { key: 'school.credits.v1', label: '课程学分' },
  { key: 'school.gpa-goal.v1', label: '目标绩点' },
  { key: 'theme-mode-v1', label: '外观模式' },
  { key: 'ui-mode-v1', label: '界面模式' },
  { key: 'theme-preset-v1', label: '主题预设' },
  { key: 'theme-custom-palette-v1', label: '自定义配色' },
  { key: 'theme-accent-v1', label: '控件主色' },
  { key: 'theme-custom-hex-v1', label: '自定义颜色' },
  { key: 'theme-appearance-snap-v1', label: '自定义外观快照' },
  { key: 'app-background-v1', label: '自定义背景' },
  { key: 'app-background-file.v1', label: '背景图片' },
  { key: 'weather-city-v1', label: '天气城市' },
  { key: 'reminder.minutes.v1', label: '上课提醒' },
  { key: 'exam.remind.enabled.v1', label: '考试提醒' },
  { key: 'daily.report.enabled.v1', label: '每日早报' },
  { key: 'gh-mirrors-v1', label: '更新镜像' },
  { key: 'site.url.v1', label: '官网接口地址' },
  { key: 'account.portal.v1', label: '账号与起始页' },
  { key: 'user.profile.v1', label: '个人资料' },
  { key: 'user.avatar.v1', label: '头像' },
];

const KEYS = BACKUP_SECTIONS.map((s) => s.key);

/** 非 AsyncStorage 项: 头像与背景图需要把图片文件本身打包进备份 */
const FILE_KEYS: Record<string, { label: string; kind: 'avatar' | 'background' }> = {
  'user.avatar.v1': { label: '头像', kind: 'avatar' },
  'app-background-file.v1': { label: '背景图片', kind: 'background' },
};

/** 单张图片最大 2MB(编码后约 2.7MB), 头像+背景仍能通过常见的 8MB 上传限制 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

async function packFile(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const size = 'size' in info ? Number(info.size) : 0;
    if (size > MAX_FILE_BYTES) return null;
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    if (!b64) return null;
    const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    return JSON.stringify({ ext, b64 });
  } catch {
    return null;
  }
}

async function restoreFile(raw: string, base: string): Promise<string | null> {
  try {
    const o = JSON.parse(raw) as { ext?: string; b64?: string };
    if (!o?.b64) return null;
    const ext = /^[a-z0-9]{2,5}$/i.test(o.ext ?? '') ? (o.ext as string) : 'jpg';
    const dest = `${FileSystem.documentDirectory ?? ''}${base}-${Date.now()}.${ext}`;
    await FileSystem.writeAsStringAsync(dest, o.b64, { encoding: FileSystem.EncodingType.Base64 });
    return dest;
  } catch {
    return null;
  }
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    return (await FileSystem.getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
}

export type BackupSummary = {
  classLabel?: string;
  version: number;
  at: string;
  appVersion?: string;
  /** 实际写入的配置项名称 */
  sections: string[];
};

export type BackupData = {
  app: 'class-schedule-backup';
  version: number;
  at: string;
  appVersion?: string;
  summary?: BackupSummary;
  kv: Record<string, string | null>;
};

/** 导出备份: 传 keys 时只导出勾选的配置项(云端备份用), 不传则导出全部 */
export async function exportBackup(keys?: string[]): Promise<string> {
  const target = keys && keys.length ? keys.filter((k) => KEYS.includes(k)) : KEYS;
  const plainKeys = target.filter((k) => !FILE_KEYS[k]);
  const entries = plainKeys.length ? await AsyncStorage.multiGet(plainKeys) : [];
  const kv: Record<string, string | null> = {};
  const sections: string[] = [];
  for (const [key, value] of entries) {
    if (value === null) continue;
    kv[key] = value;
    const label = BACKUP_SECTIONS.find((s) => s.key === key)?.label;
    if (label) sections.push(label);
  }
  // 头像 / 背景图: 图片文件本身编码进备份, 换机恢复后仍能显示
  for (const key of target) {
    const f = FILE_KEYS[key];
    if (!f) continue;
    const uri = f.kind === 'avatar' ? (await loadProfile()).avatar : getBackground().uri;
    const packed = await packFile(uri);
    if (!packed) continue;
    kv[key] = packed;
    sections.push(f.label);
  }
  const settings = await loadSettings();
  const data: BackupData = {
    app: 'class-schedule-backup',
    version: 2,
    at: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version ?? '',
    summary: {
      classLabel: settings ? `${settings.xbLabel} ${settings.zyLabel} ${settings.bjLabel}` : undefined,
      version: 2,
      at: new Date().toISOString(),
      appVersion: Constants.expoConfig?.version ?? '',
      sections,
    },
    kv,
  };
  return JSON.stringify(data, null, 2);
}

/** 文件名: 课表备份-应用25301-2026-11-21_1530.json (无班级时省略班级) */
export async function backupFileName(): Promise<string> {
  const settings = await loadSettings();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const cls = (settings?.bjLabel ?? '').replace(/[\\/:*?"<>|\s]/g, '');
  return `课表备份${cls ? `-${cls}` : ''}-${day}_${time}.json`;
}

/** 导出备份并保存到手机 /Class/备份 文件夹 */
export async function saveBackupToClass(): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!(await hasClassAccess())) return { ok: false, error: '需要授权访问手机 Class 文件夹才能保存备份' };
  const json = await exportBackup();
  const fname = await backupFileName();
  return (await writeText(`${DIR_BACKUP}${fname}`, json))
    ? { ok: true, path: `/Class/备份/${fname}` }
    : { ok: false, error: '写入文件失败' };
}

/** 解析备份并返回可读摘要(用于导出弹窗展示, 不落盘) */
export function summarizeBackup(text: string): BackupSummary | null {
  try {
    const j = JSON.parse(text) as BackupData;
    if (!j || j.app !== 'class-schedule-backup' || !j.kv) return null;
    const sections = KEYS.filter((k) => typeof j.kv[k] === 'string')
      .map((k) => BACKUP_SECTIONS.find((s) => s.key === k)?.label)
      .filter((v): v is string => !!v);
    return {
      classLabel: j.summary?.classLabel,
      version: Number(j.version) || 1,
      at: j.at ?? j.summary?.at ?? '',
      appVersion: j.appVersion ?? j.summary?.appVersion,
      sections,
    };
  } catch {
    return null;
  }
}

/** 导入备份: 只恢复备份中实际存在的项(不清空当前其他设置), 兼容 v1 */
export async function importBackup(
  text: string,
): Promise<{ ok: boolean; error?: string; imported?: number; skipped?: number }> {
  let j: BackupData;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON 解析失败，请检查粘贴内容' };
  }
  if (!j || j.app !== 'class-schedule-backup' || typeof j.kv !== 'object' || j.kv === null) {
    return { ok: false, error: '不是本应用导出的备份文件' };
  }
  const pairs: [string, string][] = [];
  let skipped = 0;
  for (const key of KEYS) {
    if (FILE_KEYS[key]) continue;
    const v = j.kv[key];
    if (typeof v === 'string') pairs.push([key, v]);
    else if (v !== undefined && v !== null) skipped += 1;
  }
  const avatarRaw = j.kv['user.avatar.v1'];
  const bgRaw = j.kv['app-background-file.v1'];
  const hasFile = typeof avatarRaw === 'string' || typeof bgRaw === 'string';
  if (!pairs.length && !hasFile) return { ok: false, error: '备份里没有可恢复的配置项' };

  // 先写普通键值, 再把图片落到私有目录并回填路径(顺序不能反, 否则旧路径会覆盖新文件)
  if (pairs.length) await AsyncStorage.multiSet(pairs);
  let restored = 0;

  if (typeof avatarRaw === 'string') {
    const dest = await restoreFile(avatarRaw, 'avatar');
    if (dest) {
      await saveProfile({ avatar: dest });
      restored += 1;
    } else skipped += 1;
  } else if (avatarRaw !== undefined && avatarRaw !== null) {
    skipped += 1;
  } else {
    // 旧备份没带图片: 恢复出来的头像路径在本机不存在时清空, 避免显示空图
    const p = await loadProfile();
    if (p.avatar && !(await fileExists(p.avatar))) await saveProfile({ avatar: null });
  }

  let fileBgApplied = false;
  if (typeof bgRaw === 'string') {
    const dest = await restoreFile(bgRaw, 'custom-bg');
    if (dest) {
      // 透明度/控件透明等设置刚从备份写回, 读取最新值再换成本机图片路径
      let bg = getBackground();
      try {
        const rawBg = await AsyncStorage.getItem('app-background-v1');
        if (rawBg) bg = { ...bg, ...(JSON.parse(rawBg) as typeof bg) };
      } catch {
        // 解析失败沿用当前值
      }
      await setBgSetting({ ...bg, uri: dest });
      restored += 1;
      fileBgApplied = true;
    } else skipped += 1;
  } else if (bgRaw !== undefined && bgRaw !== null) {
    skipped += 1;
  }

  // 背景设置是直接写 AsyncStorage 的, 内存缓存不会自己更新:
  // 这里统一同步一次, 保证备份里"没有背景图"时当前背景能立刻清掉(否则会残留上一份的图片)
  if (!fileBgApplied) {
    const rawBg = await AsyncStorage.getItem('app-background-v1').catch(() => null);
    if (rawBg !== null) {
      let bg = getBackground();
      try {
        bg = { ...bg, ...(JSON.parse(rawBg) as typeof bg) };
      } catch {
        // 解析失败沿用当前值
      }
      if (bg.uri && !(await fileExists(bg.uri))) bg = { ...bg, uri: null };
      await setBgSetting(bg);
    }
  }

  return { ok: true, imported: pairs.length + restored, skipped };
}
