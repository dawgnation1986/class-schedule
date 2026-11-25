/** 墨夜「液态玻璃」兼容开关(调试用)
 *  玻璃效果完全由 JS/StyleSheet 实现, 不依赖原生模糊模块。
 *  若某些机型出现卡顿/花屏/崩溃, 在「我的 → 界面设置」关闭玻璃效果即可回退为实色面板,
 *  开关持久化, 下次启动仍然生效。也可通过 setNightGlassDisabled(true) 远程/代码关闭。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'night-glass-off-v1';
/** 构建期总开关: 设置 EXPO_PUBLIC_NIGHT_GLASS=off 可整包禁用原生模糊 */
const ENV_OFF = process.env.EXPO_PUBLIC_NIGHT_GLASS === 'off';

let disabled = false;
let primed = false;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((cb) => cb());
}

export async function primeNightGlass(): Promise<void> {
  if (primed) return;
  try {
    disabled = (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    disabled = false;
  }
  primed = true;
  notify();
}

export function isNightGlassDisabled(): boolean {
  return ENV_OFF || disabled;
}

export function subscribeNightGlass(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export async function setNightGlassDisabled(next: boolean): Promise<void> {
  disabled = next;
  primed = true;
  await AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
  notify();
}

/** 调试接口: 一键开关玻璃效果 */
export function setNightGlassEnabled(enabled: boolean): Promise<void> {
  return setNightGlassDisabled(!enabled);
}
