/** 界面模式管理: 原版界面 / 液态玻璃, AsyncStorage 持久化 + 订阅通知
 *  夜墨黑已下线: 旧数据里的 night/glass 统一迁移为液态玻璃
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type UiMode = 'original' | 'glass' | 'night';

const KEY = 'ui-mode-v1';
const LABELS: Record<UiMode, string> = { original: '原版界面', glass: '液态玻璃', night: '液态玻璃' };

let cache: UiMode | null = null;
/** 是否已经从 AsyncStorage 读完(读完前不允许挂载任何原生导航器) */
let initialized = false;
/** 预热 Promise 锁: 防止重复读取/重复初始化 */
let priming: Promise<void> | null = null;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((cb) => cb());
}

/** 模式是否已确认(读取失败也算确认, 回退 original) */
export function isUiModeReady(): boolean {
  return initialized;
}

/** 启动预热(_layout 调用); 旧的 night 值迁移为液态玻璃 */
export async function primeUiMode(): Promise<void> {
  if (initialized) return;
  if (priming) return priming;
  priming = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      cache = raw === 'night' || raw === 'glass' ? 'glass' : 'original';
    } catch {
      cache = 'original';
    } finally {
      initialized = true;
      priming = null;
      notify();
    }
  })();
  return priming;
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
  const next: UiMode = mode === 'night' ? 'glass' : mode;
  cache = next;
  await AsyncStorage.setItem(KEY, next).catch(() => {});
  notify();
}
