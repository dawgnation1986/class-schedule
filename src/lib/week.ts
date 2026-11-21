/** 学期周次推算工具: 经典/新版课表底部周次条共用 */

/** 该日期所在周的周一(00:00) */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/**
 * 学期周次: 秋季学期以 9 月 1 日前的周一为第 1 周, 春季以 3 月 1 日前的周一为第 1 周。
 * 与校历基本对齐, 仅用于周次条展示。
 */
export function semesterWeekNo(d: Date): number {
  const mon = mondayOf(d);
  const y = mon.getFullYear();
  const m = mon.getMonth(); // 0-based
  const spring = m >= 1 && m <= 6; // 2~7 月
  const anchor = spring ? new Date(y, 2, 1) : new Date(y, 8, 1);
  if (!spring && m === 0) anchor.setFullYear(y - 1); // 1 月属于上一年秋季学期
  const start = mondayOf(anchor);
  const weeks = Math.floor((mon.getTime() - start.getTime()) / (7 * 86400000)) + 1;
  return Math.max(1, weeks);
}

/** 周次范围文本: 11/23 - 11/29 */
export function weekRangeText(d: Date): string {
  const mon = mondayOf(d);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  return `${mon.getMonth() + 1}/${mon.getDate()} - ${sun.getMonth() + 1}/${sun.getDate()}`;
}
