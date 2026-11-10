/** 上课提醒: 按周课表为未来 7 天排本地通知(上课前 10 分钟)
 *  注意: Expo Go (Android, SDK 53+) 已移除 expo-notifications, import 时即抛错;
 *  因此先用 expo-constants 识别 Expo Go 再惰性 require, 保证主功能不受影响。 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import type { Timetable } from './timetable';
import { getPeriodTimes } from './schedule-times';

type NotificationsModule = typeof import('expo-notifications');

/** Expo Go Android 下 import expo-notifications 会直接抛错, 直接跳过 */
function loadNotifications(): NotificationsModule | null {
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (inExpoGo && Platform.OS === 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

/** 把"当天第 mins 分钟"转成具体时间点 */
function atMinutes(day: Date, mins: number): Date {
  const d = new Date(day);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}

function hmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** 通知渠道: 上课 / 下课分开注册, 系统通知设置里可分别查看与管理 */
export const START_CHANNEL_ID = 'class-start-v3';
export const END_CHANNEL_ID = 'class-end-v1';
/** 旧版合并渠道(上课下课共用, 名字只叫"上课提醒"), 已废弃, 启动时自动清理 */
const LEGACY_CHANNEL_ID = 'class-remind-v2';

/** 渠道状态: ok=已存在且 MAX / created=新建 / recreated=重要级不足删除重建 / unavailable=模块不可用 */
export type ReminderChannelStatus = 'ok' | 'created' | 'recreated' | 'unavailable';

/** 确保上课/下课两个提醒渠道都存在且为 MAX 重要级: 不存在则创建; 重要级不足(创建后不可改)则删除重建 */
export async function ensureReminderChannel(): Promise<ReminderChannelStatus> {
  const Notifications = loadNotifications();
  if (!Notifications || Platform.OS !== 'android') return 'unavailable';
  try {
    // 清理旧版合并渠道, 避免系统设置里残留"上课提醒"单渠道
    if (await Notifications.getNotificationChannelAsync(LEGACY_CHANNEL_ID)) {
      await Notifications.deleteNotificationChannelAsync(LEGACY_CHANNEL_ID);
    }
    const defs: Array<[string, string]> = [
      [START_CHANNEL_ID, '上课提醒'],
      [END_CHANNEL_ID, '下课提醒'],
    ];
    let worst: ReminderChannelStatus = 'ok';
    for (const [id, name] of defs) {
      const ch = await Notifications.getNotificationChannelAsync(id);
      if (ch && Number(ch.importance) === Notifications.AndroidImportance.MAX) continue;
      if (ch) await Notifications.deleteNotificationChannelAsync(id);
      // MAX 重要级 + 振动 → 锁屏/后台弹出横幅(heads-up, 像微信消息那样)
      await Notifications.setNotificationChannelAsync(id, {
        name,
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 300, 250, 300],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      if (ch) worst = 'recreated';
      else if (worst === 'ok') worst = 'created';
    }
    return worst;
  } catch {
    return 'unavailable';
  }
}

/** App 启动时调用: 自动创建/修复渠道 + 权限未授权时请求一次(不弹则需用户去系统设置开) */
export async function initNotifications(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  await ensureReminderChannel();
  try {
    const p = await Notifications.getPermissionsAsync();
    if (!p.granted) await Notifications.requestPermissionsAsync();
  } catch {
    // 权限请求失败不影响启动
  }
}

/** 用课表重新排期未来 7 天的提醒: 上课前 5 分钟 + 下课前 1 分钟(先清掉旧的) */
export async function scheduleClassReminders(timetable: Timetable) {
  try {
    if (!timetable?.rows?.length) return;
    const Notifications = loadNotifications();
    if (!Notifications) return; // Expo Go Android: 通知不可用, 静默跳过

    const perm = await Notifications.getPermissionsAsync();
    const ok = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!ok) return;
    await ensureReminderChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const day = new Date(now);
      day.setDate(now.getDate() + dayOffset);
      // rows.days[0..6] 对应星期一~星期日
      const col = (day.getDay() + 6) % 7;
      for (const period of ['1-2', '3-4', '5-6', '7-8', '9-10']) {
        const t = getPeriodTimes()[period];
        if (!t) continue;
        const startMin = hmToMin(t[0]);
        const endMin = hmToMin(t[1]);
        const row = timetable.rows.find((r) => r.period === period);
        const entries = row?.days[col] ?? [];
        const course = entries[0];
        if (!course?.name) continue;

        // 上课前 5 分钟: 提醒下节是什么课、几点上课
        const startAt = atMinutes(day, startMin - 5);
        if (startAt.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `5分钟后上课：${course.name}`,
              body: [
                course.location ? `教室：${course.location}` : '',
                course.teacher ? `教师：${course.teacher}` : '',
                `${period} 节 · ${t[0]} 开始上课`,
              ]
                .filter(Boolean)
                .join('\n'),
              sound: 'default',
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: startAt,
              channelId: Platform.OS === 'android' ? START_CHANNEL_ID : undefined,
            },
          });
        }

        // 下课前 1 分钟
        const endAt = atMinutes(day, endMin - 1);
        if (endAt.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `1分钟后下课：${course.name}`,
              body: `${period} 节 · ${t[1]} 下课`,
              sound: 'default',
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: endAt,
              channelId: Platform.OS === 'android' ? END_CHANNEL_ID : undefined,
            },
          });
        }
      }
    }
  } catch {
    // 通知是增强功能, 失败静默(如 Expo Go 新版不支持)
  }
}
