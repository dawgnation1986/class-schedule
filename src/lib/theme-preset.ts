/**
 * 主题预设档位系统
 * - 自定义: 玩家自己搭配(界面模式 + 亮/深 + 背景图), 切走时自动快照, 切回自动还原
 * - 内置档位: 纯白 / 纯黑 / 墨夜 / 护眼米黄 / 淡雅蓝
 * - 导出/导入: JSON 写入 /Class/主题预设 (含背景图文件), 可跨设备分享
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { DIR_BG, DIR_PRESET, hasClassAccess, listNames, readText, writeText } from '@/lib/class-folder';
import { getBackground, setBgSetting, type BgSetting } from '@/lib/background';
import { getThemeMode, saveThemeMode, type ThemeMode } from '@/lib/theme';
import { getUiMode, saveUiMode, type UiMode } from '@/lib/ui-mode';

export type PresetId = 'custom' | 'pure-white' | 'pure-black' | 'night' | 'sepia' | 'azure';

export type PresetDef = {
  id: PresetId;
  name: string;
  desc: string;
  /** 预览双色块 [底色, 元素色] */
  swatch: [string, string];
  icon: string;
  uiMode: UiMode;
  scheme: 'light' | 'dark';
  /** 亮色模式下的自定义调色板(护眼米黄/淡雅蓝) */
  palette?: 'sepia' | 'azure';
};

export const PRESETS: PresetDef[] = [
  { id: 'custom', name: '自定义', desc: '自己搭配的界面与背景', swatch: ['#2563eb', '#93C5FD'], icon: 'color-palette-outline', uiMode: 'original', scheme: 'light' },
  { id: 'pure-white', name: '纯白', desc: '经典白底, 清晰直白', swatch: ['#FFFFFF', '#F0F0F3'], icon: 'sunny-outline', uiMode: 'original', scheme: 'light' },
  { id: 'pure-black', name: '纯黑', desc: '纯黑底色, 省电护眼', swatch: ['#000000', '#212225'], icon: 'moon-outline', uiMode: 'original', scheme: 'dark' },
  { id: 'night', name: '墨夜', desc: '深邃夜空 · 蓝紫辉光', swatch: ['#0B0E17', '#151B2B'], icon: 'moon', uiMode: 'night', scheme: 'dark' },
  { id: 'sepia', name: '护眼米黄', desc: '暖米纸感, 长时间阅读不累', swatch: ['#F7F1E3', '#EFE7D3'], icon: 'book-outline', uiMode: 'original', scheme: 'light', palette: 'sepia' },
  { id: 'azure', name: '淡雅蓝', desc: '浅蓝清爽, 蓝色点缀', swatch: ['#F3F8FD', '#E4EEF8'], icon: 'water-outline', uiMode: 'original', scheme: 'light', palette: 'azure' },
];

const KEY = 'theme-preset-v1';
const SNAP_KEY = 'theme-appearance-snap-v1';

/** 自定义外观快照(切到内置档位前保存, 切回"自定义"时还原) */
type AppearanceSnap = { uiMode: UiMode; themeMode: ThemeMode; bg: BgSetting };

let cache: { presetId: PresetId; snap: AppearanceSnap | null; customPalette?: CustomPaletteId } = { presetId: 'custom', snap: null };
let loaded = false;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((cb) => cb());
}

/** 启动预热(_layout 调用) */
export async function primeThemePreset(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const id = raw as PresetId | null;
    if (id && PRESETS.some((p) => p.id === id)) cache.presetId = id;
    const snapRaw = await AsyncStorage.getItem(SNAP_KEY);
    if (snapRaw) cache.snap = JSON.parse(snapRaw) as AppearanceSnap;
    const cpRaw = await AsyncStorage.getItem(CPALETTE_KEY);
    if (cpRaw && CUSTOM_PALETTES.some((p) => p.id === cpRaw)) cache.customPalette = cpRaw as CustomPaletteId;
  } catch {
    // 保持默认
  }
  loaded = true;
  notify();
}

export function getPresetId(): PresetId {
  return loaded ? cache.presetId : 'custom';
}

export function usePresetId(): PresetId {
  // 组件侧订阅由 hooks/use-preset-id 提供; 此处仅同步读取
  return getPresetId();
}

export function subscribePreset(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

async function setPresetId(id: PresetId): Promise<void> {
  cache.presetId = id;
  await AsyncStorage.setItem(KEY, id).catch(() => {});
  notify();
}

async function snapshotCustom(): Promise<void> {
  const snap: AppearanceSnap = { uiMode: getUiMode(), themeMode: getThemeMode(), bg: getBackground() };
  cache.snap = snap;
  await AsyncStorage.setItem(SNAP_KEY, JSON.stringify(snap)).catch(() => {});
}

/** 应用预设档位 */
export async function applyPreset(id: PresetId): Promise<void> {
  if (id === 'custom') {
    const snap = cache.snap;
    if (snap) {
      await saveUiMode(snap.uiMode);
      await saveThemeMode(snap.themeMode);
      await setBgSetting(snap.bg);
    }
    await setPresetId('custom');
    return;
  }
  const def = PRESETS.find((p) => p.id === id);
  if (!def) return;
  if (cache.presetId === 'custom') await snapshotCustom();
  await saveUiMode(def.uiMode);
  await saveThemeMode(def.scheme);
  await setBgSetting({ ...getBackground(), uri: null });
  await setPresetId(id);
}

/** 是否处于自定义调色板预设(护眼米黄/淡雅蓝) */
export function presetPalette(id: PresetId): 'sepia' | 'azure' | null {
  return PRESETS.find((p) => p.id === id)?.palette ?? null;
}

// ---------- 自定义配色(仅"自定义"档生效, 覆盖浅色/深色底色) ----------

export type CustomPaletteId = 'default' | 'sepia' | 'azure' | 'green' | 'pink' | 'violet';

type PaletteOverride = {
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
};

export const CUSTOM_PALETTES: { id: CustomPaletteId; label: string; swatch: string; light: PaletteOverride; dark: PaletteOverride }[] = [
  { id: 'default', label: '默认', swatch: '#E0E1E6', light: { text: '#000000', background: '#ffffff', backgroundElement: '#F0F0F3', backgroundSelected: '#E0E1E6', textSecondary: '#60646C' }, dark: { text: '#ffffff', background: '#000000', backgroundElement: '#212225', backgroundSelected: '#2E3135', textSecondary: '#B0B4BA' } },
  { id: 'sepia', label: '米黄', swatch: '#F7F1E3', light: { text: '#3E3423', background: '#F7F1E3', backgroundElement: '#EFE7D3', backgroundSelected: '#E3D9BF', textSecondary: '#857A61' }, dark: { text: '#EFE7D3', background: '#1C1913', backgroundElement: '#2A251B', backgroundSelected: '#38311F', textSecondary: '#A99F86' } },
  { id: 'azure', label: '浅蓝', swatch: '#CFE0F0', light: { text: '#1B3A5C', background: '#F3F8FD', backgroundElement: '#E4EEF8', backgroundSelected: '#CFE0F0', textSecondary: '#5B7B9E' }, dark: { text: '#DCE8F5', background: '#0F1620', backgroundElement: '#1A2330', backgroundSelected: '#24334A', textSecondary: '#8FA6C0' } },
  { id: 'green', label: '浅绿', swatch: '#CFE4D1', light: { text: '#1F3A26', background: '#F1F8F2', backgroundElement: '#E2EFE3', backgroundSelected: '#CFE4D1', textSecondary: '#5F7D68' }, dark: { text: '#DCEBDC', background: '#101710', backgroundElement: '#1A261A', backgroundSelected: '#243324', textSecondary: '#93A893' } },
  { id: 'pink', label: '樱花粉', swatch: '#F2D5DF', light: { text: '#43242F', background: '#FDF3F6', backgroundElement: '#F9E6EC', backgroundSelected: '#F2D5DF', textSecondary: '#96687A' }, dark: { text: '#F5DCE4', background: '#1B1013', backgroundElement: '#2A1A20', backgroundSelected: '#38222B', textSecondary: '#B293A0' } },
  { id: 'violet', label: '淡紫', swatch: '#DFD7F1', light: { text: '#2C2350', background: '#F6F3FD', backgroundElement: '#ECE7F9', backgroundSelected: '#DFD7F1', textSecondary: '#71679B' }, dark: { text: '#E6DDF7', background: '#14101E', backgroundElement: '#201A30', backgroundSelected: '#2B2340', textSecondary: '#A296BF' } },
];

const CPALETTE_KEY = 'theme-custom-palette-v1';

/** 取当前自定义配色(默认/未设置时为 'default') */
export function getCustomPaletteId(): CustomPaletteId {
  return cache.customPalette ?? 'default';
}

/** 切换自定义配色(仅"自定义"档使用; 其他档位会忽略) */
export async function setCustomPaletteId(id: CustomPaletteId): Promise<void> {
  cache.customPalette = id;
  await AsyncStorage.setItem(CPALETTE_KEY, id).catch(() => {});
  notify();
}

/** 自定义配色改动也走同一订阅通道(usePresetId 会刷新) */
export function subscribeCustomPalette(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

// ---------- 导出 / 导入 ----------

export type ThemeExport = {
  app: 'class-schedule-theme';
  version: 1;
  name: string;
  at: string;
  uiMode: UiMode;
  scheme: ThemeMode;
  bgOpacity: number;
  bgCtrl: boolean;
  /** 同目录的背景图文件名(无背景图时缺省) */
  bgFile?: string;
};

export type PresetFile = {
  file: string;
  data: ThemeExport;
};

/** 当前主题是否可导出(需要 /Class 权限) */
export async function canExportTheme(): Promise<boolean> {
  return hasClassAccess();
}

/** 导出当前主题到 /Class/主题预设/<名称>.theme.json (背景图一并复制) */
export async function exportTheme(name: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!(await hasClassAccess())) return { ok: false, error: '需要"所有文件访问"权限才能导出到 /Class' };
  const clean = name.trim().replace(/[\\/:*?"<>|]/g, '') || '我的主题';
  const bg = getBackground();
  const exp: ThemeExport = {
    app: 'class-schedule-theme',
    version: 1,
    name: clean,
    at: new Date().toISOString(),
    uiMode: getUiMode(),
    scheme: getThemeMode() === 'dark' ? 'dark' : 'light',
    bgOpacity: bg.opacity,
    bgCtrl: !!bg.ctrl,
  };
  if (bg.uri) {
    const ext = bg.uri.split('.').pop()?.toLowerCase() || 'jpg';
    if (/^(jpg|jpeg|png|webp)$/.test(ext)) {
      const bgName = `${clean}.bg.${ext}`;
      try {
        await FileSystem.copyAsync({ from: bg.uri, to: `${DIR_PRESET}${bgName}` });
        exp.bgFile = bgName;
      } catch {
        // 背景图复制失败则不带图导出
      }
    }
  }
  const path = `${DIR_PRESET}${clean}.theme.json`;
  const ok = await writeText(path, JSON.stringify(exp, null, 2));
  return ok ? { ok: true, path } : { ok: false, error: '写入文件失败' };
}

/** 列出 /Class/主题预设 下可导入的主题 */
export async function listThemeFiles(): Promise<PresetFile[]> {
  if (!(await hasClassAccess())) return [];
  const names = await listNames(DIR_PRESET, '.theme.json');
  const out: PresetFile[] = [];
  for (const file of names) {
    const raw = await readText(`${DIR_PRESET}${file}`);
    if (!raw) continue;
    try {
      const j = JSON.parse(raw) as ThemeExport;
      if (j?.app === 'class-schedule-theme' && typeof j.name === 'string') out.push({ file, data: j });
    } catch {
      // 跳过损坏文件
    }
  }
  return out.sort((a, b) => (a.data.at < b.data.at ? 1 : -1));
}

/** 应用导入的主题(外观写入, 归入"自定义"档) */
export async function applyThemeFile(item: PresetFile): Promise<void> {
  const exp = item.data;
  if (cache.presetId === 'custom') await snapshotCustom();
  await saveUiMode(exp.uiMode === 'night' ? 'night' : 'original');
  await saveThemeMode(exp.scheme === 'dark' ? 'dark' : exp.scheme === 'light' ? 'light' : 'light');
  let bg: BgSetting = { uri: null, opacity: exp.bgOpacity, ctrl: exp.bgCtrl };
  if (exp.bgFile) {
    const src = `${DIR_PRESET}${exp.bgFile}`;
    const ext = exp.bgFile.split('.').pop()?.toLowerCase() || 'jpg';
    const dest = `${DIR_BG}imported-bg.${ext}`;
    try {
      await FileSystem.copyAsync({ from: src, to: dest });
      bg = { ...bg, uri: dest };
    } catch {
      // 找不到背景图文件则无图
    }
  }
  await setBgSetting(bg);
  await setPresetId('custom');
}

/** 删除 /Class/主题预设 下的主题文件(连同背景图) */
export async function deleteThemeFile(item: PresetFile): Promise<void> {
  await FileSystem.deleteAsync(`${DIR_PRESET}${item.file}`, { idempotent: true }).catch(() => {});
  if (item.data.bgFile) {
    await FileSystem.deleteAsync(`${DIR_PRESET}${item.data.bgFile}`, { idempotent: true }).catch(() => {});
  }
}
