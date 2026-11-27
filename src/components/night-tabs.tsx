/**
 * 液态玻璃标签栏: 原生导航器 (react-native-bottom-tabs) + 自绘悬浮玻璃底栏
 *
 * 底栏材质与页面卡片(GlassSurface)完全一致:
 * - expo-blur 的 BlurView 指向根布局的 BlurTargetView, 真正模糊底下的页面内容(透字)
 * - 白色低透明度染色 + 顶部高光 + 1px 白描边, 没有任何实心底板
 * - 选中项是独立浅蓝玻璃胶囊, 用 Animated.spring 平滑位移
 *
 * 不再使用 expo-android-glass-view 的 AndroidGlassTabs: 它的 backdropSource 采样路径在真机上
 * 采出来是黑底(有内容的地方才透出内容, 空白处发黑), 与"通透"正好相反。
 */
import { usePathname, useRouter, withLayoutContext } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { GLASS_LINE } from '@/components/glass-surface';
import { useUiMode } from '@/hooks/use-ui-mode';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

/** 悬浮玻璃底栏高度 */
const BAR_H = 64;

const ITEMS = [
  { route: '/home', label: '主站', icon: 'compass-outline', active: 'compass' },
  { route: '/timetable', label: '课表', icon: 'calendar-outline', active: 'calendar' },
  { route: '/profile', label: '我的', icon: 'person-outline', active: 'person' },
] as const;

/** 底栏玻璃底: 低透明度白染色 + 高光/描边(没有任何实心底板) */
function BarGlass() {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: BAR_H / 2, overflow: 'hidden' }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.16)' }]} />
      <View style={styles.sheen} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: BAR_H / 2, borderWidth: 1, borderColor: GLASS_LINE },
        ]}
      />
    </View>
  );
}

/** 悬浮玻璃底栏: 玻璃胶囊底 + 自绘浅蓝玻璃选中胶囊 */
function GlassTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((i) => pathname === i.route || pathname.startsWith(`${i.route}/`)),
  );

  const [rowW, setRowW] = useState(0);
  const itemW = rowW / ITEMS.length;
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!itemW) return;
    Animated.spring(x, {
      toValue: activeIndex * itemW,
      friction: 9,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, itemW, x]);

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        <BarGlass />
        <View style={styles.row} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
          {itemW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[styles.capsule, { width: itemW - 12, transform: [{ translateX: x }] }]}
            />
          )}
          {ITEMS.map((item, i) => {
            const on = i === activeIndex;
            const color = on ? '#2563EB' : 'rgba(60,60,67,0.62)';
            return (
              <Pressable
                key={item.route}
                onPress={() => router.navigate(item.route as never)}
                style={styles.item}>
                <Ionicons name={(on ? item.active : item.icon) as never} size={24} color={color} />
                <Text style={[styles.label, { color }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
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
      {glass && <GlassTabBar />}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
  bar: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  capsule: {
    position: 'absolute',
    left: 6,
    top: 6,
    bottom: 6,
    borderRadius: (BAR_H - 12) / 2,
    backgroundColor: 'rgba(37,99,235,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  item: {
    flex: 1,
    height: BAR_H,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { fontSize: 11, fontWeight: '600' },
});
