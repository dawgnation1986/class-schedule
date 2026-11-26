/** 界面模式订阅 Hook: 'original' | 'glass' */
import { useEffect, useState } from 'react';

import { getUiMode, isUiModeReady, subscribeUiMode, type UiMode } from '@/lib/ui-mode';

export function useUiMode(): UiMode {
  const [mode, setMode] = useState<UiMode>(() => getUiMode());
  useEffect(() => subscribeUiMode(() => setMode(getUiMode())), []);
  return mode;
}

/**
 * 同时订阅"模式"和"是否初始化完成"。
 * 初始化完成前 ready=false, 调用方不得挂载原生导航器, 否则会出现
 * 旧 TabsHost 在首次选中事件发送期间被卸载 → TabsNavigationStateObserverRegistry.clear 崩溃。
 */
export function useUiModeState(): { mode: UiMode; ready: boolean } {
  const [state, setState] = useState(() => ({ mode: getUiMode(), ready: isUiModeReady() }));
  useEffect(
    () => subscribeUiMode(() => setState({ mode: getUiMode(), ready: isUiModeReady() })),
    [],
  );
  return state;
}
