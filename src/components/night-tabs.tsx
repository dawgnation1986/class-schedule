/**
 * 液态玻璃标签栏: 原生导航器 (react-native-bottom-tabs) + 原生玻璃 TabBar
 *
 * 玻璃部分换成 expo-android-glass-view:
 * - Android 13+ 由 GlassBackdropSource 把页面内容录进 RenderNode, 玻璃直接采样,
 *   不存在 expo-blur 那种 "alpha = 0.44 x intensity" 的白色覆盖膜
 * - 边缘折射(refraction)、模糊、染色、可拖拽水滴全部由 Jetpack Compose 原生绘制
 * - Android 17 QPR / SDK 37.2+ 直接使用系统 setBackdropRenderEffect, 效果更接近 iOS 26
 * - 低版本自动退化为 fallbackColor 平面, 不会崩溃
 */
import { usePathname, useRouter, withLayoutContext } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AndroidGlassTabs, GlassBackdropSource } from 'expo-android-glass-view';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiMode } from '@/hooks/use-ui-mode';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

/** 原生玻璃底栏高度(与库的默认 64dp 胶囊一致) */
const BAR_H = 64;

const ITEMS = [
  { route: '/home', label: '主站', icon: 'compass-outline', active: 'compass' },
  { route: '/timetable', label: '课表', icon: 'calendar-outline', active: 'calendar' },
  { route: '/profile', label: '我的', icon: 'person-outline', active: 'person' },
] as const;

/** 悬浮玻璃底栏: 原生玻璃胶囊 + 可拖拽水滴 */
function GlassTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((i) => pathname === i.route || pathname.startsWith(`${i.route}/`)),
  );

  return (
    <AndroidGlassTabs
      backdropSource="screen"
      selectedIndex={activeIndex}
      onTabSelected={(i) => router.navigate(ITEMS[i].route as never)}
      accentColor="#2563EB"
      theme="light"
      glassEffectStyle="regular"
      style={[styles.bar, { bottom: Math.max(insets.bottom, 10) }]}>
      {ITEMS.map((item, i) => {
        const on = i === activeIndex;
        return (
          <View key={item.route} style={styles.item}>
            <Ionicons
              name={(on ? item.active : item.icon) as never}
              size={24}
              color={on ? '#2563EB' : 'rgba(60,60,67,0.62)'}
            />
            <Text style={[styles.label, { color: on ? '#2563EB' : 'rgba(60,60,67,0.62)' }]}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </AndroidGlassTabs>
  );
}

/** 液态玻璃悬浮底栏为页面内容预留的底部高度(不含页面自身 padding) */
export function useGlassTabReserve(): number {
  const mode = useUiMode();
  const insets = useSafeAreaInsets();
  return mode === 'glass' || mode === 'night' ? BAR_H + 12 + Math.max(insets.bottom, 10) + 16 : 0;
}

export default function NightTabs() {
  const mode = useUiMode();
  const glass = mode === 'glass' || mode === 'night';
  return (
    <View style={{ flex: 1 }}>
      {/* 玻璃的采样源: 三个 tab 页的内容; 底栏必须放在它外面, 否则会采到自己 */}
      <GlassBackdropSource name="screen" style={{ flex: 1 }}>
        <Tabs
          tabBar={glass ? () => null : undefined}
          hapticFeedbackEnabled={true}
          sidebarAdaptable={false}>
          <Tabs.Screen
            name="home"
            options={{
              title: '主站',
              sceneStyle: { backgroundColor: 'transparent' },
              tabBarIcon: () => require('@/assets/images/tabIcons/explore.png'),
            }}
          />
          <Tabs.Screen
            name="timetable"
            options={{
              title: '课表',
              sceneStyle: { backgroundColor: 'transparent' },
              tabBarIcon: () => require('@/assets/images/tabIcons/home.png'),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: '我的',
              sceneStyle: { backgroundColor: 'transparent' },
              tabBarIcon: () => require('@/assets/images/tabIcons/person.png'),
            }}
          />
        </Tabs>
      </GlassBackdropSource>
      {glass && <GlassTabBar />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: BAR_H,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { fontSize: 11, fontWeight: '600' },
});
