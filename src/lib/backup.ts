/** 数据备份与恢复: 关键设置 AsyncStorage 键值 → JSON 文本(可粘贴/分享/导入) */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DIR_BACKUP, hasClassAccess, writeText } from '@/lib/class-folder';

/** 覆盖: 班级设置/作息/待办/主题模式/界面模式/主题预设/背景参数/天气城市/倒计时/镜像/账号 */
const KEYS = [
  'settings.timetable.v1',
  'schedule-times.v1',
  'todos.v1',
  'theme-mode-v1',
  'ui-mode-v1',
  'theme-preset-v1',
  'theme-appearance-snap-v1',
  'app-background-v1',
  'weather-city-v1',
  'countdowns.v1',
  'gh-mirrors-v1',
  'account.portal.v1',
];

export type BackupData = { app: 'class-schedule-backup'; version: number; at: string; kv: Record<string, string | null> };

export async function exportBackup(): Promise<string> {
  const entries = await AsyncStorage.multiGet(KEYS);
  const data: BackupData = {
    app: 'class-schedule-backup',
    version: 1,
    at: new Date().toISOString(),
    kv: Object.fromEntries(entries),
  };
  return JSON.stringify(data, null, 2);
}

/** 导出备份并保存到手机 /Class/备份 文件夹 */
export async function saveBackupToClass(): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!(await hasClassAccess())) return { ok: false, error: '需要授权访问手机 Class 文件夹才能保存备份' };
  const json = await exportBackup();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fname = `backup-${ts}.json`;
  return (await writeText(`${DIR_BACKUP}${fname}`, json)) ? { ok: true, path: `/Class/备份/${fname}` } : { ok: false, error: '写入文件失败' };
}

export async function importBackup(text: string): Promise<{ ok: boolean; error?: string }> {
  let j: BackupData;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON 解析失败，请检查粘贴内容' };
  }
  if (!j || j.app !== 'class-schedule-backup' || typeof j.kv !== 'object' || j.kv === null) {
    return { ok: false, error: '不是本应用导出的备份文件' };
  }
  const pairs: [string, string | null][] = KEYS.map((k) => [k, typeof j.kv[k] === 'string' ? (j.kv[k] as string) : null]);
  const present = pairs.filter((p): p is [string, string] => p[1] !== null);
  const absent = pairs.filter((p) => p[1] === null).map((p) => p[0]);
  if (present.length) await AsyncStorage.multiSet(present);
  if (absent.length) await AsyncStorage.multiRemove(absent);
  return { ok: true };
}
