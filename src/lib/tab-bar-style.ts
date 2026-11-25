/** 液态玻璃底栏外观: 颜色 + 是否透字(毛玻璃) */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TabBarLook = {
  /** 底栏颜色(透字模式下作为玻璃染色) */
  color: string;
  /** true = 透字毛玻璃; false = 奶白/纯色实底 */
  seeThrough: boolean;
};

const KEY = 'tabbar-look-v1';

export const TAB_BAR_COLORS = [
  { name: '奶白', value: '#F7F3EA' },
  { name: '纯白', value: '#FFFFFF' },
  { name: '雾蓝', value: '#DCE9FF' },
  { name: '浅粉', value: '#FBE7F1' },
  { name: '薄荷', value: '#E2F5EC' },
  { name: '深空', value: '#20242E' },
] as const;

let look: TabBarLook = { color: '#F7F3EA', seeThrough: false };
let primed = false;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((cb) => cb());
}

export async function primeTabBarLook(): Promise<void> {
  if (primed) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<TabBarLook>;
      if (typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color)) look.color = p.color;
      if (typeof p.seeThrough === 'boolean') look.seeThrough = p.seeThrough;
    }
  } catch {
    // 用默认值
  }
  primed = true;
  notify();
}

export function getTabBarLook(): TabBarLook {
  return look;
}

export function subscribeTabBarLook(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export async function setTabBarLook(patch: Partial<TabBarLook>): Promise<void> {
  look = { ...look, ...patch };
  primed = true;
  await AsyncStorage.setItem(KEY, JSON.stringify(look)).catch(() => {});
  notify();
}

/** 颜色亮度(0~1), 用于判断底栏该用深色还是浅色文字 */
export function luminance(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** #RRGGBB + 透明度 → rgba() */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
