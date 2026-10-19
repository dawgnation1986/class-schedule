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

/** 用课表重新排期未来 7 天的提醒: 上课前 5 分钟 + 下课前 1 分钟(先清掉旧的) */
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
              channelId: Platform.OS === 'android' ? 'class-remind' : undefined,
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
              channelId: Platform.OS === 'android' ? 'class-remind' : undefined,
            },
          });
        }
      }
    }
  } catch {
    // 通知是增强功能, 失败静默(如 Expo Go 新版不支持)
  }
}
