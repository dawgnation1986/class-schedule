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
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiMode } from '@/hooks/use-ui-mode';
import { useNightGlass } from '@/hooks/use-night-glass';

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
  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((i) => pathname === i.route || pathname.startsWith(`${i.route}/`)),
  );

  // 段宽实测, 指示器按像素滑动
  const [rowW, setRowW] = useState(0);
  const itemW = rowW / ITEMS.length;

  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const x2 = useRef(new Animated.Value(0)).current;
  const op2 = useRef(new Animated.Value(0)).current;
  const barPop = useRef(new Animated.Value(1)).current;
  const lastX = useRef(0);

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
      <View pointerEvents="none" style={styles.sheen} />
      <View style={styles.row} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
        {/* 拖尾水珠 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.trail,
            { width: Math.max(0, itemW - 8), opacity: op2, transform: [{ translateX: x2 }] },
          ]}
        />
        {/* 水滴指示器 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { width: Math.max(0, itemW - 8), transform: [{ translateX: x }, { scaleX }, { scaleY }] },
          ]}
        />
        {ITEMS.map((item, i) => {
          const on = i === activeIndex;
          return (
            <Pressable key={item.route} onPress={() => router.navigate(item.route as never)} style={styles.item}>
              <Ionicons name={(on ? item.active : item.icon) as never} size={20} color={on ? '#2563EB' : 'rgba(30,41,59,0.50)'} />
              <Text style={[styles.label, { color: on ? '#2563EB' : 'rgba(30,41,59,0.50)' }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 10) }]}>
      <Animated.View style={[styles.shadow, { transform: [{ scale: barPop }] }]}>
        {blurOn ? (
          <BlurView intensity={70} tint="light" blurMethod="dimezisBlurView" style={styles.pill}>
            {content}
          </BlurView>
        ) : (
          <View style={[styles.pill, styles.pillFallback]}>{content}</View>
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
  const reserve = glass ? 62 + Math.max(insets.bottom, 10) + 8 : 0;
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
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  pillFallback: { backgroundColor: 'rgba(255,255,255,0.88)' },
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
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  indicator: {
    position: 'absolute',
    left: 4,
    top: 7,
    bottom: 7,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.78)',
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
    top: 14,
    height: 34,
    borderRadius: 18,
    backgroundColor: 'rgba(120,190,255,0.55)',
  },
  label: { fontSize: 10.5, fontWeight: '700' },
});
