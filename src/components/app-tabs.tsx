import { Component, useEffect, useState, type ReactNode } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { usePageBackground } from '@/lib/background';
import { saveUiMode } from '@/lib/ui-mode';
import { useUiModeState } from '@/hooks/use-ui-mode';
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
  const { mode, ready } = useUiModeState();
  const glass = mode === 'glass' || mode === 'night';

  /**
   * 导航器挂载状态机:
   * - pending: 模式还没从 AsyncStorage 读出来 → 只渲染空占位, 不挂载任何原生 Tabs
   * - original / glass: 已确认, 挂载对应导航器
   * 首次从 pending 进入时直接按已确认模式挂载(不做二次替换);
   * 运行期切换模式推迟到下一帧, 避免在原生选中事件同步派发过程中卸载 TabsHost
   * (否则触发 [RNScreens] TabsNavigationStateObserverRegistry.clear during emission)。
   */
  const [nav, setNav] = useState<'pending' | 'original' | 'glass'>('pending');

  useEffect(() => {
    if (!ready) return;
    const target = glass ? 'glass' : 'original';
    if (nav === 'pending') {
      setNav(target);
      return;
    }
    if (nav === target) return;
    const id = requestAnimationFrame(() => setNav(target));
    return () => cancelAnimationFrame(id);
  }, [ready, glass, nav]);

  if (nav === 'pending') return <View style={{ flex: 1 }} />;

  if (nav === 'glass') {
    return (
      <NightTabsBoundary>
        <NightTabs />
      </NightTabsBoundary>
    );
  }

  return <NativeTabsFallback />;
}
