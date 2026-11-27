/**
 * SuperGlass 模式: 全站统一使用原生液态玻璃控件 (expo-android-glass-view)
 * - 开关持久化在 AsyncStorage, 全部组件通过 useSuperGlass() 订阅
 * - 与"液态玻璃"界面模式相互独立: SuperGlass 只决定材质, 不决定布局
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'super-glass-v1';

let enabled = false;
let primed = false;
let priming: Promise<void> | null = null;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((cb) => cb());
}

export function isSuperGlass(): boolean {
  return enabled;
}

/** 读取持久化开关(只读一次); 读取失败按关闭处理 */
export function primeSuperGlass(): Promise<void> {
  if (primed) return Promise.resolve();
  if (priming) return priming;
  priming = AsyncStorage.getItem(KEY)
    .then((v) => {
      enabled = v === '1';
    })
    .catch(() => {
      enabled = false;
    })
    .finally(() => {
      primed = true;
      priming = null;
      notify();
    });
  return priming;
}

export function setSuperGlass(v: boolean): void {
  enabled = v;
  notify();
  void AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {});
}

export function subscribeSuperGlass(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}
