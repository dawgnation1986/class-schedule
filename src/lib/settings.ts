import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryType } from './timetable';

export type Settings = {
  xb: string; // 系部代码, 如 08
  xbLabel: string; // 环境经济与信息学院
  zy: string; // 专业代码, 如 0820
  zyLabel: string; // 计算机应用技术
  bj: string; // 班级代码, 如 2025082001
  bjLabel: string; // 应用25301
  queryType: QueryType; // realtime=本周实时课表(推荐) / original=原始课表
};

const KEY = 'settings.timetable.v1';

export const DEFAULT_QUERY_TYPE: QueryType = 'realtime';

export async function loadSettings(): Promise<Settings | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Settings;
    if (!s.xb || !s.zy || !s.bj) return null;
    if (s.queryType !== 'original' && s.queryType !== 'realtime') s.queryType = DEFAULT_QUERY_TYPE;
    return s;
  } catch {
    return null;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}
