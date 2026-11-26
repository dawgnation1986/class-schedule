/** 界面模式订阅 Hook: 'original' | 'glass' */
import { useEffect, useState } from 'react';

import { getUiMode, subscribeUiMode, type UiMode } from '@/lib/ui-mode';

export function useUiMode(): UiMode {
  const [mode, setMode] = useState<UiMode>(() => getUiMode());
  useEffect(() => subscribeUiMode(() => setMode(getUiMode())), []);
  return mode;
}
