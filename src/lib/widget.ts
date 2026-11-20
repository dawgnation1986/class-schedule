/**
 * Android 桌面小组件: 任务注册 + 主动刷新
 *
 * 原生模块只在带小组件的原生包里存在(Expo Go 没有), 所以库和 UI 都延迟 require,
 * 保证 Expo Go / Web 下调用本文件不会崩。
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { beijingNow, fetchTimetable, type Timetable } from './timetable';
import { loadSettings, loadTimetableCache, saveTimetableCache, weekKeyOf } from './settings';
import { getPeriodTimes, primeScheduleTimes, subscribeTimes } from './schedule-times';
import { buildWidgetView, dayLabels, type WidgetView } from './widget-data';

export const WIDGET_NAME = 'ClassScheduleWidget';

/** 小组件自行拉取课表的节流(2 小时): 课表按周变化, 没必要每 30 分钟都打学校接口 */
const SYNC_KEY = 'widget.synced-at.v1';
const SYNC_INTERVAL = 2 * 60 * 60 * 1000;
/** Headless JS 任务总时限 30 秒, 网络请求最多等 18 秒 */
const FETCH_TIMEOUT = 18_000;

type WidgetLib = typeof import('react-native-android-widget');
type WidgetUI = typeof import('../widgets/class-schedule-widget');

let widgetLib: WidgetLib | null = null;
let widgetLibLoaded = false;

function loadLib(): WidgetLib | null {
  if (widgetLibLoaded) return widgetLib;
  widgetLibLoaded = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    widgetLib = require('react-native-android-widget') as WidgetLib;
  } catch {
    widgetLib = null; // Expo Go: 原生模块不存在
  }
  return widgetLib;
}

function loadUI(): WidgetUI {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../widgets/class-schedule-widget') as WidgetUI;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** 从缓存组装小组件数据(缓存跨周视为过期) */
async function loadView(): Promise<{ view: WidgetView; currentWeek: boolean }> {
  await primeScheduleTimes();
  const now = beijingNow();
  const labels = dayLabels(now);
  const settings = await loadSettings();
  if (!settings) {
    return { view: { kind: 'unconfigured', ...labels }, currentWeek: false };
  }
  const cached = await loadTimetableCache();
  if (cached && cached.weekKey === weekKeyOf(now)) {
    return { view: buildWidgetView(cached.tt, getPeriodTimes(), now), currentWeek: true };
  }
  return { view: { kind: 'stale', ...labels }, currentWeek: false };
}

/** 需要时重新拉本周实时课表(失败静默, 保留缓存) */
async function fetchFresh(hasCurrentWeek: boolean): Promise<Timetable | null> {
  if (hasCurrentWeek) {
    const last = Number(await AsyncStorage.getItem(SYNC_KEY).catch(() => null)) || 0;
    if (Date.now() - last < SYNC_INTERVAL) return null;
  }
  const s = await loadSettings().catch(() => null);
  if (!s) return null;
  const now = beijingNow();
  try {
    const tt = await withTimeout(fetchTimetable(s.xb, s.zy, s.bj, 'realtime', now), FETCH_TIMEOUT);
    if (!tt?.rows?.length) return null;
    await saveTimetableCache(tt, weekKeyOf(now));
    await AsyncStorage.setItem(SYNC_KEY, String(Date.now())).catch(() => {});
    return tt;
  } catch {
    return null;
  }
}

/** 在 App 入口(index.js)调用: 注册小组件 Headless JS 任务 */
export function registerClassScheduleWidget(): void {
  if (Platform.OS !== 'android') return;
  const lib = loadLib();
  if (!lib) return;
  const ui = loadUI();

  // 作息时间表变化(自定义/季节切换)后立即刷新小组件的上课时间
  subscribeTimes(() => {
    void refreshWidgets();
  });

  lib.registerWidgetTaskHandler(async ({ widgetInfo, widgetAction, renderWidget }) => {
    if (widgetAction === 'WIDGET_DELETED') return;
    let view: WidgetView = { kind: 'stale', ...dayLabels(beijingNow()) };
    let currentWeek = false;
    try {
      const loaded = await loadView();
      view = loaded.view;
      currentWeek = loaded.currentWeek;
    } catch {
      // 读缓存失败: 先按待更新展示, 下面仍会尝试拉取
    }
    renderWidget(ui.buildClassScheduleWidgets(view, widgetInfo.height));

    if (view.kind === 'unconfigured') return;
    const tt = await fetchFresh(currentWeek);
    if (!tt) return;
    const fresh = buildWidgetView(tt, getPeriodTimes(), beijingNow());
    renderWidget(ui.buildClassScheduleWidgets(fresh, widgetInfo.height));
  });
}

/** 课表/作息/班级设置变化后调用: 立即刷新桌面上的小组件 */
export async function refreshWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const lib = loadLib();
  if (!lib) return;
  try {
    const ui = loadUI();
    const { view } = await loadView();
    await lib.requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: (info) => ui.buildClassScheduleWidgets(view, info.height),
    });
  } catch {
    // 小组件是增强功能, 失败静默
  }
}

export type PinWidgetResult = 'ok' | 'unsupported' | 'unavailable';

/**
 * App 内「添加到桌面」入口: 系统/桌面支持时弹原生添加确认。
 * ok = 已弹出确认框; unsupported = 桌面不支持一键添加, 需手动长按桌面添加;
 * unavailable = 当前环境没有小组件原生模块(如 Expo Go)。
 */
export async function pinWidget(): Promise<PinWidgetResult> {
  if (Platform.OS !== 'android') return 'unavailable';
  const lib = loadLib();
  if (!lib) return 'unavailable';
  try {
    return (await lib.requestPinWidget({ widgetName: WIDGET_NAME })) ? 'ok' : 'unsupported';
  } catch {
    return 'unsupported';
  }
}
