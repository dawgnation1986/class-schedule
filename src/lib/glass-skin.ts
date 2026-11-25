/** 液态玻璃风格开关(独立于墨夜主题)
 *  墨夜 = 实色深色面板; 液态玻璃 = 同一套布局 + iOS 26 原生毛玻璃。
 *  两者共用 night 布局代码, 通过此开关切换渲染风格。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'glass-skin-v1';

let enabled = false;
let primed = false;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((cb) => cb());
}

export async function primeGlassSkin(): Promise<void> {
  if (primed) return;
  try {
    enabled = (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    enabled = false;
  }
  primed = true;
  notify();
}

export function isGlassSkin(): boolean {
  return enabled;
}

export function subscribeGlassSkin(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export async function setGlassSkin(next: boolean): Promise<void> {
  enabled = next;
  primed = true;
  await AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
  notify();
}
