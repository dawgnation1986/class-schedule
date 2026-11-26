/**
 * 液态玻璃标签栏: 原生导航器 (react-native-bottom-tabs) + 自绘悬浮胶囊底栏
 * 完全不经过 expo-router 内置的 JS 版 bottom-tabs —— 那条路径存在
 * "Invalid hook call" 崩溃, 是液态玻璃模式闪退的根因。
 *
 * 底栏选中态是一颗会拉伸、回弹的「水滴」: 切换时先拉长再弹回,
 * 后面跟一颗延迟的拖尾水珠, 形成 duang 的流体感。
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

const ITEMS = [
  { route: '/home', label: '主站', icon: 'compass-outline', active: 'compass' },
  { route: '/timetable', label: '课表', icon: 'calendar-outline', active: 'calendar' },
  { route: '/profile', label: '我的', icon: 'person-outline', active: 'person' },
] as const;

/** 悬浮底栏尺寸(与页面底部占位共用同一套常量, 保证三者一致) */
export const GLASS_BAR_HEIGHT = 92;
export const GLASS_BAR_GAP = 12;
export const GLASS_BAR_MARGIN = 18;
const INDICATOR_INSET = 9;

/** 悬浮胶囊玻璃底栏: 毛玻璃 + 高光描边 + 水滴滑动指示器 */
function GlassTabBar({ blurTarget }: { blurTarget?: RefObject<View | null> }) {
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

  // 胶囊宽 = 每格宽减两侧内缩, 三等分完全等宽
  const pillW = Math.max(0, itemW - INDICATOR_INSET * 2);
  const glassBar = look.seeThrough && blurOn;

  const content = (
    <>
      <View
        pointerEvents="none"
        style={[styles.sheen, { backgroundColor: dark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.95)' }]}
      />
      <View style={styles.row} onLayout={(e) => setRowW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        {/* 选中胶囊: 透字模式下是半透明玻璃, 实底模式下是白色胶囊 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: pillW,
              backgroundColor: glassBar
                ? dark
                  ? 'rgba(255,255,255,0.16)'
                  : look.liquid
                    ? 'rgba(255,255,255,0.97)'
                    : 'rgba(255,255,255,0.50)'
                : dark
                  ? 'rgba(255,255,255,0.22)'
                  : 'rgba(255,255,255,0.94)',
              borderColor: dark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.96)',
              borderWidth: look.liquid ? 1.5 : 1,
              transform: [{ translateX: x }],
            },
          ]}>
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            style={styles.pillGloss}
            pointerEvents="none"
          />
        </Animated.View>
        {ITEMS.map((item, i) => {
          const on = i === activeIndex;
          return (
            <Pressable key={item.route} onPress={() => router.navigate(item.route as never)} style={styles.item}>
              <Ionicons name={(on ? item.active : item.icon) as never} size={24} color={on ? fgActive : fgDim} />
              <Text style={[styles.label, { color: on ? fgActive : fgDim }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.shadow}>
        {glassBar ? (
          <View
            style={[
              styles.pill,
              {
                borderColor: dark ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.90)',
              },
            ]}>
            {/* 真正的毛玻璃: 指向页面的 BlurTargetView, 背后内容被糊掉后从底栏透出来 */}
            <BlurView
              blurTarget={blurTarget ?? undefined}
              intensity={100}
              tint={dark ? 'dark' : 'extraLight'}
              blurMethod="dimezisBlurView"
              blurReductionFactor={3}
              style={StyleSheet.absoluteFill}
            />
            {/* 玻璃染色(拖动条调节浓度): 越低越透, 越高越接近奶白 */}
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(look.color, look.alpha) }]}
            />
            <LinearGradient
              colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0.16)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {content}
            <LinearGradient
              colors={['rgba(255,255,255,0.52)', 'rgba(255,255,255,0)']}
              style={styles.rimTop}
              pointerEvents="none"
            />
            <View pointerEvents="none" style={styles.bottomSheen} />
          </View>
        ) : (
          <View
            style={[
              styles.pill,
              {
                backgroundColor: withAlpha(look.color, 0.99),
                borderColor: dark ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.95)',
              },
            ]}>
            <LinearGradient
              colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0.16)']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {content}
            <LinearGradient
              colors={['rgba(255,255,255,0.40)', 'rgba(255,255,255,0)']}
              style={styles.rimTop}
              pointerEvents="none"
            />
            <View pointerEvents="none" style={styles.bottomSheen} />
          </View>
        )}
      </View>
    </View>
  );
}

/** 液态玻璃悬浮底栏为页面内容预留的底部高度(不含页面自身 padding) */
export function useGlassTabReserve(): number {
  const mode = useUiMode();
  const insets = useSafeAreaInsets();
  return mode === 'glass' || mode === 'night'
    ? GLASS_BAR_HEIGHT + GLASS_BAR_GAP + Math.max(insets.bottom, 10) + 16
    : 0;
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
          tabBarHidden={glass}
          translucent={glass}
          tabBarStyle={glass ? { backgroundColor: 'transparent' } : undefined}
          activeIndicatorColor={glass ? 'transparent' : undefined}
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
    left: GLASS_BAR_MARGIN,
    right: GLASS_BAR_MARGIN,
    zIndex: 100,
  },
  shadow: {
    borderRadius: GLASS_BAR_HEIGHT / 2,
  },
  pill: {
    height: GLASS_BAR_HEIGHT,
    borderRadius: GLASS_BAR_HEIGHT / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  /** 玻璃上缘折射: 让底栏和页面内容接触的地方"像泡在水里" */
  rimTop: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 16,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  bottomSheen: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  item: {
    flex: 1,
    height: GLASS_BAR_HEIGHT - INDICATOR_INSET * 2,
    borderRadius: (GLASS_BAR_HEIGHT - INDICATOR_INSET * 2) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  indicator: {
    position: 'absolute',
    left: INDICATOR_INSET,
    top: INDICATOR_INSET,
    bottom: INDICATOR_INSET,
    borderRadius: (GLASS_BAR_HEIGHT - INDICATOR_INSET * 2) / 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  /** 胶囊上缘的一层水光, 让选中态像一颗玻璃珠 */
  pillGloss: { position: 'absolute', top: 0, left: 8, right: 8, height: 18 },
  label: { fontSize: 11, fontWeight: '700' },
});
