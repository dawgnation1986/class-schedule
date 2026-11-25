/**
 * 液态玻璃标签栏: 原生导航器 (react-native-bottom-tabs) + 自绘悬浮胶囊底栏
 * 完全不经过 expo-router 内置的 JS 版 bottom-tabs —— 那条路径存在
 * "Invalid hook call" 崩溃, 是液态玻璃模式闪退的根因。
 *
 * 底栏选中态是一颗会拉伸、回弹的「水滴」: 切换时先拉长再弹回,
 * 后面跟一颗延迟的拖尾水珠, 形成 duang 的流体感。
 */
import { useEffect, useRef, useState } from 'react';
import { withLayoutContext, usePathname, useRouter } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiMode } from '@/hooks/use-ui-mode';
import { useNightGlass } from '@/hooks/use-night-glass';
import { useTabBarLook } from '@/hooks/use-tab-bar-look';
import { luminance, withAlpha } from '@/lib/tab-bar-style';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

const ITEMS = [
  { route: '/home', label: '主站', icon: 'compass-outline', active: 'compass' },
  { route: '/timetable', label: '课表', icon: 'calendar-outline', active: 'calendar' },
  { route: '/profile', label: '我的', icon: 'person-outline', active: 'person' },
] as const;

/** 悬浮胶囊玻璃底栏: 毛玻璃 + 高光描边 + 水滴滑动指示器 */
function GlassTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const blurOn = useNightGlass();
  const look = useTabBarLook();
  const dark = luminance(look.color) < 0.5;
  const fg = dark ? '#F4F7FF' : '#1E293B';
  const fgDim = dark ? 'rgba(255,255,255,0.55)' : 'rgba(30,41,59,0.50)';
  const fgActive = dark ? '#9CC8FF' : '#2563EB';
  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((i) => pathname === i.route || pathname.startsWith(`${i.route}/`)),
  );

  // 段宽实测, 指示器按像素滑动
  const [rowW, setRowW] = useState(0);
  const itemW = rowW / ITEMS.length;
  const itemWRef = useRef(0);
  itemWRef.current = itemW;
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const x2 = useRef(new Animated.Value(0)).current;
  const op2 = useRef(new Animated.Value(0)).current;
  const barPop = useRef(new Animated.Value(1)).current;
  const lastX = useRef(0);
  const dragStart = useRef(0);

  // 按住底栏左右拖动: 水滴跟手, 松手吸附最近的一档并切换
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        x.stopAnimation((v) => {
          dragStart.current = v;
        });
        stretch.setValue(0.5);
      },
      onPanResponderMove: (_, g) => {
        const w = itemWRef.current;
        if (!w) return;
        const max = (ITEMS.length - 1) * w;
        x.setValue(Math.min(max, Math.max(0, dragStart.current + g.dx)));
        barPop.setValue(1.015);
      },
      onPanResponderRelease: (_, g) => {
        const w = itemWRef.current;
        if (!w) return;
        const max = (ITEMS.length - 1) * w;
        const raw = Math.min(max, Math.max(0, dragStart.current + g.dx));
        const idx = Math.min(ITEMS.length - 1, Math.max(0, Math.round(raw / w)));
        lastX.current = idx * w;
        Animated.parallel([
          Animated.spring(x, { toValue: idx * w, friction: 5, tension: 140, useNativeDriver: true }),
          Animated.spring(stretch, { toValue: 0, friction: 4, tension: 90, useNativeDriver: true }),
          Animated.spring(barPop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
        ]).start();
        if (idx !== activeRef.current) router.navigate(ITEMS[idx].route as never);
      },
      onPanResponderTerminate: () => {
        Animated.spring(stretch, { toValue: 0, friction: 4, useNativeDriver: true }).start();
        Animated.spring(barPop, { toValue: 1, friction: 4, useNativeDriver: true }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (!itemW) return;
    const to = activeIndex * itemW;
    if (to === lastX.current) return;
    op2.setValue(0.7);
    x2.setValue(lastX.current);
    Animated.parallel([
      Animated.spring(x, { toValue: to, friction: 6, tension: 130, useNativeDriver: true }),
      // 先拉长再弹回: duang 的水滴形变
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 0, friction: 4, tension: 90, useNativeDriver: true }),
      ]),
      // 拖尾水珠: 慢一拍跟上来, 落定后淡出
      Animated.sequence([
        Animated.spring(x2, { toValue: to, friction: 8, tension: 45, useNativeDriver: true, delay: 70 }),
        Animated.timing(op2, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
    ]).start();
    // 整条胶囊轻微回弹, 增强 duang 的手感
    Animated.sequence([
      Animated.timing(barPop, { toValue: 1.035, duration: 110, useNativeDriver: true }),
      Animated.spring(barPop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
    ]).start();
    lastX.current = to;
  }, [activeIndex, itemW, x, stretch, x2, op2, barPop]);

  const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.34] });
  const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });

  const content = (
    <>
      <View
        pointerEvents="none"
        style={[styles.sheen, { backgroundColor: dark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.95)' }]}
      />
      <View style={styles.row} onLayout={(e) => setRowW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        {/* 拖尾水珠 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.trail,
            {
              width: Math.max(0, itemW - 8),
              opacity: op2,
              transform: [{ translateX: x2 }],
              backgroundColor: withAlpha(dark ? '#7FB2FF' : '#78BEFF', 0.5),
            },
          ]}
        />
        {/* 水滴指示器 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: Math.max(0, itemW - 8),
              backgroundColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)',
              borderColor: dark ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.98)',
              transform: [{ translateX: x }, { scaleX }, { scaleY }],
            },
          ]}
        />
        {ITEMS.map((item, i) => {
          const on = i === activeIndex;
          return (
            <Pressable key={item.route} onPress={() => router.navigate(item.route as never)} style={styles.item}>
              <Ionicons name={(on ? item.active : item.icon) as never} size={22} color={on ? fgActive : fgDim} />
              <Text style={[styles.label, { color: on ? fgActive : fgDim }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const glassBar = look.seeThrough && blurOn;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 10) }]}>
      <Animated.View style={[styles.shadow, { transform: [{ scale: barPop }] }]}>
        {glassBar ? (
          <BlurView
            intensity={70}
            tint="light"
            blurMethod="dimezisBlurView"
            style={[styles.pill, { borderColor: 'rgba(255,255,255,0.95)' }]}>
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(look.color, 0.32) }]}
            />
            {content}
          </BlurView>
        ) : (
          <View
            style={[
              styles.pill,
              {
                backgroundColor: look.seeThrough ? withAlpha(look.color, 0.92) : look.color,
                borderColor: dark ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.95)',
              },
            ]}>
            {content}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

export default function NightTabs() {
  const mode = useUiMode();
  const insets = useSafeAreaInsets();
  const glass = mode === 'glass' || mode === 'night';
  // 为悬浮底栏预留高度, 避免课表底部周次条等内容被盖住
  const reserve = glass ? 72 + Math.max(insets.bottom, 10) + 8 : 0;
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBarHidden={glass}
        tabBarActiveTintColor={glass ? '#8FD0FF' : '#5B8CFF'}
        tabBarStyle={glass ? { backgroundColor: 'rgba(18,24,46,0.72)' } : undefined}
        translucent={glass}
        hapticFeedbackEnabled={true}
        sidebarAdaptable={false}>
        <Tabs.Screen
          name="home"
          options={{
            title: '主站',
            sceneStyle: { backgroundColor: 'transparent', paddingBottom: glass ? reserve : 0 },
            tabBarIcon: () => require('@/assets/images/tabIcons/explore.png'),
          }}
        />
        <Tabs.Screen
          name="timetable"
          options={{
            title: '课表',
            sceneStyle: { backgroundColor: 'transparent', paddingBottom: glass ? reserve : 0 },
            tabBarIcon: () => require('@/assets/images/tabIcons/home.png'),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: '我的',
            sceneStyle: { backgroundColor: 'transparent', paddingBottom: glass ? reserve : 0 },
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
    left: 18,
    right: 18,
    zIndex: 100,
    elevation: 30,
  },
  shadow: {
    borderRadius: 31,
    shadowColor: '#3B6FD4',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 24,
  },
  pill: {
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  item: {
    flex: 1,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  indicator: {
    position: 'absolute',
    left: 4,
    top: 7,
    bottom: 7,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.98)',
    shadowColor: '#2563EB',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  trail: {
    position: 'absolute',
    left: 4,
    top: 18,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(120,190,255,0.55)',
  },
  label: { fontSize: 11, fontWeight: '700' },
});
