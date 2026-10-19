import { DarkTheme, DefaultTheme, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { loadAccount } from '@/lib/account';

SplashScreen.preventAutoHideAsync();

/** 根据"默认起始页"设置, 启动时跳转到对应 tab (仅执行一次) */
function StartPageGate() {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const acc = await loadAccount();
        if (acc?.startPage === 'home') router.replace('/home');
        else if (acc?.startPage === 'timetable') router.replace('/timetable');
      } catch {
        // 忽略, 停留在课表页
      }
    })();
  }, [router]);
  return null;
}

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
      <StartPageGate />
    </ThemeProvider>
  );
}
