/** GitHub 下载镜像管理: 内置多镜像 + 自定义 + 持久化 + 连通性测试 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Mirror = {
  /** 标识: 直连为 'direct', 内置 'b1'.., 自定义 'c-<ts>' */
  id: string;
  /** 显示名 */
  name: string;
  /** 前缀 (直连为 ''), 下载地址 = 前缀 + 原始 URL */
  prefix: string;
  builtin: boolean;
  enabled: boolean;
};

/** 内置镜像列表 (直连放最后兜底) */
const BUILTIN: Mirror[] = [
  { id: 'b1', name: 'ghfast.top', prefix: 'https://ghfast.top/', builtin: true, enabled: true },
  { id: 'b2', name: 'gh-proxy.com', prefix: 'https://gh-proxy.com/', builtin: true, enabled: true },
  { id: 'b3', name: 'ghproxy.net', prefix: 'https://ghproxy.net/', builtin: true, enabled: true },
  { id: 'b4', name: 'gh.llkk.cc', prefix: 'https://gh.llkk.cc/', builtin: true, enabled: true },
  { id: 'b5', name: '直连 GitHub', prefix: '', builtin: true, enabled: true },
];

const KEY = 'gh-mirrors-v1';
/** 持久化: 禁用列表 + 自定义镜像 */
type Persist = { disabled: string[]; custom: string[] };

let cache: Persist | null = null;
const subs = new Set<() => void>();

async function load(): Promise<Persist> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Persist) : { disabled: [], custom: [] };
  } catch {
    cache = { disabled: [], custom: [] };
  }
  return cache;
}

async function save(p: Persist) {
  cache = p;
  await AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {});
  subs.forEach((cb) => cb());
}

/** 当前镜像列表 (自定义在前, 其次内置; 直连始终在末尾兜底) */
export async function getMirrors(): Promise<Mirror[]> {
  const p = await load();
  const customs: Mirror[] = p.custom.map((prefix, i) => ({
    id: `c-${i}`,
    name: prefix.replace(/^https?:\/\//, '').replace(/\/$/, '') || '自定义镜像',
    prefix,
    builtin: false,
    enabled: true,
  }));
  const builtins = BUILTIN.map((m) => ({ ...m, enabled: !p.disabled.includes(m.id) }));
  const on = [...customs, ...builtins.filter((m) => m.enabled)];
  const direct = on.find((m) => m.id === 'b5');
  return [...on.filter((m) => m.id !== 'b5'), ...(direct ? [direct] : [])];
}

/** 仅自定义 + 禁用状态 (给设置界面) */
export async function getMirrorSettings(): Promise<{ customs: string[]; builtins: Mirror[] }> {
  const p = await load();
  return {
    customs: p.custom,
    builtins: BUILTIN.map((m) => ({ ...m, enabled: !p.disabled.includes(m.id) })),
  };
}

export function subscribeMirrors(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export async function addCustomMirror(prefix: string): Promise<void> {
  const p = await load();
  const url = prefix.trim().replace(/\/?$/, '/');
  if (!/^https?:\/\//.test(url)) throw new Error('镜像地址必须以 http(s):// 开头');
  if (p.custom.includes(url)) throw new Error('该镜像已存在');
  await save({ ...p, custom: [...p.custom, url] });
}

export async function removeCustomMirror(index: number): Promise<void> {
  const p = await load();
  await save({ ...p, custom: p.custom.filter((_, i) => i !== index) });
}

export async function toggleBuiltinMirror(id: string): Promise<void> {
  const p = await load();
  const disabled = p.disabled.includes(id) ? p.disabled.filter((x) => x !== id) : [...p.disabled, id];
  await save({ ...p, disabled });
}

/** 测速: 拉取仓库 package.json 计时, 超时/失败返回 -1 */
export async function testMirror(prefix: string, timeoutMs = 8000): Promise<number> {
  const url = `${prefix}https://raw.githubusercontent.com/dawgnation1986/class-schedule/master/package.json`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const start = Date.now();
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return -1;
    await r.text();
    return Date.now() - start;
  } catch {
    return -1;
  } finally {
    clearTimeout(timer);
  }
}

/** 全部镜像并行测速 → [{mirror, ms}] */
export async function testAllMirrors(list: Mirror[]): Promise<{ mirror: Mirror; ms: number }[]> {
  return Promise.all(list.map(async (mirror) => ({ mirror, ms: await testMirror(mirror.prefix) })));
}
