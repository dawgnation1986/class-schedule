/** 主站数据(需登录会话): 成绩解析/统计 与 考试安排解析, 带本地缓存 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchPortalHtml } from './portal';

const GRADES_URL = '/kccx/cj_stu_cx.aspx';
const EXAM_URL = '/pkgl/bk_stu_cx.aspx';
const GRADES_CACHE = 'school.grades.v1';
const EXAM_CACHE = 'school.exams.v1';
const TTL = 60 * 60 * 1000;

// ---------- 类型 ----------

export type GradeCourse = {
  term: string; // 学期, 如 2026上学期
  course: string;
  assess: string; // 考核形式
  regular: string; // 平时成绩
  examScore: string; // 考试成绩
  total: string; // 应期总评成绩
  level: string; // 等级
};

export type TermStat = {
  term: string;
  courses: GradeCourse[];
  /** 平均分(等级折算) */
  avg: number;
  /** 平均绩点(5 分制, 等权重估算) */
  gpa: number;
  count: number;
};

export type GradesStat = {
  terms: TermStat[]; // 按学期顺序
  overallAvg: number;
  overallGpa: number;
  count: number;
};

export type ExamInfo = {
  name: string; // 考试名称
  course: string;
  room: string; // 考场
  date: string; // YYYY-MM-DD
  daysLeft: number; // 距今天数(负数=已过)
};

// ---------- 通用 HTML 解析 ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** 提取 id 指定表格所有行的单元格文本 */
function extractGridRows(html: string, gridId: string): string[][] {
  const tableRe = new RegExp(`<table[^>]*id="${gridId}"[^>]*>([\\s\\S]*?)<\\/table>`);
  const tm = html.match(tableRe);
  if (!tm) return [];
  const rows: string[][] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(tm[1]))) {
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1]))) cells.push(stripTags(cm[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

// ---------- 成绩 ----------

/** 等级 → 折算分数 */
const LEVEL_SCORE: Record<string, number> = {
  优秀: 95,
  良好: 85,
  中等: 75,
  及格: 65,
  不及格: 40,
  缺考: 0,
};

/** 分数/等级 → 绩点(5 分制, (分数-50)/10, 60 分以下为 0) */
export function scoreToGpa(score: number): number {
  if (score < 60) return 0;
  return Math.min(5, Math.round(((score - 50) / 10) * 10) / 10);
}

/** 课程折算分(总评优先, 没有数字则按等级折算) */
export function gradeScore(c: GradeCourse): number {
  const raw = (c.total || c.level).trim();
  const num = parseFloat(raw);
  if (!Number.isNaN(num)) return num;
  return LEVEL_SCORE[raw] ?? 0;
}

/** 目标绩点 → 大致需要的平均分(仅用于展示) */
export function gpaToScore(gpa: number): number {
  return gpa * 10 + 50;
}

function parseGrades(html: string): GradesStat | null {
  const rows = extractGridRows(html, 'DataGridDept');
  if (rows.length < 2) return null;
  const courses: GradeCourse[] = [];
  for (const cells of rows.slice(1)) {
    // 列: 序号 | 学期 | 课程 | 考核形式 | 平时成绩 | 考试成绩 | 应期总评成绩 | 等级 | 备注 | 操作
    if (cells.length < 8) continue;
    const term = cells[1];
    const course = cells[2];
    if (!term || !course) continue;
    courses.push({
      term,
      course,
      assess: cells[3] ?? '',
      regular: cells[4] ?? '',
      examScore: cells[5] ?? '',
      total: cells[6] ?? '',
      level: cells[7] ?? '',
    });
  }
  if (!courses.length) return null;

  // 课程 → 折算分
  const scoreOf = (c: GradeCourse): number => gradeScore(c);

  // 分学期统计(保持页面出现顺序)
  const termOrder: string[] = [];
  for (const c of courses) if (!termOrder.includes(c.term)) termOrder.push(c.term);
  const terms: TermStat[] = termOrder.map((term) => {
    const cs = courses.filter((c) => c.term === term);
    const scores = cs.map(scoreOf);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const gpa = scores.map(scoreToGpa).reduce((a, b) => a + b, 0) / scores.length;
    return { term, courses: cs, avg: Math.round(avg * 10) / 10, gpa: Math.round(gpa * 100) / 100, count: cs.length };
  });
  const allScores = courses.map(scoreOf);
  const overallAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const overallGpa = allScores.map(scoreToGpa).reduce((a, b) => a + b, 0) / allScores.length;
  return {
    terms,
    overallAvg: Math.round(overallAvg * 10) / 10,
    overallGpa: Math.round(overallGpa * 100) / 100,
    count: courses.length,
  };
}

export async function getGradesStat(force = false): Promise<{ stat: GradesStat | null; stale: boolean }> {
  try {
    if (!force) {
      const raw = await AsyncStorage.getItem(GRADES_CACHE);
      if (raw) {
        const c = JSON.parse(raw) as { at: number; stat: GradesStat | null };
        if (c.stat && Date.now() - c.at < TTL) return { stat: c.stat, stale: false };
      }
    }
    const html = await fetchPortalHtml(GRADES_URL);
    const stat = parseGrades(html);
    if (stat) await AsyncStorage.setItem(GRADES_CACHE, JSON.stringify({ at: Date.now(), stat }));
    return { stat, stale: false };
  } catch {
    // 拉取失败 → 回退到旧缓存
    const raw = await AsyncStorage.getItem(GRADES_CACHE);
    if (raw) {
      const c = JSON.parse(raw) as { at: number; stat: GradesStat | null };
      if (c.stat) return { stat: c.stat, stale: true };
    }
    return { stat: null, stale: false };
  }
}

// ---------- 考试 ----------

function parseExams(html: string): ExamInfo[] {
  const rows = extractGridRows(html, 'DataGridDept');
  const exams: ExamInfo[] = [];
  for (const cells of rows.slice(1)) {
    // 列: 序号 | 考试名称 | 开课年度 | 课程名称 | 考场 | 考试日期 | 操作
    if (cells.length < 6) continue;
    const date = cells[5].match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (!date) continue;
    const d = new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    exams.push({
      name: cells[1] ?? '',
      course: cells[3] ?? '',
      room: cells[4] ?? '',
      date: `${date[1]}-${String(date[2]).padStart(2, '0')}-${String(date[3]).padStart(2, '0')}`,
      daysLeft: Math.round((d.getTime() - today.getTime()) / 86400000),
    });
  }
  return exams;
}

/** 只读本地缓存(不发请求): 启动时补排考试提醒用 */
export async function getCachedExams(): Promise<ExamInfo[]> {
  try {
    const raw = await AsyncStorage.getItem(EXAM_CACHE);
    return raw ? (JSON.parse(raw) as { exams: ExamInfo[] }).exams : [];
  } catch {
    return [];
  }
}

export async function getExams(force = false): Promise<ExamInfo[]> {
  try {
    if (!force) {
      const raw = await AsyncStorage.getItem(EXAM_CACHE);
      if (raw) {
        const c = JSON.parse(raw) as { at: number; exams: ExamInfo[] };
        if (Date.now() - c.at < TTL) return c.exams;
      }
    }
    const html = await fetchPortalHtml(EXAM_URL);
    const exams = parseExams(html);
    await AsyncStorage.setItem(EXAM_CACHE, JSON.stringify({ at: Date.now(), exams }));
    return exams;
  } catch {
    const raw = await AsyncStorage.getItem(EXAM_CACHE);
    return raw ? (JSON.parse(raw) as { exams: ExamInfo[] }).exams : [];
  }
}

// ---------- 学分与目标 GPA(教务页面没有学分, 由用户自己填) ----------

const CREDIT_KEY = 'school.credits.v1';
const GOAL_KEY = 'school.gpa-goal.v1';

/** 课程唯一键: 学期 + 课程名 */
export function gradeKey(c: { term: string; course: string }): string {
  return `${c.term}||${c.course}`;
}

const creditSubs = new Set<() => void>();
const goalSubs = new Set<() => void>();

export function subscribeCredits(fn: () => void): () => void {
  creditSubs.add(fn);
  return () => {
    creditSubs.delete(fn);
  };
}

export function subscribeGpaGoal(fn: () => void): () => void {
  goalSubs.add(fn);
  return () => {
    goalSubs.delete(fn);
  };
}

/** 读取全部课程学分(每次从本地存储读, 备份恢复后立即生效) */
export async function loadCredits(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const raw = await AsyncStorage.getItem(CREDIT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
  } catch {
    // 读取失败按空处理
  }
  return out;
}

/** 设置某门课的学分; 传 null / 非正数表示清除 */
export async function setCredit(key: string, credit: number | null): Promise<void> {
  const map = { ...(await loadCredits()) };
  if (credit == null || !Number.isFinite(credit) || credit <= 0) delete map[key];
  else map[key] = Math.round(credit * 100) / 100;
  await AsyncStorage.setItem(CREDIT_KEY, JSON.stringify(map)).catch(() => {});
  creditSubs.forEach((f) => f());
}

export type GpaGoal = { target: number; remainCredits: number };

export async function loadGpaGoal(): Promise<GpaGoal> {
  try {
    const raw = await AsyncStorage.getItem(GOAL_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<GpaGoal>) : {};
    return {
      target: Number.isFinite(Number(p.target)) ? Number(p.target) : 0,
      remainCredits: Number.isFinite(Number(p.remainCredits)) ? Number(p.remainCredits) : 0,
    };
  } catch {
    return { target: 0, remainCredits: 0 };
  }
}

export async function saveGpaGoal(g: GpaGoal): Promise<void> {
  const goal: GpaGoal = {
    target: Number.isFinite(g.target) && g.target > 0 ? Math.round(g.target * 100) / 100 : 0,
    remainCredits:
      Number.isFinite(g.remainCredits) && g.remainCredits > 0
        ? Math.round(g.remainCredits * 100) / 100
        : 0,
  };
  await AsyncStorage.setItem(GOAL_KEY, JSON.stringify(goal)).catch(() => {});
  goalSubs.forEach((f) => f());
}

export type WeightedGpa = {
  /** 按学分加权的绩点(没填任何学分时为 0) */
  gpa: number;
  /** 已录入学分合计 */
  credits: number;
  /** 已填学分的课程数 */
  credited: number;
  /** 课程总数 */
  total: number;
};

/** 学分加权绩点: 只统计填了学分的课程 */
export function weightedGpa(courses: GradeCourse[], credits: Record<string, number>): WeightedGpa {
  let sum = 0;
  let cr = 0;
  let credited = 0;
  for (const c of courses) {
    const credit = credits[gradeKey(c)];
    if (!credit) continue;
    sum += credit * scoreToGpa(gradeScore(c));
    cr += credit;
    credited++;
  }
  return {
    gpa: cr ? Math.round((sum / cr) * 100) / 100 : 0,
    credits: Math.round(cr * 100) / 100,
    credited,
    total: courses.length,
  };
}

/**
 * 目标 GPA 反推: 剩余课程需要达到的平均绩点。
 * 剩余学分为 0 或参数无效时返回 null。
 */
export function requiredGpa(
  target: number,
  currentGpa: number,
  doneCredits: number,
  remainCredits: number,
): number | null {
  if (!(target > 0) || !(remainCredits > 0) || !(doneCredits >= 0)) return null;
  return (target * (doneCredits + remainCredits) - currentGpa * doneCredits) / remainCredits;
}
