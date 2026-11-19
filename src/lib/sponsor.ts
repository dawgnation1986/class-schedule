/**
 * 赞助信息获取: 优先官网后台下发（我的页面可配置官网地址）, 失败回退 GitHub 仓库 sponsor.json
 */
import { REPO } from '@/lib/updates';
import { getMirrors } from '@/lib/gh-mirrors';
import { fetchSiteConfig, getSiteUrl, siteAssetUrl } from '@/lib/site';

const RAW_URL = `https://raw.githubusercontent.com/${REPO}/master/sponsor/sponsor.json`;

/** 赞助网页地址: 官网 sponsor.php 优先, 拿不到官网地址时回退 GitHub 页面 */
export async function sponsorPageUrl(): Promise<string> {
  try {
    const base = await getSiteUrl();
    if (base) return `${base.replace(/\/+$/, '')}/sponsor.php`;
  } catch {
    // 落回 GitHub
  }
  return `https://github.com/${REPO}/blob/master/sponsor`;
}

export type SponsorInfo = {
  /** 收款码图片地址(完整 URL) */
  wechat?: string;
  alipay?: string;
  /** 感谢语/说明 */
  note?: string;
  updated?: string;
};

const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/master/sponsor/`;

function resolveRawImg(v: string): string {
  return /^https?:\/\//.test(v) ? v : `${RAW_BASE}${v}`;
}

/** GitHub raw 通道兜底(镜像容错, 全失败返回 null) */
async function fetchSponsorFromGitHub(): Promise<SponsorInfo | null> {
  const mirrors = await getMirrors();
  for (const m of mirrors) {
    try {
      const r = await fetch(`${m.prefix}${RAW_URL}`);
      if (!r.ok) continue;
      const j = (await r.json()) as SponsorInfo;
      if (j && typeof j === 'object') {
        return {
          ...j,
          wechat: j.wechat ? resolveRawImg(j.wechat) : undefined,
          alipay: j.alipay ? resolveRawImg(j.alipay) : undefined,
        };
      }
    } catch {
      // 试下一个镜像
    }
  }
  return null;
}

/** 拉取赞助配置: 官网优先, 官网不可用回退 GitHub */
export async function fetchSponsor(): Promise<SponsorInfo | null> {
  try {
    const cfg = await fetchSiteConfig();
    const s = cfg?.sponsor;
    if (s && (s.wechat || s.alipay)) {
      return {
        wechat: s.wechat ? await siteAssetUrl(s.wechat) : undefined,
        alipay: s.alipay ? await siteAssetUrl(s.alipay) : undefined,
        note: s.note || undefined,
        updated: s.updated || undefined,
      };
    }
  } catch {
    // 落回 GitHub 通道
  }
  return fetchSponsorFromGitHub();
}
