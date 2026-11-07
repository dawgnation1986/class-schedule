/** 自定义倒计时(如四六级/期末考试): 列表持久化 + 订阅 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'countdowns.v1';

export type Countdown = { id: string; name: string; date: string }; // date: YYYY-MM-DD

let cache: Countdown[] | null = null;
const subs = new Set<() => void>();

export function subscribeCountdowns(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

async function persist(list: Countdown[]): Promise<void> {
  cache = list;
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
  subs.forEach((f) => f());
}

export async function loadCountdowns(): Promise<Countdown[]> {
  if (!cache) {
    let parsed: Countdown[] = [];
    try {
      parsed = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    } catch {
      parsed = [];
    }
    cache = Array.isArray(parsed) ? parsed : [];
  }
  return cache;
}

export async function addCountdown(name: string, date: string): Promise<void> {
  const list = await loadCountdowns();
  await persist([...list, { id: `${Date.now()}`, name: name.trim(), date }]);
}

export async function removeCountdown(id: string): Promise<void> {
  await persist((await loadCountdowns()).filter((c) => c.id !== id));
}

/** 距离目标日还有几天(以当天 12:00 计算, 同日=0) */
export function daysUntil(date: string): number {
  return Math.round((new Date(`${date}T12:00:00`).getTime() - new Date().setHours(12, 0, 0, 0)) / 86400000);
}
