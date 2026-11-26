import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, type View } from 'react-native';
import { Stack } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { BlurTargetProvider } from '@/components/glass-surface';
import { UpdatePrompt } from '@/components/update-prompt';
import { NoticePrompt } from '@/components/notice-prompt';
import { CoachTour, startCoachTour, shouldShowTour } from '@/components/tour';
import { GlassTabBarOverlay } from '@/components/night-tabs';
import { OnboardingModal, shouldShowOnboarding } from '@/components/onboarding';
import { AgreementModal, shouldShowAgreement } from '@/components/agreement';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BackgroundLayer, GlassWallpaper, primeBackground } from '@/lib/background';
import { primeScheduleTimes } from '@/lib/schedule-times';
import { primeThemeMode } from '@/lib/theme';
import { primeUiMode } from '@/lib/ui-mode';
import { primeThemePreset } from '@/lib/theme-preset';
import { primeNightGlass } from '@/lib/night-glass';
import { primeGlassSkin } from '@/lib/glass-skin';
import { primeTabBarLook } from '@/lib/tab-bar-style';
import { requestClassAccess, resetAccessAndEnsureDirs } from '@/lib/class-folder';
import { writeCacheSnapshot } from '@/lib/cache-snapshot';
import { checkGradeUpdates, initNotifications, primeReminders, refreshTimetableAndRemind } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // expo-blur 57: Android 的 BlurView 必须指向一个 BlurTargetView 才会真的模糊
  const blurTargetRef = useRef<View>(null);
  // 首次启动三步流程: 图文教程 → 用户协议 → 交互式新手引导
  const [flow, setFlow] = useState<'onboarding' | 'agreement' | null>(null);

  // 从后台回到前台: 静默拉一次最新课表并重排提醒(临时调课/换教室能及时生效)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let prev = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const cameBack = prev === 'background' && next === 'active';
      prev = next;
      if (cameBack) void refreshTimetableAndRemind();
    });
    return () => sub.remove();
  }, []);

  // 启动时预热作息时间表/外观模式/自定义背景, 并自动创建/修复通知渠道 + 请求通知权限
  useEffect(() => {
    void primeScheduleTimes();
    void primeThemeMode();
    void primeUiMode();
    void primeThemePreset();
    void primeNightGlass();
    void primeGlassSkin();
    void primeTabBarLook();
    void primeBackground();
    void initNotifications().then(() => {
      void primeReminders();
      void checkGradeUpdates();
    });
    // /Class 公共目录: 建齐子目录并写课表缓存快照; 未授权时仅首次自动跳系统授权页
    void resetAccessAndEnsureDirs().then((ok) => {
      void writeCacheSnapshot();
      if (!ok && Platform.OS === 'android') {
        void AsyncStorage.getItem('class-perm-auto-v2').then((asked) => {
          if (!asked) {
            void AsyncStorage.setItem('class-perm-auto-v2', '1');
            void shouldShowAgreement().then((needAgree) => {
              if (!needAgree) void requestClassAccess();
            });
          }
        });
      }
    });
    // 首次启动: 图文教程 → 用户协议(拒绝则退出) → 新手引导
    (async () => {
      // 协议未同意: 先图文(未看过才弹)再协议
      if (await shouldShowAgreement()) {
        if (await shouldShowOnboarding()) setFlow('onboarding');
        else setFlow('agreement');
        return;
      }
      // 协议已同意的老用户: 未看过交互式引导则触发
      if (await shouldShowTour()) startCoachTour();
    })();
    // 从系统授权页返回前台时重测权限: 授权立即生效, 无需重启 App
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void resetAccessAndEnsureDirs().then((ok) => ok && void writeCacheSnapshot());
    });
    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <BlurTargetProvider target={blurTargetRef}>
        {/* 背景 + 页面内容作为模糊源(底栏/弹窗的玻璃从这里面取景) */}
        <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
          {/* 液态玻璃: 最底层模糊流光壁纸(无自定义背景时显示) */}
          <GlassWallpaper />
          {/* 自定义背景图层(页面背景透明时露出) */}
          <BackgroundLayer />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
              // 页面切换过渡: 右侧滑入 + 返回手势, 全平台统一
              animation: 'slide_from_right',
              animationDuration: 220,
              gestureEnabled: true,
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="sponsor" />
            <Stack.Screen name="notices" />
            <Stack.Screen name="news" />
            <Stack.Screen name="welfare" />
            <Stack.Screen name="temp-query" />
            <Stack.Screen name="portal-page" />
            <Stack.Screen name="todos" />
            <Stack.Screen name="gpa" />
            <Stack.Screen name="timetable-ocr" />
            <Stack.Screen name="profile-edit" />
            <Stack.Screen name="cloud-backup" />
            <Stack.Screen name="about-project" />
            <Stack.Screen name="today" />
          </Stack>
          {/* 悬浮玻璃底栏: 必须是 BlurTargetView 的后代(Dimezis BlurTarget 会自动把模糊视图本身排除在快照外),
              才能采样到真正的壁纸 + 页面内容; 放在外面时采样坐标失效, 只剩白膜 = 灰白板 */}
          <GlassTabBarOverlay />
        </BlurTargetView>
        <AnimatedSplashOverlay />
        <UpdatePrompt />
        <NoticePrompt />
        {/* 交互式新手引导(全屏遮罩层, 首次启动自动/教程设置手动) */}
        <CoachTour />
        {/* 首次启动: 图文教程 → 用户协议 */}
        <OnboardingModal visible={flow === 'onboarding'} onClose={() => setFlow('agreement')} />
        <AgreementModal
          visible={flow === 'agreement'}
          mode="gate"
          onAccepted={() => {
            setFlow(null);
            // 等协议弹窗完全关闭后再启动引导, 否则两个 Modal 叠加会把引导步骤顶掉
            setTimeout(() => {
              void shouldShowTour().then((f) => f && startCoachTour());
            }, 450);
          }}
        />
      </BlurTargetProvider>
    </ThemeProvider>
  );
}
