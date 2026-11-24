/** 跨页面的一次性跳转意图
 *  「我的」是 tab 页面, 用 query 参数会在 setParams 时反复触发 effect(可能白屏),
 *  因此改用模块级意图: 调用方先写入目标二级页, 再切到 /profile, 由 profile 聚焦时消费一次。 */
let pendingProfileSection: string | null = null;

export function setPendingProfileSection(section: string): void {
  pendingProfileSection = section;
}

export function takePendingProfileSection(): string | null {
  const s = pendingProfileSection;
  pendingProfileSection = null;
  return s;
}
