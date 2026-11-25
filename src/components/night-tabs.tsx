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
        ]).start();
        if (idx !== activeRef.current) router.navigate(ITEMS[idx].route as never);
      },
      onPanResponderTerminate: () => {
        Animated.spring(stretch, { toValue: 0, friction: 4, useNativeDriver: true }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (!itemW) return;
    const to = activeIndex * itemW;
    if (to === lastX.current) return;
    Animated.parallel([
      Animated.spring(x, { toValue: to, friction: 6, tension: 130, useNativeDriver: true }),
      // 轻微回弹, 保持 duang 的手感; 不做缩放, 胶囊宽度始终一致
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 0, friction: 4, tension: 90, useNativeDriver: true }),
      ]),
    ]).start();
    lastX.current = to;
  }, [activeIndex, itemW, x, stretch]);

  // 指示器只做位移, 不做形变, 上下左右等宽
  const stretchOpacity = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });

  const content = (
    <>
      <View
        pointerEvents="none"
        style={[styles.sheen, { backgroundColor: dark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.95)' }]}
      />
      <View style={styles.row} onLayout={(e) => setRowW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        {/* 水滴指示器 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: Math.max(0, itemW - 24),
              opacity: stretchOpacity,
              backgroundColor: dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.62)',
              borderColor: dark ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.92)',
              transform: [{ translateX: x }],
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
    <View
      style={[
        styles.host,
        { marginBottom: Math.max(insets.bottom, 10) },
      ]}>
      <View style={styles.shadow}>
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
      </View>
    </View>
  );
}

export default function NightTabs() {
  const mode = useUiMode();
  const glass = mode === 'glass' || mode === 'night';
  return (
    <View style={{ flex: 1 }}>
      {/* 底栏改为占位布局(不再绝对定位): 页面内容到胶囊上沿就结束, 永远不会被压住 */}
      <View style={{ flex: 1 }}>
        <Tabs tabBarHidden={glass} translucent={glass} hapticFeedbackEnabled={true} sidebarAdaptable={false}>
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
      </View>
      {glass && <GlassTabBar />}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    marginHorizontal: 18,
    marginTop: 6,
    zIndex: 100,
  },
  shadow: {
    borderRadius: 31,
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
    left: 12,
    top: 8,
    bottom: 8,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  label: { fontSize: 11, fontWeight: '700' },
});
