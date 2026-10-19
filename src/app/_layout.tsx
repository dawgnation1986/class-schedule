import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UpdatePrompt } from '@/components/update-prompt';
import { primeScheduleTimes } from '@/lib/schedule-times';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // 启动时预热作息时间表(自定义/季节选择), 供倒计时/通知/今日课程使用
  useEffect(() => {
    void primeScheduleTimes();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* 启动后自动检查更新, 发现新版本弹窗提示 */}
      <UpdatePrompt />
      <Stack screenOptions={{ headerShown: false }}>
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
