/**
 * 课表截图 OCR: 把带坐标的文字行还原成课程表
 *
 * 思路:
 *  1. OCR 返回每行文字 + 外框, 先按 y 聚成"视觉行";
 *  2. 找到含"星期一~星期日"的表头, 用文字中心 x 拟合 7 列;
 *  3. 找到左侧"1-2 / 3-4 / 中午…"节次标签, 得到行的中心 y;
 *  4. 其余文字按最近的列/行归入单元格, 单元格内再拆课程;
 *  5. 没有表头坐标时退化为按"含周次的行"逐条识别, 由用户手动选星期/节次。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { OcrLine } from './captcha-ocr';
import { parseWeeks, type CourseEntry, type Timetable, type TimetableRow } from './timetable';

export const OCR_PERIODS = ['1-2', '3-4', '中午', '5-6', '7-8', '9-10'];

const DAY_CHARS = ['一', '二', '三', '四', '五', '六', '日'];

/** 识别结果(可编辑) */
export type OcrCourse = {
  id: string;
  name: string;
  location: string;
  teacher: string;
  weeks: string;
  /** 0=周一 … 6=周日; null=未识别 */
  day: number | null;
  /** 1-2 / 3-4 / 中午 / 5-6 / 7-8 / 9-10; null=未识别 */
  period: string | null;
};

function clean(s: string): string {
  return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function centerOf(l: OcrLine): { cx: number; cy: number } {
  return { cx: l.x + l.w / 2, cy: l.y + l.h / 2 };
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

/** 按 y 把文字行聚成视觉行 */
function groupVisualRows(lines: OcrLine[]): OcrLine[][] {
  const h = median(lines.map((l) => l.h).filter((v) => v > 0)) || 20;
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const groups: OcrLine[][] = [];
  for (const l of sorted) {
    const cy = centerOf(l).cy;
    const g = groups[groups.length - 1];
    if (g) {
      const gy = g.reduce((sum, x) => sum + centerOf(x).cy, 0) / g.length;
      if (Math.abs(cy - gy) < h * 0.65) {
        g.push(l);
        continue;
      }
    }
    groups.push([l]);
  }
  return groups;
}

function dayOf(text: string): number | null {
  const m = text.match(/(?:星期|周)\s*([一二三四五六日天])/);
  if (!m) return null;
  const c = m[1] === '天' ? '日' : m[1];
  return DAY_CHARS.indexOf(c);
}

/** 节次标签 → 大节名 */
function periodOfText(text: string): string | null {
  const s = text.replace(/\s+/g, '');
  if (/中午|午休/.test(s)) return '中午';
  const m = s.match(/^第?(\d{1,2})(?:[-~—－](\d{1,2}))?节?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a + 1;
  const key = `${a}-${b}`;
  return OCR_PERIODS.includes(key) ? key : null;
}

/** 用最小二乘拟合"星期序号 → x 中心"的直线 */
function fitDayCenters(points: { day: number; x: number }[]): number[] | null {
  if (points.length < 4) return null;
  const n = points.length;
  const sumD = points.reduce((a, p) => a + p.day, 0);
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumDD = points.reduce((a, p) => a + p.day * p.day, 0);
  const sumDX = points.reduce((a, p) => a + p.day * p.x, 0);
  const den = n * sumDD - sumD * sumD;
  if (!den) return null;
  const b = (n * sumDX - sumD * sumX) / den;
  const a = (sumX - b * sumD) / n;
  if (!Number.isFinite(b) || Math.abs(b) < 10) return null;
  return Array.from({ length: 7 }, (_, i) => a + b * i);
}

const WEEK_RE =
  /第?\s*\d{1,2}\s*[-~—－～]\s*\d{1,2}\s*(?:单|双)?\s*周|第?\s*\d{1,2}\s*(?:单|双)?\s*周/;

const ROOM_RE = /[楼室馆场房厅]|机房|实验|实训|操场|基地|[A-Za-z]?\d{1,3}[-－—]?\d{0,3}/;

function isTeacher(s: string): boolean {
  return /^[\u4e00-\u9fa5·]{2,4}$/.test(s) && !ROOM_RE.test(s);
}

/** 把一个单元格的文字拆成若干门课: 每个"周次"行结束一门课 */
function splitCell(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map(clean)
    .flatMap((l) => l.split(/[;；]/))
    .map(clean)
    .filter(Boolean);
  if (!lines.length) return [];

  const chunks: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    cur.push(line);
    if (WEEK_RE.test(line)) {
      chunks.push(cur.join('\n'));
      cur = [];
    }
  }
  if (cur.length) {
    if (chunks.length) chunks[chunks.length - 1] += `\n${cur.join('\n')}`;
    else chunks.push(cur.join('\n'));
  }
  return chunks;
}

function parseCourse(chunk: string, day: number | null, period: string | null): OcrCourse | null {
  const weeksM = chunk.match(WEEK_RE);
  const weeks = weeksM ? weeksM[0].replace(/^第/, '').replace(/\s+/g, '').replace(/～/g, '-') : '';
  let rest = weeksM ? chunk.replace(weeksM[0], ' ') : chunk;
  rest = rest
    .replace(/[（(]?(?:教师|老师|任课教师|授课教师)[)）]?\s*[:：]?/g, ' ')
    .replace(/[（(]?(?:教室|地点|上课地点|场地|实验场所)[)）]?\s*[:：]?/g, ' ')
    .replace(/[（(]?\s*周次\s*[)）]?\s*[:：]?/g, ' ');

  let tokens = rest
    .split(/[\n,，、|]+/)
    .map(clean)
    .filter(Boolean);

  // 一行里用空格分隔的情况: "高等数学 张三 1-201"
  if (tokens.length === 1) {
    const bySpace = tokens[0].split(/\s+/).map(clean).filter(Boolean);
    if (bySpace.length >= 2) tokens = bySpace;
  }

  const name = (tokens[0] ?? '')
    .replace(/^[（(]?\d{1,3}[)）]?[.、]?\s*/, '')
    .replace(/^[（(]\s*[)）]/, '')
    .trim();
  if (!name || /^\d+$/.test(name) || (/周/.test(name) && name.length <= 4)) return null;

  const restTokens = tokens.slice(1);
  const location =
    restTokens.find((t) => ROOM_RE.test(t) && !isTeacher(t)) ??
    (restTokens.length > 1 && !isTeacher(restTokens[0]) ? restTokens[0] : '');
  const teacher =
    restTokens.find((t) => t !== location && isTeacher(t)) ??
    (restTokens.length > 1 && restTokens[1] !== location ? restTokens[1] : '');

  return {
    id: `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    location,
    teacher,
    weeks,
    day,
    period,
  };
}

/** 无版面信息时的兜底: 只识别含周次的文字行 */
function parseTextOnly(lines: OcrLine[]): OcrCourse[] {
  const out: OcrCourse[] = [];
  for (const l of lines) {
    const t = clean(l.text);
    if (!t || !WEEK_RE.test(t)) continue;
    const c = parseCourse(t, null, null);
    if (c) out.push(c);
  }
  return out;
}

/** 主入口: OCR 文字行 → 可编辑课程列表 */
export function parseOcrCourses(lines: OcrLine[]): OcrCourse[] {
  const rows = lines
    .map((l) => ({ ...l, text: clean(l.text) }))
    .filter((l) => l.text);

  const groups = groupVisualRows(rows);

  // 表头: 同一视觉行里出现至少 5 个不同的星期
  let headerGroup: OcrLine[] | null = null;
  for (const g of groups) {
    const days = new Set<number>();
    for (const l of g) {
      const d = dayOf(l.text);
      if (d != null) days.add(d);
    }
    if (days.size >= 5) {
      headerGroup = g;
      break;
    }
  }

  // 兜底: 星期标签被拆成多个视觉行, 但 y 基本对齐
  if (!headerGroup) {
    const dayLines = rows.filter((l) => dayOf(l.text) != null);
    if (dayLines.length >= 5) {
      const hh = median(dayLines.map((l) => l.h).filter((v) => v > 0)) || 20;
      const ys = dayLines.map((l) => centerOf(l).cy);
      if (Math.max(...ys) - Math.min(...ys) <= hh * 2.5) headerGroup = dayLines;
    }
  }

  const headerSet = new Set(headerGroup ?? []);
  let dayCenters: number[] | null = null;
  if (headerGroup) {
    const points: { day: number; x: number }[] = [];
    for (const l of headerGroup) {
      const d = dayOf(l.text);
      if (d != null) points.push({ day: d, x: centerOf(l).cx });
    }
    dayCenters = fitDayCenters(points);
  }

  // 左侧节次标签
  const minDayX = dayCenters ? Math.min(...dayCenters) : Infinity;
  const rowAnchors: { period: string; cy: number }[] = [];
  for (const g of groups) {
    if (headerSet.has(g[0])) continue;
    const text = g.map((l) => l.text).join('');
    const period = periodOfText(text);
    if (!period) continue;
    const cy = g.reduce((sum, l) => sum + centerOf(l).cy, 0) / g.length;
    const cx = g.reduce((sum, l) => sum + centerOf(l).cx, 0) / g.length;
    if (Number.isFinite(minDayX) && cx > minDayX - 20) continue; // 不在左侧
    rowAnchors.push({ period, cy });
  }

  if (!dayCenters || rowAnchors.length < 2) {
    return parseTextOnly(rows);
  }

  const colGap = (Math.max(...dayCenters) - Math.min(...dayCenters)) / 6;
  const rowGap =
    rowAnchors.length > 1
      ? (Math.max(...rowAnchors.map((r) => r.cy)) - Math.min(...rowAnchors.map((r) => r.cy))) /
        (rowAnchors.length - 1)
      : 80;

  const cells = new Map<string, OcrLine[]>();

  for (const l of rows) {
    if (headerSet.has(l) || !l.text.trim()) continue;
    if (periodOfText(l.text)) continue; // 左侧节次/时间
    const { cx, cy } = centerOf(l);

    let col = -1;
    let bestDx = Infinity;
    dayCenters.forEach((x, i) => {
      const dx = Math.abs(cx - x);
      if (dx < bestDx) {
        bestDx = dx;
        col = i;
      }
    });
    if (col < 0 || bestDx > colGap * 0.65) continue;

    let row = -1;
    let bestDy = Infinity;
    rowAnchors.forEach((r, i) => {
      const dy = Math.abs(cy - r.cy);
      if (dy < bestDy) {
        bestDy = dy;
        row = i;
      }
    });
    if (row < 0 || bestDy > rowGap * 0.85) continue;

    const key = `${row}|${col}`;
    const arr = cells.get(key) ?? [];
    arr.push(l);
    cells.set(key, arr);
  }

  const out: OcrCourse[] = [];
  const seen = new Set<string>();
  for (const [key, list] of cells) {
    const [r, c] = key.split('|').map(Number);
    const text = list
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((l) => l.text)
      .join('\n');
    for (const chunk of splitCell(text)) {
      const course = parseCourse(chunk, c, rowAnchors[r].period);
      if (!course) continue;
      const dedup = `${course.name}|${course.day}|${course.period}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      out.push(course);
    }
  }

  return out.length ? out : parseTextOnly(rows);
}

const PERIOD_ORDER = ['1-2', '3-4', '中午', '5-6', '7-8', '9-10'];

/** 可编辑课程列表 → 课表结构 */
export function buildTimetableFromCourses(courses: OcrCourse[]): Timetable {
  const rows: TimetableRow[] = PERIOD_ORDER.map((period, i) => ({
    index: String(i + 1),
    period,
    days: Array.from({ length: 7 }, () => [] as CourseEntry[]),
  }));

  for (const c of courses) {
    if (c.day == null || !c.period) continue;
    const row = rows.find((r) => r.period === c.period);
    if (!row || c.day < 0 || c.day > 6) continue;
    const { startWeek, endWeek, parity } = parseWeeks(c.weeks || '1-18周');
    row.days[c.day].push({
      name: c.name.trim(),
      location: c.location.trim(),
      teacher: c.teacher.trim(),
      weeks: c.weeks.trim() || '1-18周',
      startWeek,
      endWeek,
      parity,
    });
  }

  return { rows, loading: false };
}

// ---------- 导入课表的持久化 ----------

const IMPORTED_KEY = 'timetable.imported.v1';

export type ImportedTimetable = { tt: Timetable; at: number };

export async function loadImportedTimetable(): Promise<ImportedTimetable | null> {
  try {
    const raw = await AsyncStorage.getItem(IMPORTED_KEY);
    if (!raw) return null;
    const e = JSON.parse(raw) as Partial<ImportedTimetable>;
    if (!e?.tt?.rows?.length) return null;
    return { tt: e.tt, at: e.at ?? 0 };
  } catch {
    return null;
  }
}

export async function saveImportedTimetable(tt: Timetable): Promise<void> {
  await AsyncStorage.setItem(IMPORTED_KEY, JSON.stringify({ tt, at: Date.now() })).catch(() => {});
}

export async function clearImportedTimetable(): Promise<void> {
  await AsyncStorage.removeItem(IMPORTED_KEY).catch(() => {});
}
