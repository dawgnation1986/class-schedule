import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UpdatePrompt } from '@/components/update-prompt';
import { OnboardingModal, shouldShowOnboarding } from '@/components/onboarding';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BackgroundLayer, primeBackground } from '@/lib/background';
import { primeScheduleTimes } from '@/lib/schedule-times';
import { primeThemeMode } from '@/lib/theme';
import { initNotifications } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [intro, setIntro] = useState(false); // 首次启动自动弹新手引导

  // 启动时预热作息时间表/外观模式/自定义背景, 并自动创建/修复通知渠道 + 请求通知权限
  useEffect(() => {
    void primeScheduleTimes();
    void primeThemeMode();
    void primeBackground();
    void initNotifications();
    void shouldShowOnboarding().then(setIntro);
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* 自定义背景图层(页面背景透明时露出) */}
      <BackgroundLayer />
      <UpdatePrompt />
      {/* 新手引导: 首次启动自动弹出; 设置页可随时重温 */}
      <OnboardingModal visible={intro} onClose={() => setIntro(false)} />
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
