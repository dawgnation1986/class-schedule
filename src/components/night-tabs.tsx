/**
 * 液态玻璃标签栏
 *
 * 关键结构 (expo-blur 57 / Android):
 * - 底栏必须渲染在根 BlurTargetView 的子树里: Dimezis BlurTarget 在生成快照时会自动把
 *   模糊视图自身排除, 所以既要"在里面"才不会坐标失效, 又不会自己糊自己。
 * - 之前两个错误: 1) 底栏自己套了一层只包含 <Tabs> 的内层 target(场景背景是透明的, 采样为空);
 *   2) 底栏挪到根 target 之外(采样坐标失效), 两种情况都只剩 BlurView 的白膜 = 灰白板。
 * - 原生导航栏不支持 tabBarHidden, 用该库支持的 tabBar={() => null} 关掉。
 */
import { useEffect, useRef, useState } from 'react';
import { withLayoutContext, usePathname, useRouter } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiMode } from '@/hooks/use-ui-mode';
import { useNightGlass } from '@/hooks/use-night-glass';
import { useTabBarLook } from '@/hooks/use-tab-bar-look';
import { useBlurTarget } from '@/components/glass-surface';
import { withAlpha } from '@/lib/tab-bar-style';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

/** 底栏高度 */
const BAR_H = 76;
/** 选中胶囊左右内缩 */
const CAPSULE_INSET = 10;

const ITEMS = [
  { route: '/home', label: '主站', icon: 'compass-outline', active: 'compass' },
  { route: '/timetable', label: '课表', icon: 'calendar-outline', active: 'calendar' },
  { route: '/profile', label: '我的', icon: 'person-outline', active: 'person' },
] as const;

/** 悬浮玻璃底栏: 渲染在根布局 (_layout.tsx) 的 BlurTargetView 内 */
export function GlassTabBarOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const mode = useUiMode();
  const blurOn = useNightGlass();
  const blurTarget = useBlurTarget();
  const look = useTabBarLook();

  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((i) => pathname === i.route || pathname.startsWith(`${i.route}/`)),
  );
  const isTab = ITEMS.some((i) => pathname === i.route || pathname.startsWith(`${i.route}/`));

  const [rowW, setRowW] = useState(0);
  const itemW = rowW / ITEMS.length;
  const itemWRef = useRef(0);
  itemWRef.current = itemW;
  const activeRef = useRef(0);
  activeRef.current = activeIndex;

  const x = useRef(new Animated.Value(0)).current;
  const lastX = useRef(0);
  const dragStart = useRef(0);

  // 按住胶囊左右拖动: 跟手, 松手吸附最近一档并切换
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
        Animated.spring(x, { toValue: idx * w, friction: 9, tension: 110, useNativeDriver: true }).start();
        if (idx !== activeRef.current) router.navigate(ITEMS[idx].route as never);
      },
    }),
  ).current;

  useEffect(() => {
    if (!itemW) return;
    const to = activeIndex * itemW;
    if (to === lastX.current) return;
    Animated.spring(x, { toValue: to, friction: 9, tension: 110, useNativeDriver: true }).start();
    lastX.current = to;
  }, [activeIndex, itemW, x]);

  if ((mode !== 'glass' && mode !== 'night') || !isTab) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 10) }]}>
      <BlurView
        blurTarget={blurTarget ?? undefined}
        intensity={blurOn ? 45 : 0}
        tint="default"
        blurMethod="dimezisBlurView"
        blurReductionFactor={1}
        style={styles.bar}>
        {/* 染色浓度 > 0 时才叠一层自定义颜色(设置里那个滑条真正控制这里) */}
        {look.alpha > 0 && (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(look.color, look.alpha) }]}
          />
        )}
        {/* 玻璃边缘: 顶部极窄高光 + 1px 描边(不做大面积填充) */}
        <View pointerEvents="none" style={styles.outline} />
        <LinearGradient
          colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
          locations={[0, 0.6, 1]}
          style={styles.topSheen}
          pointerEvents="none"
        />
        <View style={styles.row} onLayout={(e) => setRowW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
          {/* 选中胶囊: 独立玻璃层(与外层共用同一个采样目标) + 浅蓝染色 */}
          {itemW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.indicator,
                { width: Math.max(0, itemW - CAPSULE_INSET * 2), transform: [{ translateX: x }] },
              ]}>
              {blurOn && (
                <BlurView
                  blurTarget={blurTarget ?? undefined}
                  intensity={30}
                  tint="default"
                  blurMethod="dimezisBlurView"
                  blurReductionFactor={1}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <LinearGradient
                colors={
                  look.liquid
                    ? ['rgba(147,197,253,0.22)', 'rgba(96,165,250,0.10)', 'rgba(147,197,253,0.18)']
                    : ['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.22)']
                }
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          )}
          {ITEMS.map((item, i) => {
            const on = i === activeIndex;
            return (
              <Pressable
                key={item.route}
                onPress={() => router.navigate(item.route as never)}
                style={styles.item}>
                <Ionicons
                  name={(on ? item.active : item.icon) as never}
                  size={24}
                  color={on ? '#2563EB' : 'rgba(30,41,59,0.52)'}
                />
                <Text style={[styles.label, { color: on ? '#2563EB' : 'rgba(30,41,59,0.52)' }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View pointerEvents="none" style={styles.bottomLine} />
      </BlurView>
    </View>
  );
}

/** 液态玻璃悬浮底栏为页面内容预留的底部高度(不含页面自身 padding) */
export function useGlassTabReserve(): number {
  const mode = useUiMode();
  const insets = useSafeAreaInsets();
  return mode === 'glass' || mode === 'night' ? BAR_H + Math.max(insets.bottom, 10) + 16 : 0;
}

export default function NightTabs() {
  const mode = useUiMode();
  const glass = mode === 'glass' || mode === 'night';
  return (
    <Tabs tabBar={glass ? () => null : undefined} hapticFeedbackEnabled={true} sidebarAdaptable={false}>
      <Tabs.Screen
        name="home"
        options={{
          title: '主站',
          tabBarIcon: () => require('@/assets/images/tabIcons/explore.png'),
        }}
      />
      <Tabs.Screen
        name="timetable"
        options={{
          title: '课表',
          tabBarIcon: () => require('@/assets/images/tabIcons/home.png'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: () => require('@/assets/images/tabIcons/person.png'),
        }}
      />
    </Tabs>
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
    overflow: 'hidden',
  },
  outline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BAR_H / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  topSheen: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 12,
  },
  bottomLine: {
    position: 'absolute',
    bottom: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 },
  item: {
    flex: 1,
    height: BAR_H,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  indicator: {
    position: 'absolute',
    left: CAPSULE_INSET,
    top: 10,
    height: BAR_H - 20,
    borderRadius: (BAR_H - 20) / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.40)',
  },
  label: { fontSize: 11, fontWeight: '600' },
});
