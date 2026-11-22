/** 配置备份与恢复: 关键设置 AsyncStorage 键值 → JSON 文本(可粘贴/分享/导入)
 *  v2: 覆盖全部可配置项 + 导出摘要; 导入按"存在才恢复"处理, 兼容 v1 旧备份。 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { DIR_BACKUP, hasClassAccess, writeText } from '@/lib/class-folder';
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
  { key: 'weather-city-v1', label: '天气城市' },
  { key: 'reminder.minutes.v1', label: '上课提醒' },
  { key: 'exam.remind.enabled.v1', label: '考试提醒' },
  { key: 'daily.report.enabled.v1', label: '每日早报' },
  { key: 'gh-mirrors-v1', label: '更新镜像' },
  { key: 'site.url.v1', label: '官网接口地址' },
  { key: 'account.portal.v1', label: '账号与起始页' },
  { key: 'user.profile.v1', label: '个人资料' },
];

const KEYS = BACKUP_SECTIONS.map((s) => s.key);

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
  const entries = await AsyncStorage.multiGet(target);
  const kv: Record<string, string | null> = {};
  const sections: string[] = [];
  for (const [key, value] of entries) {
    if (value === null) continue;
    kv[key] = value;
    const label = BACKUP_SECTIONS.find((s) => s.key === key)?.label;
    if (label) sections.push(label);
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
    const v = j.kv[key];
    if (typeof v === 'string') pairs.push([key, v]);
    else if (v !== undefined && v !== null) skipped += 1;
  }
  if (!pairs.length) return { ok: false, error: '备份里没有可恢复的配置项' };
  await AsyncStorage.multiSet(pairs);
  return { ok: true, imported: pairs.length, skipped };
}
