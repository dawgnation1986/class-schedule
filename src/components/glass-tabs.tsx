/**
 * 液态玻璃标签栏: 磨砂玻璃浮层 + 水滴形态切换指示器
 * 切换 tab 时指示器像水滴一样拉伸、滑动、收拢, 并有一颗小水珠拖尾跟随
 */
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'compass',
  timetable: 'calendar',
  profile: 'person',
};
const LABELS: Record<string, string> = { home: '主站', timetable: '课表', profile: '我的' };

/** 水滴弹性: 快而略带过冲, 像水珠落定 */
const DROP_SPRING = { damping: 16, stiffness: 170, mass: 0.9 };
/** 拖尾水珠: 更慢更松, 制造「跟在后面飞」的液态感 */
const TRAIL_SPRING = { damping: 24, stiffness: 80, mass: 0.7 };

function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const colors = Colors[dark ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const barW = Math.min(width, 800) - 28;
  const count = state.routes.length;
  const segW = barW / count;
  const indW = Math.min(Math.max(segW * 0.56, 54), 78);

  // p: 当前选中 tab 的连续值(0..count-1), spring 过程会穿过小数值 → 用于拉伸形变
  const p = useSharedValue(state.index);
  // p2: 拖尾水珠的滞后值
  const p2 = useSharedValue(state.index);

  useEffect(() => {
    p.value = withSpring(state.index, DROP_SPRING);
    p2.value = withSpring(state.index, TRAIL_SPRING);
  }, [state.index, p, p2]);

  const toX = (v: number) => interpolate(v, [0, count - 1], [segW * 0.5, segW * (count - 0.5)]) - indW / 2;

  /** 指示器: 滑动时水平拉伸 + 垂直压缩, 像一滴被拉长的水 */
  const ind = useAnimatedStyle(() => {
    const frac = p.value - Math.round(p.value);
    const s = Math.min(Math.abs(frac), 0.5) * 0.55;
    return {
      transform: [
        { translateX: toX(p.value) },
        { scaleX: 1 + s },
        { scaleY: 1 - s * 0.5 },
      ],
    };
  });

  /** 拖尾小水珠: 慢半拍跟过来, 停稳后消失 */
  const drop = useAnimatedStyle(() => {
    const gap = Math.abs(p.value - p2.value);
    return {
      transform: [{ translateX: toX(p2.value) }],
      opacity: Math.min(gap * 3.2, 0.85),
    };
  });

  const line = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.65)';
  const indBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 8) }]}>
      <View style={[styles.bar, { width: barW, borderColor: line, backgroundColor: dark ? 'rgba(24,28,36,0.35)' : 'rgba(255,255,255,0.35)' }]}>
        {Platform.OS !== 'web' && (
          <BlurView
            intensity={Platform.OS === 'android' ? 60 : 45}
            tint={dark ? 'dark' : 'light'}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* 拖尾小水珠 */}
        <Animated.View pointerEvents="none" style={[styles.drop, drop, { backgroundColor: indBg }]} />
        {/* 水滴指示器 */}
        <Animated.View pointerEvents="none" style={[styles.ind, { width: indW, backgroundColor: indBg }, ind]} />
        {/* tab 项 */}
        <View style={styles.row}>
          {state.routes.map((route, i) => {
            const focused = state.index === i;
            return (
              <Pressable
                key={route.key}
                onPress={() => {
                  const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
                }}
                style={styles.item}>
                <Ionicons name={ICONS[route.name] ?? 'ellipse'} size={21} color={focused ? '#2563eb' : colors.textSecondary} />
                <Text style={[styles.label, { color: focused ? '#2563eb' : colors.textSecondary }]}>{LABELS[route.name] ?? route.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** 液态玻璃模式下的 Tab 容器(页面切换: 指示器水滴滑动 + 内容淡入) */
export default function GlassTabs() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        animation: 'fade',
      }}>
      <Tabs.Screen name="home" options={{ title: '主站' }} />
      <Tabs.Screen name="timetable" options={{ title: '课表' }} />
      <Tabs.Screen name="profile" options={{ title: '我的' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: {
    height: 64,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#1f4080',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  row: { flex: 1, flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, fontWeight: '600' },
  ind: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: 18,
    shadowColor: '#1f4080',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  drop: {
    position: 'absolute',
    top: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
