/**
 * 桌面小组件数据计算(纯函数, 不依赖原生模块)
 * 小组件在 Headless JS 中运行, 只能读取 App 已缓存的课表 + 当前作息时间表。
 */

import type { Timetable } from './timetable';
import type { PeriodTimes } from './schedule-times';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const PERIOD_ORDER = ['1-2', '3-4', '5-6', '7-8', '9-10'];

export type WidgetCourse = {
  period: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  name: string;
  location: string;
};

export type WidgetExam = { name: string; daysLeft: number; date: string };
export type WidgetWeather = { city: string; temp: number; desc: string };

export type WidgetExtras = {
  /** 最近的未过期考试 */
  exam?: WidgetExam | null;
  /** 最近一次成功获取的天气(可能不是今天的, 由调用方决定是否传) */
  weather?: WidgetWeather | null;
};

export type WidgetView =
  | {
      kind: 'ok';
      weekday: string;
      dateText: string;
      courses: WidgetCourse[];
      current: WidgetCourse | null;
      next: WidgetCourse | null;
      nowMin: number;
      exam: WidgetExam | null;
      weather: WidgetWeather | null;
    }
  /** 本周还没拉到课表(缓存过期或从未查询) */
  | { kind: 'stale'; weekday: string; dateText: string }
  /** 还没设置班级 */
  | { kind: 'unconfigured'; weekday: string; dateText: string };

/** 小组件头部用的日期文案 */
export function dayLabels(now: Date): { weekday: string; dateText: string } {
  return {
    weekday: WEEKDAYS[now.getDay()],
    dateText: `${now.getMonth() + 1}月${now.getDate()}日`,
  };
}

function hmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** 倒计时文案: 45 → "还有 45 分钟"; 80 → "还有 1 小时 20 分" */
export function countdownText(minutes: number): string {
  const v = Math.max(0, Math.round(minutes));
  if (v < 1) return '即将开始';
  if (v < 60) return `还有 ${v} 分钟`;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return m ? `还有 ${h} 小时 ${m} 分` : `还有 ${h} 小时`;
}

export function buildWidgetView(
  tt: Timetable,
  times: PeriodTimes,
  now: Date,
  extras: WidgetExtras = {},
): WidgetView {
  const { weekday, dateText } = dayLabels(now);
  if (!tt?.rows?.length) return { kind: 'stale', weekday, dateText };

  const col = (now.getDay() + 6) % 7; // 0..6 = 星期一~星期日
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const courses: WidgetCourse[] = tt.rows
    .flatMap((row) => {
      const t = times[row.period];
      if (!t) return [];
      return (row.days[col] ?? [])
        .filter((c) => !!c.name)
        .map((c) => ({
          period: row.period,
          start: t[0],
          end: t[1],
          startMin: hmToMin(t[0]),
          endMin: hmToMin(t[1]),
          name: c.name,
          location: c.location,
        }));
    })
    .sort((a, b) => {
      const ia = PERIOD_ORDER.indexOf(a.period);
      const ib = PERIOD_ORDER.indexOf(b.period);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.startMin - b.startMin;
    });

  const current = courses.find((c) => nowMin >= c.startMin && nowMin < c.endMin) ?? null;
  const next = courses.find((c) => c.startMin > nowMin) ?? null;

  return {
    kind: 'ok',
    weekday,
    dateText,
    courses,
    current,
    next,
    nowMin,
    exam: extras.exam ?? null,
    weather: extras.weather ?? null,
  };
}

/** 按日期(YYYY-MM-DD)从考试列表里取最近的未过期考试 */
export function nearestExam(
  exams: Array<{ name: string; course: string; date: string }>,
  now: Date,
): WidgetExam | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const list = exams
    .map((e) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.date ?? '');
      if (!m) return null;
      const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
      const daysLeft = Math.round((at - today) / 86400000);
      return daysLeft >= 0 ? { name: e.course || e.name || '考试', date: e.date, daysLeft } : null;
    })
    .filter((e): e is WidgetExam => !!e)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  return list[0] ?? null;
}
