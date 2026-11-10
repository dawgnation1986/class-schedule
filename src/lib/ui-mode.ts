/** 界面模式管理: 原版界面 / 墨夜主题, AsyncStorage 持久化 + 订阅通知 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type UiMode = 'original' | 'night';

const KEY = 'ui-mode-v1';
const LABELS: Record<UiMode, string> = { original: '原版界面', night: '墨夜主题' };

let cache: UiMode | null = null;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((cb) => cb());
}

/** 启动预热(_layout 调用); 旧版"glass"值自动迁移为 night */
export async function primeUiMode(): Promise<void> {
  if (cache) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw === 'glass' || raw === 'night' ? 'night' : 'original';
  } catch {
    cache = 'original';
  }
  notify();
}

/** 同步读取当前模式(未加载完前返回 original) */
export function getUiMode(): UiMode {
  return cache ?? 'original';
}

export function uiModeLabel(mode: UiMode): string {
  return LABELS[mode];
}

export function subscribeUiMode(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export async function saveUiMode(mode: UiMode): Promise<void> {
  cache = mode;
  await AsyncStorage.setItem(KEY, mode).catch(() => {});
  notify();
}
