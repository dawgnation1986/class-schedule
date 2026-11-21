/**
 * 课表导出到系统日历
 * 把当前课表(一门课 = 一个"周几 + 大节")生成为 .ics(iCalendar) 文件:
 * 从今天起最近的一次上课日开始, 每周重复 N 周, 含课程名 / 教室 / 教师 / 节次。
 * 通过系统分享面板交给日历 App 导入(纯本地, 不联网)。
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Timetable } from './timetable';
import { getPeriodTimes, type PeriodTimes } from './schedule-times';

/** 导出后覆盖的周数 */
export const CALENDAR_WEEKS = 16;

const DAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** 本地时间(浮动时间) "YYYYMMDDTHHmmss" */
function localDateTime(d: Date, hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return `${ymd(d)}T${pad2(h)}${pad2(m)}00`;
}

/** ICS 文本转义: 反斜杠 / 分号 / 逗号 / 换行 */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** 字符的 UTF-8 字节数(中文 3 字节) */
function byteLen(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
}

/** RFC 5545: 单行不超过 75 字节, 超出部分换行并以空格续行 */
function foldLine(line: string): string {
  const MAX = 72; // 留出余量
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = MAX;
  for (const ch of line) {
    const b = byteLen(ch);
    if (bytes + b > limit) {
      out.push(out.length === 0 ? cur : ` ${cur}`);
      cur = '';
      bytes = 0;
      limit = MAX - 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(out.length === 0 ? cur : ` ${cur}`);
  return out.join('\r\n');
}

/**
 * 生成课表 ICS 文本
 * @param timetable 课表(rows[].days[0..6] 对应周一~周日)
 * @param times 生效的大节时间(默认读取当前作息)
 * @param weeks 重复周数(默认 16)
 * @param now 基准日期(默认今天)
 */
export function buildTimetableIcs(
  timetable: Timetable,
  times: PeriodTimes = getPeriodTimes(),
  weeks: number = CALENDAR_WEEKS,
  now: Date = new Date(),
): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayCol = (today.getDay() + 6) % 7; // 0=周一
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClassSchedule//Timetable Export//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:课程表',
    'X-WR-TIMEZONE:Asia/Shanghai',
  ];

  let seq = 0;
  for (const row of timetable.rows) {
    const span = times[row.period];
    if (!span || row.period === '中午') continue; // 午休等不上课的时段跳过
    for (let day = 0; day < 7; day++) {
      const course = row.days[day]?.find((c) => !!c.name);
      if (!course) continue;

      // 第一次上课日: 从今天起最近的那个星期几(今天有课则算今天)
      const first = new Date(today);
      first.setDate(today.getDate() + ((day - todayCol + 7) % 7));
      // 今天的课已经开始或结束, 就从下周同一天开始, 避免往日历里塞已经过去的日程
      const [sh, sm] = span[0].split(':').map(Number);
      if (first.getTime() === today.getTime() && sh * 60 + sm <= now.getHours() * 60 + now.getMinutes()) {
        first.setDate(first.getDate() + 7);
      }

      const desc = [
        `${row.period} 节`,
        course.teacher ? `教师：${course.teacher}` : '',
        course.weeks ? `周次：${course.weeks}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      lines.push(
        'BEGIN:VEVENT',
        `UID:course-${ymd(first)}-${day}-${row.period}-${seq++}@classhoke`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${localDateTime(first, span[0])}`,
        `DTEND:${localDateTime(first, span[1])}`,
        `RRULE:FREQ=WEEKLY;COUNT=${weeks};BYDAY=${DAY_CODES[day]}`,
        `SUMMARY:${escapeText(course.name)}`,
        course.location ? `LOCATION:${escapeText(course.location)}` : '',
        `DESCRIPTION:${escapeText(desc)}`,
        'TRANSP:OPAQUE',
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  return `${lines.filter(Boolean).map(foldLine).join('\r\n')}\r\n`;
}

export type CalendarExportResult =
  | { ok: true; events: number }
  | { ok: false; error: string };

/** 生成课表 .ics 并调起系统分享面板 */
export async function exportTimetableToCalendar(timetable: Timetable): Promise<CalendarExportResult> {
  if (Platform.OS === 'web') return { ok: false, error: '请在手机 App 内导出日历' };

  const ics = buildTimetableIcs(timetable);
  const events = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
  if (events === 0) return { ok: false, error: '当前课表没有可导出的课程' };

  try {
    const uri = `${FileSystem.cacheDirectory}课程表-${ymd(new Date())}.ics`;
    await FileSystem.writeAsStringAsync(uri, ics, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!(await Sharing.isAvailableAsync())) return { ok: false, error: '当前设备不支持分享' };
    await Sharing.shareAsync(uri, {
      mimeType: 'text/calendar',
      UTI: 'com.apple.ical.ics',
      dialogTitle: '导入到系统日历',
    });
    return { ok: true, events };
  } catch {
    return { ok: false, error: '导出失败，请重试' };
  }
}
