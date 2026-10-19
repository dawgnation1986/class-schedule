/**
 * 长沙环境保护职业技术学院 课表查询接口封装
 * 数据源: https://jwtk.cshbxy.com/jxgl/kb_bj_cs.aspx (ASP.NET WebForms 回发)
 *
 * 流程:
 *  1. GET 页面 → 系部选项 + __VIEWSTATE 等隐藏字段
 *  2. POST (__EVENTTARGET=DDL_xbmc + 全部表单字段) → 专业选项
 *  3. POST (__EVENTTARGET=DDL_zymc) → 班级选项
 *  4. POST (BtnQuery=查询本周实时课表 / Button2=查询原始课表) → 课表 HTML
 */

import { Platform } from 'react-native';

export const BASE_URL = 'https://jwtk.cshbxy.com/jxgl/kb_bj_cs.aspx';

// Web 端浏览器有 CORS 限制, 请求走 Metro 开发服务器的同源代理(metro.config.js);
// 原生端直接请求学校网站。
const REQUEST_URL =
  typeof navigator !== 'undefined' && Platform.OS === 'web'
    ? '/timetable-proxy/jxgl/kb_bj_cs.aspx'
    : BASE_URL;

export type Option = { value: string; label: string; selected: boolean };
export type HiddenFields = Record<string, string>;
export type QueryType = 'realtime' | 'original';

/** 一门课在某天某节的记录 */
export type CourseEntry = {
  name: string;
  location: string;
  teacher: string;
  weeks: string; // 原始周次描述, 如 "1-18周" / "1-18双周"
  startWeek: number;
  endWeek: number;
  parity: 'all' | 'odd' | 'even';
};

/** 课表一行(一个大节), days[0..6] 对应星期一~星期日 */
export type TimetableRow = { index: string; period: string; days: CourseEntry[][] };
export type Timetable = { rows: TimetableRow[]; loading: boolean };

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

// ---------- HTML 解析 ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractSelectOptions(html: string, name: string): Option[] {
  const selRe = new RegExp(`<select[^>]*name="${name}"[\\s\\S]*?</select>`);
  const sel = html.match(selRe);
  if (!sel) return [];
  const opts: Option[] = [];
  const optRe = /<option([^>]*)>([\s\S]*?)<\/option>/g;
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(sel[0]))) {
    const valueMatch = m[1].match(/value="([^"]*)"/);
    opts.push({
      value: valueMatch ? decodeEntities(valueMatch[1]) : '',
      label: stripTags(m[2]),
      selected: m[1].includes('selected'),
    });
  }
  return opts;
}

function extractHiddenFields(html: string): HiddenFields {
  const fields: HiddenFields = {};
  const re = /<input[^>]*type="hidden"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const name = tag.match(/name="([^"]+)"/)?.[1];
    const value = tag.match(/value="([^"]*)"/)?.[1] ?? '';
    if (name) fields[name] = value;
  }
  return fields;
}

/** 解析"周次"描述, 如 1-18周 / 1-18双周 / 10-18周 */
function parseWeeks(s: string): Pick<CourseEntry, 'startWeek' | 'endWeek' | 'parity'> {
  const m = s.match(/(\d+)\s*-\s*(\d+)\s*(单|双)?周/);
  if (m) {
    return {
      startWeek: parseInt(m[1], 10),
      endWeek: parseInt(m[2], 10),
      parity: m[3] === '单' ? 'odd' : m[3] === '双' ? 'even' : 'all',
    };
  }
  const single = s.match(/第?\s*(\d+)\s*周/);
  if (single) {
    const w = parseInt(single[1], 10);
    return { startWeek: w, endWeek: w, parity: 'all' };
  }
  return { startWeek: 1, endWeek: 30, parity: 'all' };
}

/** 解析单元格文本 → 课程列表。原文格式: "课程,教室,教师 ,1-18周;" 以分号分隔
 *  兼容缺逗号的写法, 如 "课程,教室,教师 1-18单周" */
function parseCell(text: string): CourseEntry[] {
  const clean = stripTags(text);
  if (!clean) return [];
  return clean
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const wMatch = part.match(/(\d+\s*-\s*\d+\s*(?:单|双)?周|\d+\s*(?:单|双)?周)/);
      const weeks = wMatch ? wMatch[0].replace(/\s+/g, '') : '';
      const rest = (wMatch ? part.replace(wMatch[0], '') : part)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const { startWeek, endWeek, parity } = parseWeeks(part);
      return {
        name: rest[0] ?? part,
        location: rest[1] ?? '',
        teacher: rest[2] ?? '',
        weeks,
        startWeek,
        endWeek,
        parity,
      };
    });
}

/** 从页面 HTML 中解析课表表格(包含"节次"的 table) */
export function parseTimetable(html: string): Timetable {
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html))) {
    const rows: TimetableRow[] = [];
    let isTimetable = false;
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(tm[1]))) {
      const cells: string[] = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1]))) cells.push(cm[1]);
      if (!cells.length) continue;
      const texts = cells.map(stripTags);
      if (texts.some((t) => t.includes('节次'))) {
        isTimetable = true;
        continue; // 跳过表头
      }
      if (texts.length >= 9 && /^\d+$/.test(texts[0])) {
        rows.push({
          index: texts[0],
          period: texts[1],
          days: cells.slice(2, 9).map(parseCell),
        });
      }
    }
    if (isTimetable) {
      return { rows, loading: html.includes('请稍候') && rows.every((r) => r.days.every((d) => d.length === 0)) };
    }
  }
  return { rows: [], loading: false };
}

// ---------- 请求链 ----------

/** 北京时间 (UTC+8) 的当前日期 */
export function beijingNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
}

/** 把日期转成页面上年/月/日下拉框的 value (年选项 value = 年份-2019) */
function dateSelectValues(d: Date): { yn: string; y: string; m: string; r: string } {
  const y = d.getFullYear();
  return {
    yn: String(d.getFullYear()),
    y: String(y - 2019),
    m: String(d.getMonth() + 1),
    r: String(d.getDate()),
  };
}

async function httpGet(): Promise<string> {
  const res = await fetch(BASE_URL, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`请求失败 (HTTP ${res.status})`);
  return res.text();
}

async function httpPost(body: Record<string, string>): Promise<string> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: BASE_URL,
      Origin: 'https://jwtk.cshbxy.com',
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`请求失败 (HTTP ${res.status})`);
  return res.text();
}

export type PageState = {
  hidden: HiddenFields;
  departments: Option[];
  majors: Option[];
  classes: Option[];
};

function baseForm(hidden: HiddenFields, date: Date = beijingNow()): Record<string, string> {
  const { y, m, r } = dateSelectValues(date);
  return {
    ...hidden,
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __LASTFOCUS: '',
    DDL_s_sjn: y,
    DDL_s_sjy: m,
    DDL_s_sjr: r,
  };
}

/** 第 1 步: 打开页面, 获取系部列表 */
export async function loadInitial(): Promise<PageState> {
  const html = await httpGet();
  return {
    hidden: extractHiddenFields(html),
    departments: extractSelectOptions(html, 'DDL_xbmc').filter((o) => o.value !== ''),
    majors: [],
    classes: [],
  };
}

/** 第 2 步: 选择系部 → 获取专业列表 */
export async function selectDepartment(state: PageState, xb: string): Promise<PageState> {
  const html = await httpPost({
    ...baseForm(state.hidden, beijingNow()),
    __EVENTTARGET: 'DDL_xbmc',
    DDL_xbmc: xb,
  });
  return {
    hidden: extractHiddenFields(html),
    departments: state.departments,
    majors: extractSelectOptions(html, 'DDL_zymc').filter((o) => o.value !== ''),
    classes: [],
  };
}

/** 第 3 步: 选择专业 → 获取班级列表 */
export async function selectMajor(state: PageState, xb: string, zy: string): Promise<PageState> {
  const html = await httpPost({
    ...baseForm(state.hidden, beijingNow()),
    __EVENTTARGET: 'DDL_zymc',
    DDL_xbmc: xb,
    DDL_zymc: zy,
  });
  return {
    hidden: extractHiddenFields(html),
    departments: state.departments,
    majors: state.majors,
    classes: extractSelectOptions(html, 'DDL_bjmc').filter((o) => o.value !== ''),
  };
}

/**
 * 第 4 步: 查询课表
 * @param type realtime=本周实时课表(推荐), original=原始课表
 */
export async function queryTimetable(
  state: PageState,
  xb: string,
  zy: string,
  bj: string,
  type: QueryType,
  date: Date = beijingNow(),
): Promise<Timetable> {
  const form: Record<string, string> = {
    ...baseForm(state.hidden, date),
    DDL_xbmc: xb,
    DDL_zymc: zy,
    DDL_bjmc: bj,
  };
  if (type === 'realtime') {
    form.BtnQuery = '查询本周实时课表';
  } else {
    form.Button2 = '查询原始课表';
  }
  const html = await httpPost(form);
  return parseTimetable(html);
}
