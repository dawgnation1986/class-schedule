import { useEffect, useState } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';

import { getThemeMode, subscribeTheme, type ThemeMode } from '@/lib/theme';

/** 返回生效的外观方案: 手动选择优先, 否则跟随系统
 *  保留 'unspecified' 兼容旧调用方的比较写法(实际永远不会返回它) */
export function useColorScheme(): 'light' | 'dark' | 'unspecified' {
  const system = useSystemScheme();
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());
  useEffect(() => subscribeTheme(() => setMode(getThemeMode())), []);
  return mode === 'auto' ? (system === 'dark' ? 'dark' : 'light') : mode;
}
