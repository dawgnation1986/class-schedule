/** 云端备份: 官网 api/cloud.php 的账号与备份接口封装 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSiteUrl } from '@/lib/site';

export type CloudUser = {
  id: string;
  username: string;
  /** 昵称(与 App 个人资料联动, 空则由官网回退为用户名) */
  nickname?: string;
  email: string;
  qq: string;
  created: string;
  quota: number;
  used: number;
  banned?: boolean;
};

export type CloudBackupMeta = {
  id: string;
  name: string;
  at: string;
  size: number;
  sections: string[];
  appVersion: string;
};

export type CloudSection = { key: string; label: string };

export type CloudConfig = {
  default_quota: number;
  max_size_mb: number;
  allow_register: boolean;
  sections: CloudSection[];
};

export type CloudSession = { token: string; user: CloudUser; base: string };

const SESSION_KEY = 'cloud.session.v1';

let cache: CloudSession | null = null;
let cached = false;

export async function getCloudSession(): Promise<CloudSession | null> {
  if (cached) return cache;
  cached = true;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as CloudSession) : null;
    if (!s?.token) return (cache = null);
    // 官网地址变化后旧令牌不再有效
    if (s.base !== (await getSiteUrl())) return (cache = null);
    cache = s;
  } catch {
    cache = null;
  }
  return cache;
}

async function setSession(s: CloudSession | null): Promise<void> {
  cached = true;
  cache = s;
  if (s) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else await AsyncStorage.removeItem(SESSION_KEY);
}

export async function clearCloudSession(): Promise<void> {
  await setSession(null);
}

type ApiResult = {
  ok?: boolean;
  error?: string;
  token?: string;
  user?: CloudUser;
  backups?: CloudBackupMeta[];
  backup?: Record<string, unknown>;
  config?: CloudConfig;
};

async function call(action: string, params: Record<string, unknown> = {}): Promise<ApiResult> {
  const base = await getSiteUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${base}/api/cloud.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let j: ApiResult;
    try {
      j = JSON.parse(text) as ApiResult;
    } catch {
      throw new Error(`服务器返回异常（HTTP ${r.status}）`);
    }
    if (!r.ok || j.ok === false) throw new Error(j.error || `请求失败（HTTP ${r.status}）`);
    return j;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('连接官网超时，请检查网络或官网地址');
    throw e instanceof Error ? e : new Error('网络请求失败');
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCloudConfig(): Promise<CloudConfig> {
  const j = await call('meta');
  if (!j.config) throw new Error('官网未返回备份配置');
  return j.config;
}

export async function cloudRegister(input: {
  username: string;
  password: string;
  email?: string;
  qq?: string;
}): Promise<CloudSession> {
  const j = await call('register', input);
  if (!j.token || !j.user) throw new Error('注册失败');
  const s: CloudSession = { token: j.token, user: j.user, base: await getSiteUrl() };
  await setSession(s);
  return s;
}

export async function cloudLogin(account: string, password: string): Promise<CloudSession> {
  const j = await call('login', { account, password });
  if (!j.token || !j.user) throw new Error('登录失败');
  const s: CloudSession = { token: j.token, user: j.user, base: await getSiteUrl() };
  await setSession(s);
  return s;
}

export async function cloudList(): Promise<{ user: CloudUser; backups: CloudBackupMeta[] }> {
  const s = await getCloudSession();
  if (!s) throw new Error('请先登录');
  const j = await call('list', { token: s.token });
  const user = j.user ?? s.user;
  if (j.user) await setSession({ ...s, user: j.user });
  return { user, backups: j.backups ?? [] };
}

/** 同步个人资料到云账户(昵称 / QQ / 邮箱), App 个人资料页保存时调用 */
export async function cloudUpdateProfile(patch: {
  nickname?: string;
  qq?: string;
  email?: string;
}): Promise<CloudUser> {
  const s = await getCloudSession();
  if (!s) throw new Error('请先登录');
  const j = await call('update_profile', { token: s.token, ...patch });
  const user = j.user ?? s.user;
  if (j.user) await setSession({ ...s, user: j.user });
  return user;
}

export type BackupPayload = {
  app?: string;
  version?: number;
  at?: string;
  appVersion?: string;
  kv: Record<string, string | null>;
};

export async function cloudUpload(name: string, data: BackupPayload): Promise<CloudBackupMeta[]> {
  const s = await getCloudSession();
  if (!s) throw new Error('请先登录');
  const j = await call('upload', { token: s.token, name, data });
  if (j.user) await setSession({ ...s, user: j.user });
  return j.backups ?? [];
}

export async function cloudDownload(id: string): Promise<Record<string, unknown>> {
  const s = await getCloudSession();
  if (!s) throw new Error('请先登录');
  const j = await call('download', { token: s.token, id });
  if (!j.backup) throw new Error('备份内容为空');
  return j.backup;
}

export async function cloudRename(id: string, name: string): Promise<CloudBackupMeta[]> {
  const s = await getCloudSession();
  if (!s) throw new Error('请先登录');
  const j = await call('rename', { token: s.token, id, name });
  return j.backups ?? [];
}

export async function cloudDelete(id: string): Promise<CloudBackupMeta[]> {
  const s = await getCloudSession();
  if (!s) throw new Error('请先登录');
  const j = await call('delete', { token: s.token, id });
  if (j.user) await setSession({ ...s, user: j.user });
  return j.backups ?? [];
}

export async function cloudLogout(): Promise<void> {
  const s = await getCloudSession();
  try {
    if (s) await call('logout', { token: s.token });
  } catch {
    // 令牌过期也直接清本地会话
  }
  await clearCloudSession();
}

/** 文件大小展示 */
export function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
