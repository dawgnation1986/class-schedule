import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UpdatePrompt } from '@/components/update-prompt';
import { CoachTour, startCoachTour, shouldShowTour } from '@/components/tour';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BackgroundLayer, primeBackground } from '@/lib/background';
import { primeScheduleTimes } from '@/lib/schedule-times';
import { primeThemeMode } from '@/lib/theme';
import { initNotifications } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // 启动时预热作息时间表/外观模式/自定义背景, 并自动创建/修复通知渠道 + 请求通知权限
  useEffect(() => {
    void primeScheduleTimes();
    void primeThemeMode();
    void primeBackground();
    void initNotifications();
    // 首次启动: 自动开始交互式新手引导(方块高亮+箭头)
    void shouldShowTour().then((first) => {
      if (first) startCoachTour();
    });
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* 自定义背景图层(页面背景透明时露出) */}
      <BackgroundLayer />
      <UpdatePrompt />
      {/* 交互式新手引导(全屏遮罩层, 首次启动自动/教程设置手动) */}
      <CoachTour />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="temp-query" />
        <Stack.Screen name="portal-page" />
        <Stack.Screen name="todos" />
        <Stack.Screen name="gpa" />
        <Stack.Screen name="today" />
      </Stack>
    </ThemeProvider>
  );
}
