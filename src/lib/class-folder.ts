/**
 * 公共存储目录管理: 手机 /storage/emulated/0/Class
 * 四个子目录: 背景图 / 主题预设 / 备份 / 缓存
 *
 * 两种访问通道(自动选择):
 *  1) direct: 直连路径 file:///storage/emulated/0/Class(需系统"所有文件访问"权限)
 *  2) saf: SAF 授权 — 用户在系统弹窗中选中 Class 文件夹一次, 持久化 directoryUri,
 *     之后读写全走 content:// URI, 绕开 Android 11+ 的直连写入校验(推荐)。
 *
 * 对外统一使用虚拟路径 class://子目录/文件名, 由本模块按当前通道路由;
 * 界面展示用 toDisplayUri 解析成 Image 可用的真实 URI。
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { StorageAccessFramework } from 'expo-file-system/legacy';

const SAF_KEY = 'class.saf.root.v1';
const LEGACY_ROOT = 'file:///storage/emulated/0/Class/';

export const CLASS_ROOT = 'class://';
export const DIR_BG = 'class://背景图/';
export const DIR_PRESET = 'class://主题预设/';
export const DIR_BACKUP = 'class://备份/';
export const DIR_CACHE = 'class://缓存/';

const SUBS = ['背景图', '主题预设', '备份', '缓存'] as const;

type Mode = 'direct' | 'saf' | null;
let mode: Mode = null;
let accessCache: boolean | null = null;
let safRootUri: string | null = null;
const safSubCache = new Map<string, string>();
const displayCache = new Map<string, string>();

/** 最近一次权限检测失败的原因(供界面诊断展示) */
export let lastAccessError: string | null = null;

export function setLastAccessError(msg: string | null): void {
  lastAccessError = msg;
}

// ---------- 虚拟路径 ----------

function parseVPath(v: string): { sub: string; name: string | null } | null {
  if (!v.startsWith('class://')) return null;
  const rest = v.slice('class://'.length);
  const [sub, ...segs] = rest.split('/');
  if (!sub) return null;
  const name = segs.filter(Boolean).join('/') || null;
  return { sub, name };
}

function directPath(v: string): string | null {
  const p = parseVPath(v);
  if (!p) return null;
  return p.name ? `${LEGACY_ROOT}${p.sub}/${p.name}` : `${LEGACY_ROOT}${p.sub}/`;
}

function mimeOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    json: 'application/json',
    txt: 'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}

// ---------- SAF 通道 ----------

async function loadSafRoot(): Promise<string | null> {
  if (safRootUri) return safRootUri;
  safRootUri = await AsyncStorage.getItem(SAF_KEY);
  return safRootUri;
}

/** 根目录下子目录的 SAF URI(缓存 + 校验, 不存在则创建) */
async function safSubUri(sub: string): Promise<string | null> {
  const root = await loadSafRoot();
  if (!root) return null;
  const cached = safSubCache.get(sub);
  if (cached) {
    try {
      await StorageAccessFramework.readDirectoryAsync(cached);
      return cached;
    } catch {
      safSubCache.delete(sub);
    }
  }
  let children: string[] = [];
  try {
    children = await StorageAccessFramework.readDirectoryAsync(root);
  } catch {
    return null;
  }
  for (const u of children) {
    try {
      if (decodeURIComponent(u).endsWith(`/${sub}`)) {
        safSubCache.set(sub, u);
        return u;
      }
    } catch {
      // 跳过无法解码的条目
    }
  }
  try {
    const uri = await StorageAccessFramework.makeDirectoryAsync(root, sub);
    safSubCache.set(sub, uri);
    return uri;
  } catch {
    return null;
  }
}

/** 子目录内查找文件的 SAF URI */
async function safFileUri(sub: string, name: string): Promise<string | null> {
  const subUri = await safSubUri(sub);
  if (!subUri) return null;
  try {
    const children = await StorageAccessFramework.readDirectoryAsync(subUri);
    for (const u of children) {
      const dn = decodeURIComponent(u).split('/').pop() ?? '';
      if (dn === name) return u;
    }
  } catch {
    // 目录不可读
  }
  return null;
}

/** SAF 写文件(先删同名, 避免 createDocument 生成 "xxx (1)" 副本) */
async function safWriteFile(sub: string, name: string, data: string, encoding: 'utf8' | 'base64'): Promise<string | null> {
  const subUri = await safSubUri(sub);
  if (!subUri) return null;
  try {
    const children = await StorageAccessFramework.readDirectoryAsync(subUri);
    for (const u of children) {
      const dn = decodeURIComponent(u).split('/').pop() ?? '';
      if (dn === name) {
        await FileSystem.deleteAsync(u, { idempotent: true }).catch(() => {});
      }
    }
  } catch {
    // 清理同名失败不阻塞写入
  }
  try {
    const fileUri = await StorageAccessFramework.createFileAsync(subUri, mimeOf(name), name);
    await FileSystem.writeAsStringAsync(fileUri, data, {
      encoding: encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
    });
    return fileUri;
  } catch {
    return null;
  }
}

// ---------- 权限 ----------

async function ensureMode(): Promise<boolean> {
  if (mode) return true;
  return hasClassAccess();
}

/** 是否可在 /Class 读写 (直连实测或 SAF 已授权, 结果缓存) */
export async function hasClassAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (accessCache !== null) return accessCache;
  // 1) 直连通道(旧设备/已授予"所有文件访问"时可用)
  try {
    await FileSystem.makeDirectoryAsync(LEGACY_ROOT, { intermediates: true });
    const test = `${LEGACY_ROOT}.access-test`;
    await FileSystem.writeAsStringAsync(test, 'ok');
    await FileSystem.deleteAsync(test, { idempotent: true });
    mode = 'direct';
    accessCache = true;
    lastAccessError = null;
    await ensureDirs();
    return true;
  } catch (e) {
    lastAccessError = e instanceof Error ? e.message : String(e);
  }
  // 2) SAF 通道(用户已通过系统弹窗选中过 Class 文件夹)
  const root = await loadSafRoot();
  if (root) {
    try {
      await StorageAccessFramework.readDirectoryAsync(root);
      mode = 'saf';
      accessCache = true;
      lastAccessError = null;
      await ensureDirs();
      return true;
    } catch (e) {
      lastAccessError = `SAF 授权已失效, 请重新选择文件夹: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  mode = null;
  accessCache = false;
  return false;
}

/**
 * SAF 授权流程: 弹出系统"选择文件夹"窗口, 用户选中 Class 文件夹(没有则先建一个)。
 * 授权一次长期有效, 返回是否成功。
 */
export async function requestClassAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perms.granted || !perms.directoryUri) {
      lastAccessError = '未选择文件夹, 授权已取消。';
      return false;
    }
    safRootUri = perms.directoryUri;
    await AsyncStorage.setItem(SAF_KEY, safRootUri);
    mode = 'saf';
    accessCache = true;
    lastAccessError = null;
    safSubCache.clear();
    displayCache.clear();
    await ensureDirs();
    return true;
  } catch (e) {
    lastAccessError = e instanceof Error ? e.message : String(e);
    return false;
  }
}

/** 授权状态可能变化时调用: 重新实测 + 建齐子目录 */
export async function resetAccessAndEnsureDirs(): Promise<boolean> {
  accessCache = null;
  mode = null;
  safSubCache.clear();
  displayCache.clear();
  const ok = await hasClassAccess();
  if (ok) {
    lastAccessError = null;
    await ensureDirs();
  }
  return ok;
}

async function ensureDirs(): Promise<void> {
  if (mode === 'saf') {
    for (const s of SUBS) await safSubUri(s);
    return;
  }
  if (mode === 'direct') {
    for (const s of SUBS) {
      await FileSystem.makeDirectoryAsync(`${LEGACY_ROOT}${s}/`, { intermediates: true }).catch(() => {});
    }
  }
}

// ---------- 文件操作(统一走虚拟路径) ----------

/** 写文本文件(静默失败) */
export async function writeText(vpath: string, text: string): Promise<boolean> {
  const p = parseVPath(vpath);
  if (!p?.name) return false;
  if (!(await ensureMode())) return false;
  try {
    if (mode === 'saf') return !!(await safWriteFile(p.sub, p.name, text, 'utf8'));
    await FileSystem.writeAsStringAsync(directPath(vpath)!, text);
    return true;
  } catch {
    return false;
  }
}

/** 读文本文件(失败返回 null) */
export async function readText(vpath: string): Promise<string | null> {
  const p = parseVPath(vpath);
  if (!p?.name) return null;
  if (!(await ensureMode())) return null;
  try {
    if (mode === 'saf') {
      const uri = await safFileUri(p.sub, p.name);
      if (!uri) return null;
      return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    }
    return await FileSystem.readAsStringAsync(directPath(vpath)!, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    return null;
  }
}

/** 列出目录下匹配后缀的文件名(失败返回空数组) */
export async function listNames(vdir: string, suffix?: string): Promise<string[]> {
  const p = parseVPath(vdir);
  if (!p) return [];
  if (!(await ensureMode())) return [];
  try {
    let all: string[];
    if (mode === 'saf') {
      const subUri = await safSubUri(p.sub);
      if (!subUri) return [];
      const children = await StorageAccessFramework.readDirectoryAsync(subUri);
      all = children.map((u) => {
        try {
          return decodeURIComponent(u).split('/').pop() ?? '';
        } catch {
          return '';
        }
      });
    } else {
      all = await FileSystem.readDirectoryAsync(directPath(vdir)!);
    }
    const names = all.filter(Boolean);
    return suffix ? names.filter((n) => n.toLowerCase().endsWith(suffix)) : names;
  } catch {
    return [];
  }
}

/** 删除文件(静默, 不存在也视为成功) */
export async function classDelete(vpath: string): Promise<void> {
  const p = parseVPath(vpath);
  if (!p?.name) return;
  if (!(await ensureMode())) return;
  try {
    if (mode === 'saf') {
      const uri = await safFileUri(p.sub, p.name);
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
    } else {
      await FileSystem.deleteAsync(directPath(vpath)!, { idempotent: true });
    }
  } catch {
    // 静默
  }
}

/** 复制任意来源(file:// / content:// / 缓存目录)到 /Class 虚拟路径(失败抛错) */
export async function classCopy(from: string, toVPath: string): Promise<void> {
  const p = parseVPath(toVPath);
  if (!p?.name) throw new Error('目标路径无效');
  if (!(await ensureMode())) throw new Error('未授权访问手机 Class 文件夹');
  if (mode === 'saf') {
    const b64 = await FileSystem.readAsStringAsync(from, { encoding: FileSystem.EncodingType.Base64 });
    const ok = await safWriteFile(p.sub, p.name, b64, 'base64');
    if (!ok) throw new Error('SAF 写入失败');
    return;
  }
  await FileSystem.copyAsync({ from, to: directPath(toVPath)! });
}

/** 虚拟路径 → Image 可展示的真实 URI(file:// 或 content://); 非虚拟路径原样返回 */
export async function toDisplayUri(vpath: string): Promise<string | null> {
  // 兼容旧版本持久化的直连路径: 转成虚拟路径再解析
  if (vpath.startsWith(LEGACY_ROOT)) {
    return toDisplayUri(`class://${vpath.slice(LEGACY_ROOT.length)}`);
  }
  if (!vpath.startsWith('class://')) return vpath;
  const hit = displayCache.get(vpath);
  if (hit) return hit;
  if (!(await ensureMode())) return null;
  const p = parseVPath(vpath);
  if (!p?.name) return null;
  let uri: string | null = null;
  if (mode === 'saf') uri = await safFileUri(p.sub, p.name);
  else uri = directPath(vpath);
  if (uri) displayCache.set(vpath, uri);
  return uri;
}

/** 当前访问通道(供诊断展示): 'direct' | 'saf' | null */
export async function getAccessMode(): Promise<Mode> {
  if (!(await ensureMode())) return null;
  return mode;
}
