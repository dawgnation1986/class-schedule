/**
 * 液态玻璃标签栏
 * 用原生导航器实现 (react-native-bottom-tabs: iOS SwiftUI TabView / Android Material 3),
 * 完全不经过 expo-router 内置的 JS 版 bottom-tabs —— 那条路径存在
 * "Invalid hook call" 崩溃, 这就是液态玻璃模式闪退的根因。
 * 安卓: 半透明 + 高光着色的玻璃质感; iOS 26: 系统原生标签栏。
 */
import { withLayoutContext } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';

import { useTheme } from '@/hooks/use-theme';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

export default function GlassTabs() {
  // 玻璃模式下 useTheme 返回半透明玻璃配色, 标签栏随之呈现玻璃质感
  const colors = useTheme();

  return (
    <Tabs
      tabBarActiveTintColor="#1a6dff"
      tabBarInactiveTintColor={colors.textSecondary}
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
  );
}
