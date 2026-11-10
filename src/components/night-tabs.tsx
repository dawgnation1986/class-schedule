/**
 * 墨夜标签栏: 原生导航器 (react-native-bottom-tabs: iOS SwiftUI TabView / Android Material 3)
 * 完全不经过 expo-router 内置的 JS 版 bottom-tabs —— 那条路径存在
 * "Invalid hook call" 崩溃, 是液态玻璃模式闪退的根因。
 */
import { withLayoutContext } from 'expo-router';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

export default function NightTabs() {
  return (
    <Tabs
      tabBarActiveTintColor="#5B8CFF"
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
