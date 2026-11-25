/**
 * 墨夜标签栏: 原生导航器 (react-native-bottom-tabs: iOS SwiftUI TabView / Android Material 3)
 * 完全不经过 expo-router 内置的 JS 版 bottom-tabs —— 那条路径存在
 * "Invalid hook call" 崩溃, 是液态玻璃模式闪退的根因。
 *
 * 液态玻璃风格: 隐藏原生标签栏, 叠加一个悬浮胶囊玻璃底栏(自绘, 可随毛玻璃开关回退)。
 */
import { withLayoutContext, usePathname, useRouter } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useGlassSkin } from '@/hooks/use-glass-skin';
import { useNightGlass } from '@/hooks/use-night-glass';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

const ITEMS = [
  { route: '/home', label: '主站', icon: 'compass-outline', active: 'compass' },
  { route: '/timetable', label: '课表', icon: 'calendar-outline', active: 'calendar' },
  { route: '/profile', label: '我的', icon: 'person-outline', active: 'person' },
] as const;

/** 悬浮胶囊玻璃底栏: 与页面内容重叠, 圆角 31, 毛玻璃 + 高光描边 */
function GlassTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const blurOn = useNightGlass();
  const activeIndex = ITEMS.findIndex((i) => pathname === i.route || pathname.startsWith(`${i.route}/`));

  const content = (
    <>
      <View pointerEvents="none" style={styles.sheen} />
      {ITEMS.map((item, i) => {
        const on = i === activeIndex;
        return (
          <Pressable
            key={item.route}
            onPress={() => router.navigate(item.route as never)}
            style={[styles.item, on && styles.itemActive]}>
            <Ionicons
              name={(on ? item.active : item.icon) as never}
              size={20}
              color={on ? '#EAF3FF' : 'rgba(255,255,255,0.62)'}
            />
            <Text style={[styles.label, { color: on ? '#EAF3FF' : 'rgba(255,255,255,0.62)' }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </>
  );

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.shadow}>
        {blurOn ? (
          <BlurView intensity={65} tint="dark" blurMethod="dimezisBlurView" style={styles.pill}>
            {content}
          </BlurView>
        ) : (
          <View style={[styles.pill, styles.pillFallback]}>{content}</View>
        )}
      </View>
    </View>
  );
}

export default function NightTabs() {
  const glass = useGlassSkin();
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
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 24,
  },
  pill: {
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  pillFallback: { backgroundColor: 'rgba(24,31,52,0.86)' },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  item: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  label: { fontSize: 10.5, fontWeight: '700' },
});
