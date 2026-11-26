/**
 * 底部导航容器: 全 App 只使用「同一个」原生导航器(bottom-tabs)。
 *
 * 为什么不再按模式切换两套导航器:
 * 冷启动日志里的
 *   java.lang.IllegalStateException: [RNScreens] TabsNavigationStateObserverRegistry.clear during emission
 * 就是「原生 TabsHost 在首次选中事件派发期间被卸载」造成的。只要在运行时卸载/重建原生
 * TabsHost, 无论延迟一帧还是十帧, 都可能落进同一窗口。所以现在:
 *   - 导航器永远只有一个, 不随模式变化卸载;
 *   - 原版模式 = 显示系统原生 TabBar;
 *   - 液态玻璃模式 = tabBar={() => null} 隐藏原生栏, 只叠加悬浮玻璃层。
 * 切换模式只改一个 prop, 不销毁原生导航宿主。
 */
import { Component, type ReactNode } from 'react';
import { View } from 'react-native';

import { saveUiMode } from '@/lib/ui-mode';
import { useUiModeState } from '@/hooks/use-ui-mode';
import NightTabs from '@/components/night-tabs';

/** 玻璃底栏运行时出现 JS 异常时, 只回退到"原版模式"(同一个导航器, 不重建) */
class NightTabsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[NightTabs] crashed, fallback to native tab bar:', err);
    void saveUiMode('original');
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function AppTabs() {
  const { ready } = useUiModeState();
  // 模式没读出来之前不挂载原生导航器(也避免首帧按默认值挂载后再重建)
  if (!ready) return <View style={{ flex: 1 }} />;
  return (
    <NightTabsBoundary>
      <NightTabs />
    </NightTabsBoundary>
  );
}
