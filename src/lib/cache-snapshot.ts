/** 课表相关数据快照: 定期写入 /Class/缓存/课表缓存.json, 手机上可直接查看 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DIR_CACHE, hasClassAccess, writeText } from '@/lib/class-folder';

const KEYS = ['settings.timetable.v1', 'schedule-times.v1', 'school.grades.v1', 'school.exams.v1'];

/** 写入快照(无权限或失败时静默跳过) */
export async function writeCacheSnapshot(): Promise<void> {
  try {
    if (!(await hasClassAccess())) return;
    const entries = await AsyncStorage.multiGet(KEYS);
    const kv = Object.fromEntries(entries);
    if (!Object.values(kv).some(Boolean)) return;
    const json = JSON.stringify({ app: 'class-schedule-cache', version: 1, at: new Date().toISOString(), kv }, null, 2);
    await writeText(`${DIR_CACHE}课表缓存.json`, json);
  } catch {
    // 静默: 缓存快照不影响主流程
  }
}
