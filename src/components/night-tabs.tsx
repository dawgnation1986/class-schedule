/**
 * 液态玻璃标签栏 (诊断版: 只保留真实模糊 + 图标文字)
 *
 * 关键结构修正:
 * 1) 原生导航器 (react-native-bottom-tabs) 不支持 tabBarHidden, 之前原生白色底栏一直露着,
 *    现在用该库真正支持的 tabBar={() => null} 把它彻底关掉。
 * 2) 之前底栏自己又套了一层 BlurTargetView 只包住 <Tabs>, 而三个页面场景是透明背景,
 *    真正的壁纸/页面内容在根布局那一层 → 采样到的是"空", 所以只剩 BlurView 的白膜 = 白板。
 *    现在底栏渲染在根布局、根 BlurTargetView 之外, 直接采样根(壁纸 + 页面内容)。
 * 3) 诊断阶段底栏内部没有任何底色/描边/高光/胶囊, 只有 BlurView + 图标文字。
 */
import { withLayoutContext, usePathname, useRouter } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiMode } from '@/hooks/use-ui-mode';
import { useNightGlass } from '@/hooks/use-night-glass';
import { useBlurTarget } from '@/components/glass-surface';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

/** 胶囊高度 */
const BAR_H = 76;

const ITEMS = [
  { route: '/home', label: '主站', icon: 'compass-outline', active: 'compass' },
  { route: '/timetable', label: '课表', icon: 'calendar-outline', active: 'calendar' },
  { route: '/profile', label: '我的', icon: 'person-outline', active: 'person' },
] as const;

/**
 * 悬浮玻璃底栏: 渲染在根布局 (_layout.tsx) 里、根 BlurTargetView 之外。
 * 这样 BlurView 采样的就是真正的背景(壁纸 + 页面内容), 而不是被自己包含进去死循环。
 */
export function GlassTabBarOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const mode = useUiMode();
  const blurOn = useNightGlass();
  const blurTarget = useBlurTarget();

  const isTab = ITEMS.some((i) => pathname === i.route || pathname.startsWith(`${i.route}/`));
  const activeIndex = Math.max(
    0,
    ITEMS.findIndex((i) => pathname === i.route || pathname.startsWith(`${i.route}/`)),
  );

  if ((mode !== 'glass' && mode !== 'night') || !isTab) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 10) }]}>
      <BlurView
        blurTarget={blurTarget ?? undefined}
        intensity={blurOn ? 40 : 0}
        tint="default"
        blurMethod="dimezisBlurView"
        blurReductionFactor={1}
        style={styles.bar}>
        <View style={styles.row}>
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
                  color={on ? '#2563EB' : 'rgba(30,41,59,0.50)'}
                />
                <Text style={[styles.label, { color: on ? '#2563EB' : 'rgba(30,41,59,0.50)' }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
    // 诊断阶段: 没有背景色 / 没有描边 / 没有高光
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  item: {
    flex: 1,
    height: BAR_H - 10,
    borderRadius: (BAR_H - 10) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  label: { fontSize: 11, fontWeight: '600' },
});
