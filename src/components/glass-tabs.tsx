/**
 * 液态玻璃标签栏: 磨砂玻璃浮层 + 水滴形态切换指示器
 * 切换 tab 时指示器像水滴一样拉伸、滑动、收拢, 并有一颗小水珠拖尾跟随
 *
 * 稳定性说明: 动画全部使用 RN 内置 Animated(JS 线程驱动, useNativeDriver),
 * 不使用 reanimated worklet —— 规避 UI 线程崩溃(ErrorBoundary 拦不住那种)。
 */
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

  // 指示器目标 X: 居中于第 index 段
  const targetX = (i: number) => segW * i + segW / 2 - indW / 2;

  // 主指示器位移 + 水滴拉伸(0..1: 拉伸程度)
  const x = useRef(new Animated.Value(targetX(state.index))).current;
  const stretch = useRef(new Animated.Value(0)).current;
  // 拖尾小水珠: 位移慢半拍 + 透明度
  const x2 = useRef(new Animated.Value(targetX(state.index))).current;
  const op2 = useRef(new Animated.Value(0)).current;
  // 上一次落点, 供拖尾从旧位置出发
  const lastX = useRef(targetX(state.index));

  useEffect(() => {
    const tx = targetX(state.index);
    // 拖尾水珠: 从旧位置慢速跟来, 到达后淡出
    op2.setValue(0.85);
    x2.setValue(lastX.current);
    // 指示器: 快速滑动 + 拉伸形变(先拉长, 落定时回弹收拢)
    Animated.parallel([
      Animated.spring(x, { toValue: tx, friction: 7, tension: 170, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 0, friction: 5, tension: 80, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.spring(x2, { toValue: tx, friction: 9, tension: 55, useNativeDriver: true, delay: 90 }),
        Animated.timing(op2, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    ]).start();
    lastX.current = tx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index]);

  const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });

  const line = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.65)';
  const indBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';
  const barBg = dark ? 'rgba(24,28,36,0.78)' : 'rgba(255,255,255,0.72)';

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 8) }]}>
      <View style={[styles.bar, { width: barW, borderColor: line, backgroundColor: barBg }]}>
        {/* 拖尾小水珠 */}
        <Animated.View
          pointerEvents="none"
          style={[styles.drop, { backgroundColor: indBg, opacity: op2 }, { transform: [{ translateX: x2 }] }]}
        />
        {/* 水滴指示器 */}
        <Animated.View
          pointerEvents="none"
          style={[styles.ind, { width: indW, backgroundColor: indBg }, { transform: [{ translateX: x }, { scaleX }, { scaleY }] }]}
        />
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
                <Text style={[styles.label, { color: focused ? '#2563eb' : colors.textSecondary }]}>
                  {LABELS[route.name] ?? route.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** 模块级包装, 保证 tabBar 组件身份稳定(避免每次渲染重挂载) */
function TabBarAdapter(props: Parameters<typeof GlassTabBar>[0]) {
  return <GlassTabBar {...props} />;
}

/** 液态玻璃模式下的 Tab 容器(页面切换: 指示器水滴滑动 + 内容淡入) */
export default function GlassTabs() {
  return (
    <Tabs
      tabBar={TabBarAdapter}
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
