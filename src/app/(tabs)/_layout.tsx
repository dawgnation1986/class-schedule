import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

SplashScreen.preventAutoHideAsync();

/**
 * 启动路由统一由 src/app/index.tsx 决定(读取 account.startPage 后 replace 一次)。
 * 这里不再做二次跳转: 之前 StartPageGate 会在 TabsLayout 挂载完成后再次 replace,
 * 与 index 的跳转叠加, 在原生 Tabs 首次 attach / 选中事件派发期间连续切换页面。
 */
export default function TabsLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
