import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UpdatePrompt } from '@/components/update-prompt';
import { CoachTour, startCoachTour, shouldShowTour } from '@/components/tour';
import { OnboardingModal, shouldShowOnboarding } from '@/components/onboarding';
import { AgreementModal, shouldShowAgreement } from '@/components/agreement';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BackgroundLayer, primeBackground } from '@/lib/background';
import { primeScheduleTimes } from '@/lib/schedule-times';
import { primeThemeMode } from '@/lib/theme';
import { primeUiMode } from '@/lib/ui-mode';
import { initNotifications } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // 首次启动三步流程: 图文教程 → 用户协议 → 交互式新手引导
  const [flow, setFlow] = useState<'onboarding' | 'agreement' | null>(null);

  // 启动时预热作息时间表/外观模式/自定义背景, 并自动创建/修复通知渠道 + 请求通知权限
  useEffect(() => {
    void primeScheduleTimes();
    void primeThemeMode();
    void primeUiMode();
    void primeBackground();
    void initNotifications();
    // 首次启动: 图文教程 → 用户协议(拒绝则退出) → 新手引导
    (async () => {
      if (!(await shouldShowAgreement())) {
        // 协议未同意: 先图文(未看过才弹)再协议; 已同意的老用户直接进引导
        if (await shouldShowOnboarding()) setFlow('onboarding');
        else setFlow('agreement');
        return;
      }
      if (await shouldShowTour()) startCoachTour();
    })();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* 自定义背景图层(页面背景透明时露出) */}
      <BackgroundLayer />
      <UpdatePrompt />
      {/* 交互式新手引导(全屏遮罩层, 首次启动自动/教程设置手动) */}
      <CoachTour />
      {/* 首次启动: 图文教程 → 用户协议 */}
      <OnboardingModal visible={flow === 'onboarding'} onClose={() => setFlow('agreement')} />
      <AgreementModal
        visible={flow === 'agreement'}
        mode="gate"
        onAccepted={() => {
          void shouldShowTour().then((f) => f && startCoachTour());
          setFlow(null);
        }}
      />
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
