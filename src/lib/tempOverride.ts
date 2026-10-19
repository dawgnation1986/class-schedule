import type { Settings } from './settings';

/** 临时查看其他班级课表的覆盖设置(仅内存, 不写入"我的班级"配置) */
let override: Settings | null = null;

export function getTempOverride(): Settings | null {
  return override;
}

export function setTempOverride(s: Settings | null): void {
  override = s;
}
