import { Component, type ReactNode } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { usePageBackground } from '@/lib/background';
import { saveUiMode } from '@/lib/ui-mode';
import { useUiMode } from '@/hooks/use-ui-mode';
import NightTabs from '@/components/night-tabs';

/** 墨夜标签栏运行时出错时自动回退到原版 NativeTabs, 避免整个 App 闪退 */
class NightTabsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[NightTabs] crashed, fallback to native tabs:', err);
    // 自愈: 持久化回退到原版模式, 下次启动不再进入墨夜标签栏
    void saveUiMode('original');
  }
  render() {
    if (this.state.failed) return <NativeTabsFallback />;
    return this.props.children;
  }
}

function NativeTabsFallback() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  return (
    <NativeTabs
      backgroundColor={usePageBackground(colors)}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="home" contentStyle={{ backgroundColor: 'transparent' }}>
        <NativeTabs.Trigger.Label>主站</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/explore.png')} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="timetable" contentStyle={{ backgroundColor: 'transparent' }}>
        <NativeTabs.Trigger.Label>课表</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/home.png')} renderingMode="template" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" contentStyle={{ backgroundColor: 'transparent' }}>
        <NativeTabs.Trigger.Label>我的</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/person.png')} renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

export default function AppTabs() {
  const uiMode = useUiMode();

  // 墨夜模式: 原生标签栏(水滴动效指示器由系统提供)
  if (uiMode === 'night') {
    return <NightTabsBoundary><NightTabs /></NightTabsBoundary>;
  }

  return <NativeTabsFallback />;
}
