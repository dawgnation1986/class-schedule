import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UpdatePrompt } from '@/components/update-prompt';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BackgroundLayer, primeBackground } from '@/lib/background';
import { primeScheduleTimes } from '@/lib/schedule-times';
import { primeThemeMode } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // 启动时预热作息时间表/外观模式/自定义背景
  useEffect(() => {
    void primeScheduleTimes();
    void primeThemeMode();
    void primeBackground();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* 自定义背景图层(页面背景透明时露出) */}
      <BackgroundLayer />
      <UpdatePrompt />
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
