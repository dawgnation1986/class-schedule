/**
 * 公共存储目录管理: /storage/emulated/0/Class
 * 背景图 / 主题预设 / 备份 / 缓存 四个子目录, 手机文件管理器可直接访问。
 * Android 11+ 需要"所有文件访问"权限(在系统设置中授予, 授予后重新进 App 生效)。
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import { PACKAGE_NAME } from '@/lib/package';

export const CLASS_ROOT = 'file:///storage/emulated/0/Class/';
export const DIR_BG = `${CLASS_ROOT}背景图/`;
export const DIR_PRESET = `${CLASS_ROOT}主题预设/`;
export const DIR_BACKUP = `${CLASS_ROOT}备份/`;
export const DIR_CACHE = `${CLASS_ROOT}缓存/`;

let accessCache: boolean | null = null;
/** 最近一次权限检测失败的原因(供界面诊断展示) */
export let lastAccessError: string | null = null;

/** 是否可在 /Class 读写 (用测试文件实测, 结果缓存) */
export async function hasClassAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (accessCache !== null) return accessCache;
  try {
    await FileSystem.makeDirectoryAsync(CLASS_ROOT, { intermediates: true });
    const test = `${CLASS_ROOT}.access-test`;
    await FileSystem.writeAsStringAsync(test, 'ok');
    await FileSystem.deleteAsync(test, { idempotent: true });
    accessCache = true;
    lastAccessError = null;
  } catch (e) {
    accessCache = false;
    lastAccessError = e instanceof Error ? e.message : String(e);
  }
  return accessCache;
}

/** 打开系统"所有文件访问"授权页(定位到本应用) */
export function requestClassAccess(): void {
  if (Platform.OS !== 'android') return;
  try {
    void IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
      { data: `package:${PACKAGE_NAME}` },
    );
  } catch {
    // 部分系统不支持带包名参数, 退回总开关页
    void IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_ALL_FILES_ACCESS_PERMISSION);
  }
}

/** 授权状态可能变化时调用: 重新实测 + 建齐子目录 */
export async function resetAccessAndEnsureDirs(): Promise<boolean> {
  accessCache = null;
  const ok = await hasClassAccess();
  if (ok) {
    lastAccessError = null;
    await ensureDirs();
  }
  return ok;
}

async function ensureDirs(): Promise<void> {
  for (const dir of [DIR_BG, DIR_PRESET, DIR_BACKUP, DIR_CACHE]) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  }
}

/** 写文本文件(静默失败) */
export async function writeText(path: string, text: string): Promise<boolean> {
  try {
    await FileSystem.writeAsStringAsync(path, text);
    return true;
  } catch {
    return false;
  }
}

/** 读文本文件(失败返回 null) */
export async function readText(path: string): Promise<string | null> {
  try {
    return await FileSystem.readAsStringAsync(path);
  } catch {
    return null;
  }
}

/** 列出目录下匹配后缀的文件名(失败返回空数组) */
export async function listNames(dir: string, suffix?: string): Promise<string[]> {
  try {
    const all = await FileSystem.readDirectoryAsync(dir);
    return suffix ? all.filter((n) => n.toLowerCase().endsWith(suffix)) : all;
  } catch {
    return [];
  }
}
