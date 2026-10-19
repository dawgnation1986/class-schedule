/**
 * 作息时间表管理
 * - 冬季作息: 按校历《冬季作息时间表》(起床 6:10 / 第一节 8:20 起)
 * - 夏季作息: 未单独导入时, 默认 = 冬季全部时间推后 20 分钟
 * - 课表倒计时 / 今日课程 / 上课提醒通知均按当前所选作息计算
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type PeriodTimes = Record<string, [string, string]>;
export type Season = 'winter' | 'summer';

const KEY = 'schedule-times.v1';

/** 冬季作息时间表(校历) — 大节 = 两个小节连续, 结束取第二小节结束 */
export const WINTER_TIMES: PeriodTimes = {
  '1-2': ['08:20', '10:00'], // 一 8:20-9:05 / 二 9:15-10:00
  '3-4': ['10:20', '12:00'], // 三 10:20-11:05 / 四 11:15-12:00
  中午: ['12:00', '14:00'], // 午餐午休, 第五节 14:00 起
  '5-6': ['14:00', '15:40'], // 五 14:00-14:45 / 六 14:55-15:40
  '7-8': ['16:00', '17:40'], // 七 16:00-16:45 / 八 16:55-17:40
  '9-10': ['19:00', '20:40'], // 九 19:00-19:45 / 十 19:55-20:40
};

function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function minToHHMM(v: number): string {
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 全部时间推后 offsetMin 分钟 */
function shiftTimes(base: PeriodTimes, offsetMin: number): PeriodTimes {
  const out: PeriodTimes = {};
  for (const [k, [s, e]] of Object.entries(base)) {
    out[k] = [minToHHMM(hhmmToMin(s) + offsetMin), minToHHMM(hhmmToMin(e) + offsetMin)];
  }
  return out;
}

/** 夏季作息 = 冬季推后 20 分钟 (未单独导入时的默认) */
export const SUMMER_TIMES: PeriodTimes = shiftTimes(WINTER_TIMES, 20);

export function timesForSeason(s: Season): PeriodTimes {
  return s === 'summer' ? SUMMER_TIMES : WINTER_TIMES;
}

type Stored = { season: Season; custom?: PeriodTimes | null };

let cachedSeason: Season | null = null;
let cachedCustom: PeriodTimes | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** app 启动时预热(读取持久化的作息选择与自定义表) */
export async function primeScheduleTimes(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Stored;
      if (s.season === 'winter' || s.season === 'summer') cachedSeason = s.season;
      if (s.custom && typeof s.custom === 'object') cachedCustom = s.custom;
    }
  } catch {
    // 忽略损坏数据, 用默认
  }
}

/** 当前作息预设选择(未预热时同步返回冬季) */
export function currentSeason(): Season {
  return cachedSeason ?? 'winter';
}

/** 当前是否使用自定义作息 */
export function hasCustomTimes(): boolean {
  return !!cachedCustom;
}

/** 生效中的大节时间表: 自定义优先, 否则按预设 */
export function getPeriodTimes(): PeriodTimes {
  return cachedCustom ?? timesForSeason(currentSeason());
}

/** 当前生效的来源描述 */
export function activeSourceLabel(): string {
  if (cachedCustom) return '自定义作息';
  return SEASON_LABEL[currentSeason()];
}

export function subscribeTimes(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 选择预设作息(清除自定义) */
export async function useSeasonPreset(s: Season): Promise<void> {
  cachedSeason = s;
  cachedCustom = null;
  await AsyncStorage.setItem(KEY, JSON.stringify({ season: s } as Stored));
  emit();
}

/** 保存自定义作息(编辑或 JSON 导入的结果), 立即生效 */
export async function saveCustomTimes(times: PeriodTimes): Promise<void> {
  cachedCustom = times;
  await AsyncStorage.setItem(KEY, JSON.stringify({ season: currentSeason(), custom: times } as Stored));
  emit();
}

/** 清除自定义, 回到预设 */
export async function clearCustomTimes(): Promise<void> {
  cachedCustom = null;
  await AsyncStorage.setItem(KEY, JSON.stringify({ season: currentSeason() } as Stored));
  emit();
}

/**
 * 解析作息 JSON, 支持两种格式:
 *  1. 简版: {"1-2": ["08:20","10:00"], "5-6": ["14:00","15:40"], ...}
 *  2. 对象版: {"1-2": {"start":"08:20","end":"10:00"}, ...}
 * 返回 {ok, times?, error?}
 */
export function parseTimesJson(text: string): { ok: boolean; times?: PeriodTimes; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是合法的 JSON' };
  }
  const obj = (raw as { periods?: unknown })?.periods ?? raw;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'JSON 需要是对象, 如 {"1-2":["08:20","10:00"]}' };
  }
  const times: PeriodTimes = {};
  const hm = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    let start: string | undefined;
    let end: string | undefined;
    if (Array.isArray(v) && v.length === 2) {
      start = String(v[0]);
      end = String(v[1]);
    } else if (v && typeof v === 'object') {
      const o = v as { start?: unknown; end?: unknown; s?: unknown; e?: unknown };
      start = o.start != null ? String(o.start) : o.s != null ? String(o.s) : undefined;
      end = o.end != null ? String(o.end) : o.e != null ? String(o.e) : undefined;
    }
    if (!start || !end || !hm.test(start) || !hm.test(end)) {
      return { ok: false, error: `"${k}" 的时间格式不对, 需要 HH:MM` };
    }
    times[k] = [start.padStart(5, '0'), end.padStart(5, '0')];
  }
  if (!Object.keys(times).length) return { ok: false, error: '没有任何节次数据' };
  return { ok: true, times };
}

/** 校验 HH:MM */
export function isValidHM(s: string): boolean {
  return /^([01]?\d|2[0-3]):([0-5]\d)$/.test(s.trim());
}

export const SEASON_LABEL: Record<Season, string> = {
  winter: '冬季作息',
  summer: '夏季作息',
};
