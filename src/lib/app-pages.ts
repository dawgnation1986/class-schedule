/** 各主站应用页面的专属配置(基于实际爬取的页面结构) */
export type AppKind = 'grades' | 'generic';

export type AppConfig = {
  kind: AppKind;
  /** 表格无数据时的提示语 */
  emptyText: string;
};

/** 根据页面路径识别应用类型 */
export function configFor(path: string): AppConfig {
  const p = path || '';
  if (p.includes('cj_stu_cx')) return { kind: 'grades', emptyText: '暂无成绩记录' };
  if (p.includes('pkgl/bk_stu_cx')) return { kind: 'generic', emptyText: '暂无考试安排' };
  if (p.includes('ksxt/JoinExam')) return { kind: 'generic', emptyText: '暂无在线考试' };
  if (p.includes('xsjfgl')) return { kind: 'generic', emptyText: '暂无经费发放记录' };
  if (p.includes('sxgcgl')) return { kind: 'generic', emptyText: '暂无实训作业' };
  if (p.includes('xxsj')) return { kind: 'generic', emptyText: '暂无进行中的问卷调查' };
  if (p.includes('zlgl')) return { kind: 'generic', emptyText: '暂无待填写的测评卷' };
  if (p.includes('xljk')) return { kind: 'generic', emptyText: '暂无可报名的活动' };
  if (p.includes('jlbjxgl')) return { kind: 'generic', emptyText: '暂无进行中的选课计划' };
  if (p.includes('jcgl')) return { kind: 'generic', emptyText: '暂无成长记录' };
  if (p.includes('gygl_wgtj_stu')) return { kind: 'generic', emptyText: '暂无寝室扣分记录' };
  if (p.includes('gygl_wgtj_bj')) return { kind: 'generic', emptyText: '暂无班级寝室扣分记录' };
  if (p.includes('gygl_stu')) return { kind: 'generic', emptyText: '暂无寝室分配信息' };
  return { kind: 'generic', emptyText: '暂无数据' };
}

/** 成绩等级颜色 */
export function gradeColor(level: string): string {
  if (level.includes('优') || level.includes('良好')) return '#16a34a';
  if (level.includes('及格') || level.includes('中等')) return '#d97706';
  if (level.includes('不及') || level.includes('缺考')) return '#ef4444';
  return '#2563eb';
}
