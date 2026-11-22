/** 个人资料: 头像 / 昵称 / QQ 号, 仅本机保存(随备份导出), 不上传 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

export type UserProfile = {
  nickname: string;
  /** 用户手动改过昵称后为 true, 之后不再用主站姓名兜底 */
  nicknameManual: boolean;
  qq: string;
  /** 头像文件路径(应用私有目录), null 用默认图标 */
  avatar: string | null;
};

const KEY = 'user.profile.v1';

export const DEFAULT_PROFILE: UserProfile = { nickname: '', nicknameManual: false, qq: '', avatar: null };

/** 展示用昵称: 手动设置优先, 否则用主站登录返回的姓名, 都没有则占位 */
export function displayName(p: UserProfile, portalName?: string | null): string {
  if (p.nicknameManual && p.nickname.trim()) return p.nickname.trim();
  if (portalName && portalName.trim()) return portalName.trim();
  if (p.nickname.trim()) return p.nickname.trim();
  return '';
}

export async function loadProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<UserProfile>) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  const next = { ...(await loadProfile()), ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** 选一张图片作为头像: 拷进应用私有目录, 避免相册权限失效后头像丢失 */
export async function pickAvatar(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  if (r.canceled) return null;
  const asset = r.assets?.[0];
  if (!asset) return null;
  const ext = asset.name?.split('.').pop()?.toLowerCase() || 'jpg';
  const dest = `${FileSystem.documentDirectory}avatar.${ext}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  await saveProfile({ avatar: dest });
  return dest;
}

/** 恢复默认头像 */
export async function clearAvatar(): Promise<void> {
  await saveProfile({ avatar: null });
}
