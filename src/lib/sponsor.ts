/**
 * 赞助信息获取: 从 GitHub 仓库 sponsor/sponsor.json 下发收款码配置
 * 走 gh-mirrors 镜像通道, 与 APK 下载同一套容错
 */
import { REPO } from '@/lib/updates';
import { getMirrors } from '@/lib/gh-mirrors';

const RAW_URL = `https://raw.githubusercontent.com/${REPO}/master/sponsor/sponsor.json`;
export const SPONSOR_PAGE_URL = `https://github.com/${REPO}/blob/master/sponsor`;

export type SponsorInfo = {
  /** 收款码图片地址(绝对 URL 或仓库相对路径) */
  wechat?: string;
  alipay?: string;
  /** 感谢语/说明 */
  note?: string;
  updated?: string;
};

const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/master/sponsor/`;

function resolveImg(v: string): string {
  return /^https?:\/\//.test(v) ? v : `${RAW_BASE}${v}`;
}

/** 拉取赞助配置(镜像容错, 全失败返回 null) */
export async function fetchSponsor(): Promise<SponsorInfo | null> {
  const mirrors = await getMirrors();
  for (const m of mirrors) {
    try {
      const r = await fetch(`${m.prefix}${RAW_URL}`);
      if (!r.ok) continue;
      const j = (await r.json()) as SponsorInfo;
      if (j && typeof j === 'object') {
        return {
          ...j,
          wechat: j.wechat ? resolveImg(j.wechat) : undefined,
          alipay: j.alipay ? resolveImg(j.alipay) : undefined,
        };
      }
    } catch {
      // 试下一个镜像
    }
  }
  return null;
}
