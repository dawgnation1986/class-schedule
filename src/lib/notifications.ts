/** 上课提醒: 按周课表为未来 7 天排本地通知(上课/下课提前 N 分钟, 设置页可调)
 *  注意: Expo Go (Android, SDK 53+) 已移除 expo-notifications, import 时即抛错;
 *  因此先用 expo-constants 识别 Expo Go 再惰性 require, 保证主功能不受影响。 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { beijingNow, fetchTimetable, type Timetable } from './timetable';
import { getCachedExams, getGradesStat, type ExamInfo } from './school-data';
import { getCachedWeather } from './weather';
import { getPeriodTimes, primeScheduleTimes } from './schedule-times';
import { loadSettings, loadTimetableCache, saveTimetableCache, weekKeyOf } from './settings';
import { refreshWidgets } from './widget';

type NotificationsModule = typeof import('expo-notifications');

/** 提醒提前分钟数设置(上课前/下课前, 0-30 分钟, 默认上课前 5 分钟、下课前 1 分钟) */
export type ReminderMinutes = { start: number; end: number };

const REMIND_KEY = 'reminder.minutes.v1';
export const DEFAULT_REMINDER_MINUTES: ReminderMinutes = { start: 5, end: 1 };

let remindCache: ReminderMinutes | null = null;
const remindSubs = new Set<() => void>();

/** 最近一次课表(内存): 修改提前分钟数后立即重排, 不用等下次打开课表 */
let lastTimetable: Timetable | null = null;
let rescheduleTimer: ReturnType<typeof setTimeout> | null = null;

function clampMin(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(30, Math.max(0, n)) : 0;
}

export function subscribeReminderMinutes(fn: () => void): () => void {
  remindSubs.add(fn);
  return () => remindSubs.delete(fn);
}

/** 当前提醒提前分钟数(内存缓存) */
export async function getReminderMinutes(): Promise<ReminderMinutes> {
  if (remindCache) return remindCache;
  try {
    const raw = await AsyncStorage.getItem(REMIND_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<ReminderMinutes>;
      remindCache = { start: clampMin(j.start), end: clampMin(j.end) };
      return remindCache;
    }
  } catch {
    // 读失败用默认
  }
  remindCache = { ...DEFAULT_REMINDER_MINUTES };
  return remindCache;
}

/** 修改提醒提前分钟数; 返回应用后的值 */
export async function setReminderMinutes(v: ReminderMinutes): Promise<ReminderMinutes> {
  remindCache = { start: clampMin(v.start), end: clampMin(v.end) };
  await AsyncStorage.setItem(REMIND_KEY, JSON.stringify(remindCache)).catch(() => {});
  remindSubs.forEach((f) => f());
  // 边点边排会重复取消/排期, 合并成一次(800ms 内只排一次)
  if (rescheduleTimer) clearTimeout(rescheduleTimer);
  rescheduleTimer = setTimeout(() => {
    rescheduleTimer = null;
    if (lastTimetable) void scheduleClassReminders(lastTimetable);
  }, 800);
  return remindCache;
}

/** Expo Go Android 下 import expo-notifications 会直接抛错, 直接跳过 */
let handlerReady = false;

/** 前台收到通知时的展示策略: 不注册这个 handler, 前台通知会被系统静默丢弃
 *  (开发者选项里的"测试通知"就是因此看不到) */
function ensureForegroundHandler(Notifications: NotificationsModule): void {
  if (handlerReady || Platform.OS === 'web') return;
  handlerReady = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function loadNotifications(): NotificationsModule | null {
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (inExpoGo && Platform.OS === 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    ensureForegroundHandler(mod);
    return mod;
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

/** 通知渠道: 上课 / 下课 / 考试分开注册, 系统通知设置里可分别查看与管理 */
export const START_CHANNEL_ID = 'class-start-v3';
export const END_CHANNEL_ID = 'class-end-v1';
export const EXAM_CHANNEL_ID = 'exam-remind-v1';
export const DAILY_CHANNEL_ID = 'daily-report-v1';
export const GRADE_CHANNEL_ID = 'grade-update-v1';
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
      [EXAM_CHANNEL_ID, '考试提醒'],
      [DAILY_CHANNEL_ID, '每日早报'],
      [GRADE_CHANNEL_ID, '成绩更新'],
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

const BATTERY_ASKED_KEY = 'notif.battery-asked.v1';

/** 打开系统「忽略电池优化」授权页: 国产系统不开自启动也能按时收到提醒 */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const pkg = Constants.expoConfig?.android?.package;
    if (!pkg) return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IntentLauncher = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', {
      data: `package:${pkg}`,
    });
    return true;
  } catch {
    return false;
  }
}

/** App 启动时调用: 自动创建/修复渠道 + 权限未授权时请求一次(不弹则需用户去系统设置开) */
export async function initNotifications(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  await ensureReminderChannel();
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted) p = await Notifications.requestPermissionsAsync();
    if (!p.granted) return;
  } catch {
    return; // 权限请求失败不影响启动
  }
  // 首次拿到通知权限后询问一次: 是否关闭电池优化(替代手动开自启动)
  try {
    if (await AsyncStorage.getItem(BATTERY_ASKED_KEY)) return;
    if (!(await loadSettings())) return; // 还没设置班级, 先不打扰
    await AsyncStorage.setItem(BATTERY_ASKED_KEY, '1');
    setTimeout(() => {
      Alert.alert(
        '让提醒准时弹出',
        '小米/华为/荣耀等手机会在锁屏后限制后台, 导致上下课提醒延迟或不弹。\n\n允许本应用忽略电池优化后, 通常无需再手动打开「自启动」。',
        [
          { text: '暂不', style: 'cancel' },
          { text: '去设置', onPress: () => void requestIgnoreBatteryOptimizations() },
        ],
      );
    }, 1200);
  } catch {
    // 询问失败不影响启动
  }
}

/** App 启动时用上次课表补排提醒(用户没进课表页也能收到通知) */
export async function primeReminders(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    // 启动时权限由 initNotifications 负责申请, 这里只补排, 避免重复弹权限框
    if (!(await Notifications.getPermissionsAsync()).granted) return;
  } catch {
    return;
  }
  // 考试提醒独立于课表缓存, 有缓存就先补排
  try {
    const exams = lastExams.length ? lastExams : await getCachedExams();
    if (exams.length) await scheduleExamReminders(exams);
    await scheduleDailyReport();
  } catch {
    // 补排失败不影响启动
  }
  if (lastTimetable) {
    await scheduleClassReminders(lastTimetable);
    return;
  }
  try {
    await primeScheduleTimes();
    if (!(await loadSettings())) return;
    const cached = await loadTimetableCache();
    // 跨周的旧课表不排, 避免按上周课程发错误提醒
    if (!cached || cached.weekKey !== weekKeyOf(beijingNow())) return;
    await scheduleClassReminders(cached.tt);
  } catch {
    // 提醒是增强功能, 失败静默
  }
}

/** 开发者选项: 发一条测试通知(seconds 秒后), 返回结果供界面提示 */
export async function scheduleTestNotification(
  seconds = 1,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const Notifications = loadNotifications();
  if (!Notifications) return { ok: false, error: '当前环境不支持本地通知(Expo Go)' };
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted) p = await Notifications.requestPermissionsAsync();
    if (!p.granted) return { ok: false, error: '系统未授予通知权限, 请到系统设置打开' };
    await ensureReminderChannel();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '测试通知',
        body: `开发者调试通知 · ${new Date().toLocaleTimeString('zh-CN')}`,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: Platform.OS === 'android' ? START_CHANNEL_ID : undefined,
      },
    });
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- 考试提醒: 考前 1 天 20:00 / 考试当天 07:30(设置页可开关) ----------

const EXAM_ENABLED_KEY = 'exam.remind.enabled.v1';
const EXAM_PREFIX = 'exam:';
let examEnabledCache: boolean | null = null;
const examSubs = new Set<() => void>();
/** 最近一次拿到的考试列表, 用于开关切换后立即重排 */
let lastExams: ExamInfo[] = [];

export function subscribeExamReminders(fn: () => void): () => void {
  examSubs.add(fn);
  return () => examSubs.delete(fn);
}

/** 考试提醒是否开启(默认开启) */
export async function getExamRemindersEnabled(): Promise<boolean> {
  if (examEnabledCache !== null) return examEnabledCache;
  try {
    const raw = await AsyncStorage.getItem(EXAM_ENABLED_KEY);
    examEnabledCache = raw !== '0';
  } catch {
    examEnabledCache = true;
  }
  return examEnabledCache;
}

export async function setExamRemindersEnabled(on: boolean): Promise<void> {
  examEnabledCache = on;
  await AsyncStorage.setItem(EXAM_ENABLED_KEY, on ? '1' : '0').catch(() => {});
  examSubs.forEach((f) => f());
  if (!on) {
    await cancelExamReminders();
    return;
  }
  const exams = lastExams.length ? lastExams : await getCachedExams();
  await scheduleExamReminders(exams);
}

/** 只取消考试提醒(identifier 前缀区分), 不影响上下课提醒 */
async function cancelExamReminders(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => n.identifier.startsWith(EXAM_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // 取消失败不影响主流程
  }
}

/** 按考试列表重排提醒: 考前 1 天 20:00、考试当天 07:30, 只排未来时间 */
export async function scheduleExamReminders(exams: ExamInfo[]): Promise<void> {
  lastExams = exams ?? [];
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    if (!(await getExamRemindersEnabled())) {
      await cancelExamReminders();
      return;
    }
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return; // 权限由 initNotifications 负责申请
    await ensureReminderChannel();
    await cancelExamReminders();
    const now = Date.now();
    for (const e of lastExams) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.date ?? '');
      if (!m) continue;
      const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const label = e.course || e.name || '考试';
      const place = e.room ? `考场：${e.room}` : '';
      const slots: Array<[string, Date, string, string]> = [
        [
          'pre',
          new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 20, 0, 0, 0),
          `明天考试：${label}`,
          [place, '记得带好证件和文具，早点休息'].filter(Boolean).join('\n'),
        ],
        [
          'day',
          new Date(day.getFullYear(), day.getMonth(), day.getDate(), 7, 30, 0, 0),
          `今天考试：${label}`,
          [place, '出门前确认考场，加油'].filter(Boolean).join('\n'),
        ],
      ];
      for (const [key, at, title, body] of slots) {
        if (at.getTime() <= now) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: `${EXAM_PREFIX}${e.date}:${key}`,
          content: { title, body, sound: 'default' },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at,
            channelId: Platform.OS === 'android' ? EXAM_CHANNEL_ID : undefined,
          },
        });
      }
    }
  } catch {
    // 提醒是增强功能, 失败静默
  }
}

// ---------- 每日早报: 每天 07:00 一条(天气 + 第一节 + 当天考试) ----------

const DAILY_ENABLED_KEY = 'daily.report.enabled.v1';
const DAILY_PREFIX = 'daily:';
const DAILY_PERIODS = ['1-2', '3-4', '5-6', '7-8', '9-10'];
const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
let dailyEnabledCache: boolean | null = null;
const dailySubs = new Set<() => void>();

export function subscribeDailyReport(fn: () => void): () => void {
  dailySubs.add(fn);
  return () => dailySubs.delete(fn);
}

/** 每日早报是否开启(默认开启) */
export async function getDailyReportEnabled(): Promise<boolean> {
  if (dailyEnabledCache !== null) return dailyEnabledCache;
  try {
    const raw = await AsyncStorage.getItem(DAILY_ENABLED_KEY);
    dailyEnabledCache = raw !== '0';
  } catch {
    dailyEnabledCache = true;
  }
  return dailyEnabledCache;
}

export async function setDailyReportEnabled(on: boolean): Promise<void> {
  dailyEnabledCache = on;
  await AsyncStorage.setItem(DAILY_ENABLED_KEY, on ? '1' : '0').catch(() => {});
  dailySubs.forEach((f) => f());
  if (on) await scheduleDailyReport();
  else await cancelDailyReport();
}

async function cancelDailyReport(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => n.identifier.startsWith(DAILY_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // 取消失败不影响主流程
  }
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 某天第一节课(按节次顺序找第一个有课的) */
function firstCourseOf(
  tt: Timetable,
  times: Record<string, [string, string]>,
  col: number,
): { period: string; start: string; name: string; location: string } | null {
  for (const period of DAILY_PERIODS) {
    const t = times[period];
    const row = tt.rows.find((r) => r.period === period);
    const course = row?.days[col]?.find((c) => !!c.name);
    if (!t || !course) continue;
    return { period, start: t[0], name: course.name, location: course.location };
  }
  return null;
}

/** 重排未来 7 天的早报: 每天 07:00, 内容基于本地缓存(课表/考试/当天天气) */
export async function scheduleDailyReport(): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    if (!(await getDailyReportEnabled())) {
      await cancelDailyReport();
      return;
    }
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    if (!(await loadSettings())) return;
    await ensureReminderChannel();
    await cancelDailyReport();
    await primeScheduleTimes();

    const times = getPeriodTimes();
    const cached = await loadTimetableCache();
    const exams = lastExams.length ? lastExams : await getCachedExams();
    const wx = await getCachedWeather();
    const now = beijingNow();
    const todayKey = ymdOf(now);

    for (let i = 0; i < 7; i++) {
      const day = new Date(now);
      day.setDate(now.getDate() + i);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 7, 0, 0, 0);
      if (at.getTime() <= now.getTime()) continue; // 今天 7 点已过就跳过

      const key = ymdOf(day);
      const col = (day.getDay() + 6) % 7;
      const currentWeek = !!cached && cached.weekKey === weekKeyOf(day);
      const first = cached && currentWeek ? firstCourseOf(cached.tt, times, col) : null;
      const exam = exams.find((e) => e.date === key);

      const lines: string[] = [];
      if (wx && key === todayKey) lines.push(`${wx.city} ${wx.temp}° ${wx.desc}`);
      if (first) {
        lines.push(
          `第 ${first.period} 节 ${first.start} ${first.name}${first.location ? ` · ${first.location}` : ''}`,
        );
      } else if (currentWeek) {
        lines.push('今天没有课，好好休息');
      }
      if (exam) {
        lines.push(`今天有考试：${exam.course || exam.name}${exam.room ? ` · ${exam.room}` : ''}`);
      }
      if (!lines.length) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: `${DAILY_PREFIX}${key}`,
        content: {
          title: `今日早报 · ${day.getMonth() + 1}月${day.getDate()}日 ${WEEK_NAMES[day.getDay()]}`,
          body: lines.join('\n'),
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          channelId: Platform.OS === 'android' ? DAILY_CHANNEL_ID : undefined,
        },
      });
    }
  } catch {
    // 早报是增强功能, 失败静默
  }
}

// ---------- 成绩更新提醒: 检测到新增成绩时通知一次 ----------

const GRADES_SEEN_KEY = 'grades.seen-count.v1';
let gradeCheckAt = 0;

export async function checkGradeUpdates(): Promise<void> {
  if (Date.now() - gradeCheckAt < 10 * 60_000) return; // 10 分钟内只查一次
  gradeCheckAt = Date.now();
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const { stat } = await getGradesStat();
    if (!stat) return;
    const raw = await AsyncStorage.getItem(GRADES_SEEN_KEY);
    const seen = Number(raw);
    if (raw !== null && Number.isFinite(seen) && stat.count > seen) {
      const n = stat.count - seen;
      const latest = stat.terms[stat.terms.length - 1];
      await ensureReminderChannel();
      await Notifications.scheduleNotificationAsync({
        identifier: `grade:${Date.now()}`,
        content: {
          title: `新增 ${n} 门成绩`,
          body: latest ? `最新学期：${latest.term}\n点开查看成绩与绩点` : '点开查看最新成绩与绩点',
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(Date.now() + 1000),
          channelId: Platform.OS === 'android' ? GRADE_CHANNEL_ID : undefined,
        },
      });
    }
    await AsyncStorage.setItem(GRADES_SEEN_KEY, String(stat.count));
  } catch {
    // 成绩提醒是增强功能, 失败静默
  }
}

let silentRefreshAt = 0;
let silentRefreshing = false;

/** App 从后台回到前台时静默拉一次最新课表并重排提醒(临时调课/换教室能及时生效)
 *  60 秒内多次切换只刷一次; 失败静默, 不打扰用户 */
export async function refreshTimetableAndRemind(): Promise<void> {
  if (silentRefreshing) return;
  if (Date.now() - silentRefreshAt < 60_000) return;
  silentRefreshAt = Date.now();
  silentRefreshing = true;
  try {
    const s = await loadSettings();
    if (!s) return;
    const now = beijingNow();
    const tt = await fetchTimetable(s.xb, s.zy, s.bj, s.queryType, now);
    if (!tt.rows.length) return;
    await saveTimetableCache(tt, weekKeyOf(now));
    await scheduleClassReminders(tt);
    void refreshWidgets();
  } catch {
    // 静默刷新失败不影响后续使用
  } finally {
    silentRefreshing = false;
  }
}

/** 用课表重新排期未来 7 天的提醒: 上课前/下课前 N 分钟(设置页可调, 默认 5/1, 先清掉旧的) */
export async function scheduleClassReminders(timetable: Timetable) {
  try {
    if (!timetable?.rows?.length) return;
    lastTimetable = timetable;
    const Notifications = loadNotifications();
    if (!Notifications) return; // Expo Go Android: 通知不可用, 静默跳过

    const { start: leadStart, end: leadEnd } = await getReminderMinutes();

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

        // 上课前 N 分钟: 提醒下节是什么课、几点上课
        const startAt = atMinutes(day, startMin - leadStart);
        if (startMin - leadStart >= 0 && startAt.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${leadStart > 0 ? `${leadStart}分钟后上课` : '上课时间到了'}：${course.name}`,
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

        // 下课前 N 分钟
        const endAt = atMinutes(day, endMin - leadEnd);
        if (endMin - leadEnd >= 0 && endAt.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${leadEnd > 0 ? `${leadEnd}分钟后下课` : '下课时间到了'}：${course.name}`,
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

    // 上面 cancelAll 会连考试提醒/早报一起清掉, 这里重新补排
    try {
      const exams = lastExams.length ? lastExams : await getCachedExams();
      if (exams.length) await scheduleExamReminders(exams);
      await scheduleDailyReport();
    } catch {
      // 补排失败不影响上下课提醒
    }
  } catch {
    // 通知是增强功能, 失败静默(如 Expo Go 新版不支持)
  }
}
