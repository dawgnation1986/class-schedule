/** 外观模式管理: 跟随系统 / 亮色 / 深色, AsyncStorage 持久化 + 订阅通知 */
import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'auto' | 'light' | 'dark';

const KEY = 'theme-mode-v1';
const LABELS: Record<ThemeMode, string> = { auto: '跟随系统', light: '亮色模式', dark: '深色模式' };

let cache: ThemeMode | null = null;
const subs = new Set<() => void>();

/** 启动预热(_layout 调用) */
export async function primeThemeMode(): Promise<void> {
  if (cache) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'auto';
  } catch {
    cache = 'auto';
  }
  applyNative(cache);
  subs.forEach((cb) => cb());
}

/** 同步读取当前模式(未加载完前返回 auto) */
export function getThemeMode(): ThemeMode {
  return cache ?? 'auto';
}

export function themeModeLabel(mode: ThemeMode): string {
  return LABELS[mode];
}

export function subscribeTheme(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

/** 手动模式下让 RN 原生组件(状态栏/弹窗等)同步跟随; auto 交还系统 */
function applyNative(mode: ThemeMode): void {
  if (Platform.OS !== 'web' && 'setColorScheme' in Appearance) {
    Appearance.setColorScheme(mode === 'auto' ? 'unspecified' : mode);
  }
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  cache = mode;
  applyNative(mode);
  await AsyncStorage.setItem(KEY, mode).catch(() => {});
  subs.forEach((cb) => cb());
}
