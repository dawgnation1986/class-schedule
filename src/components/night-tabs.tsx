/**
 * 液态玻璃标签栏: 原生导航器 (react-native-bottom-tabs) + 自绘悬浮玻璃底栏
 * 完全不经过 expo-router 内置的 JS 版 bottom-tabs —— 那条路径存在
 * "Invalid hook call" 崩溃, 是液态玻璃模式闪退的根因。
 *
 * 视觉目标(iOS 26 液态玻璃):
 * - 整条底栏是一块悬浮宽幅玻璃: 真正把背后的页面内容糊掉, 只留很淡的染色
 * - 边缘一圈细腻白色描边 + 上缘高光, 形成玻璃厚度感
 * - 选中项是一颗独立的浅蓝半透明玻璃胶囊, 有自己的模糊和染色, 与外层分层
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { withLayoutContext, usePathname, useRouter } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiMode } from '@/hooks/use-ui-mode';
import { useNightGlass } from '@/hooks/use-night-glass';
import { useTabBarLook } from '@/hooks/use-tab-bar-look';
import { luminance, withAlpha } from '@/lib/tab-bar-style';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

/** 悬浮玻璃栏高度 */
const BAR_H = 76;
/** 玻璃栏左右内边距 */
const BAR_PAD = 7;
/** 选中胶囊相对每格的左右内缩 */
const CAPSULE_INSET = 7;

const ITEMS = [
  { route: '/home', label: '主站', icon: 'compass-outline', active: 'compass' },
  { route: '/timetable', label: '课表', icon: 'calendar-outline', active: 'calendar' },
  { route: '/profile', label: '我的', icon: 'person-outline', active: 'person' },
] as const;

/** 悬浮玻璃底栏: 真模糊 + 淡染色 + 玻璃边缘 + 蓝色玻璃胶囊 */
function GlassTabBar({ blurTarget }: { blurTarget?: RefObject<View | null> }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const blurOn = useNightGlass();
  const look = useTabBarLook();
  const dark = luminance(look.color) < 0.5;
  const fg = dark ? 'rgba(255,255,255,0.62)' : 'rgba(60,60,67,0.60)';
  const fgActive = dark ? '#9CC8FF' : '#2563EB';
  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((i) => pathname === i.route || pathname.startsWith(`${i.route}/`)),
  );

  // 段宽实测, 胶囊按像素滑动
  const [rowW, setRowW] = useState(0);
  const itemW = rowW / ITEMS.length;
  const itemWRef = useRef(0);
  itemWRef.current = itemW;
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  const x = useRef(new Animated.Value(0)).current;
  const lastX = useRef(0);
  const dragStart = useRef(0);

  // 按住底栏左右拖动: 胶囊跟手, 松手吸附最近的一档并切换
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        x.stopAnimation((v) => {
          dragStart.current = v;
        });
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
        Animated.spring(x, {
          toValue: idx * w,
          friction: 9,
          tension: 90,
          useNativeDriver: true,
        }).start();
        if (idx !== activeRef.current) router.navigate(ITEMS[idx].route as never);
      },
    }),
  ).current;

  // 切换时胶囊平滑滑过去(轻微弹簧, 不弹跳)
  useEffect(() => {
    if (!itemW) return;
    const to = activeIndex * itemW;
    if (to === lastX.current) return;
    Animated.spring(x, { toValue: to, friction: 10, tension: 85, useNativeDriver: true }).start();
    lastX.current = to;
  }, [activeIndex, itemW, x]);

  const glassBar = blurOn;

  const content = (
    <>
      <View
        style={styles.row}
        onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
        {...pan.panHandlers}>
        {/* 选中胶囊: 独立的一层蓝色玻璃(自己再模糊一次背后的页面) */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.capsule,
            {
              width: Math.max(0, itemW - CAPSULE_INSET * 2),
              backgroundColor: look.liquid
                ? dark
                  ? 'rgba(96,165,250,0.26)'
                  : 'rgba(96,165,250,0.20)'
                : dark
                  ? 'rgba(255,255,255,0.18)'
                  : 'rgba(255,255,255,0.88)',
              borderColor: dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.62)',
              transform: [{ translateX: x }],
            },
          ]}>
          {glassBar && (
            <BlurView
              blurTarget={blurTarget ?? undefined}
              intensity={30}
              tint="default"
              blurMethod="dimezisBlurView"
              blurReductionFactor={3}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={
              look.liquid
                ? ['rgba(191,219,254,0.34)', 'rgba(96,165,250,0.06)', 'rgba(147,197,253,0.20)']
                : ['rgba(255,255,255,0.40)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.22)']
            }
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </Animated.View>
        {ITEMS.map((item, i) => {
          const on = i === activeIndex;
          return (
            <Pressable key={item.route} onPress={() => router.navigate(item.route as never)} style={styles.item}>
              <Ionicons name={(on ? item.active : item.icon) as never} size={23} color={on ? fgActive : fg} />
              <Text style={[styles.label, { color: on ? fgActive : fg }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 10) }]}>
      <View
        style={[
          styles.bar,
          {
            borderColor: dark ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.55)',
          },
        ]}>
        {/* 真模糊: 采样三个 tab 页的内容; 底栏本身没有任何实体底色 */}
        <BlurView
          blurTarget={blurTarget ?? undefined}
          intensity={40}
          tint="default"
          blurMethod="dimezisBlurView"
          blurReductionFactor={1}
          style={StyleSheet.absoluteFill}
        />
        {/* 只允许极淡的自定义染色(默认 6%), 不是白色底板 */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(look.color, Math.min(look.alpha, 0.25)) }]}
        />
        {/* 模糊被调试开关关掉时的兜底底色(平时不渲染) */}
        {!blurOn && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(look.color, 0.92) }]} />
        )}
        {/* 上缘高光: 仅贴边的一条, 不铺满 */}
        <LinearGradient
          colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
          locations={[0, 0.55, 1]}
          style={styles.topSheen}
          pointerEvents="none"
        />
        {content}
        {/* 下缘细亮线 */}
        <View pointerEvents="none" style={styles.bottomSheen} />
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
  // 底栏模糊取景: 只包住三个页面, 底栏自己不在取景范围内(否则会糊到自己)
  const sceneTarget = useRef<View>(null);
  return (
    <View style={{ flex: 1 }}>
      <BlurTargetView ref={sceneTarget} style={{ flex: 1 }}>
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
      </BlurTargetView>
      {glass && <GlassTabBar blurTarget={sceneTarget} />}
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
  shadow: {
    borderRadius: BAR_H / 2,
  },
  bar: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
    borderWidth: 1,
    paddingHorizontal: BAR_PAD,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  topSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 12,
  },
  bottomSheen: {
    position: 'absolute',
    bottom: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  item: {
    flex: 1,
    height: BAR_H - 2 * BAR_PAD,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { fontSize: 11, fontWeight: '600' },
  capsule: {
    position: 'absolute',
    left: CAPSULE_INSET,
    top: BAR_PAD - 2,
    height: BAR_H - 2 * BAR_PAD + 4,
    borderRadius: (BAR_H - 2 * BAR_PAD + 4) / 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
