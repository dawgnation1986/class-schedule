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

/** 每个大节的开始时间(按当前作息时间表动态计算, 跳过"中午") */
function periodStartMin(period: string): number | null {
  const t = getPeriodTimes()[period];
  if (!t) return null;
  const [h, m] = t[0].split(':').map(Number);
  return h * 60 + m;
}

let configured = false;

async function ensureChannel(Notifications: NotificationsModule) {
  if (configured) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('class-remind', {
      name: '上课提醒',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  configured = true;
}

/** 用课表重新排期未来 7 天的上课提醒(先清掉旧的) */
export async function scheduleClassReminders(timetable: Timetable) {
  try {
    if (!timetable?.rows?.length) return;
    const Notifications = loadNotifications();
    if (!Notifications) return; // Expo Go Android: 通知不可用, 静默跳过

    const perm = await Notifications.getPermissionsAsync();
    const ok = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!ok) return;
    await ensureChannel(Notifications);
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const day = new Date(now);
      day.setDate(now.getDate() + dayOffset);
      // rows.days[0..6] 对应星期一~星期日
      const col = (day.getDay() + 6) % 7;
      for (const period of ['1-2', '3-4', '5-6', '7-8', '9-10']) {
        const startMin = periodStartMin(period);
        if (startMin == null) continue;
        const row = timetable.rows.find((r) => r.period === period);
        const entries = row?.days[col] ?? [];
        const course = entries[0];
        if (!course?.name) continue;

        const trigger = new Date(day);
        trigger.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
        trigger.setMinutes(trigger.getMinutes() - 10); // 上课前 10 分钟
        if (trigger.getTime() <= now.getTime()) continue;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `下节课：${course.name}`,
            body: [
              course.location ? `教室：${course.location}` : '',
              course.teacher ? `教师：${course.teacher}` : '',
              `${period} 节 · 10 分钟后上课`,
            ]
              .filter(Boolean)
              .join('\n'),
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: trigger,
            channelId: Platform.OS === 'android' ? 'class-remind' : undefined,
          },
        });
      }
    }
  } catch {
    // 通知是增强功能, 失败静默(如 Expo Go 新版不支持)
  }
}
