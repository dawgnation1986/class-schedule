import AsyncStorage from '@react-native-async-storage/async-storage';

/** 主站账号与 APP 偏好 */
export type Account = {
  username: string; // 学号
  password: string;
  startPage: StartPage; // 打开 APP 时的默认起始页
};

export type StartPage = 'home' | 'timetable';

const KEY = 'account.portal.v1';

export async function loadAccount(): Promise<Account | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Account;
    // 未登录时也保留偏好设置(默认起始页等), 不因缺凭证丢弃
    a.username = a.username || '';
    a.password = a.password || '';
    if (a.startPage !== 'home' && a.startPage !== 'timetable') a.startPage = 'home';
    return a;
  } catch {
    return null;
  }
}

export async function saveAccount(a: Account): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(a));
}
