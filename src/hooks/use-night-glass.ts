import { useEffect, useState } from 'react';

import { isNightGlassDisabled, subscribeNightGlass } from '@/lib/night-glass';

/** 墨夜毛玻璃是否开启(true = 液态玻璃, false = 实色兼容模式) */
export function useNightGlass(): boolean {
  const [off, setOff] = useState(isNightGlassDisabled());
  useEffect(() => subscribeNightGlass(() => setOff(isNightGlassDisabled())), []);
  return !off;
}

export function useNightGlassDisabled(): boolean {
  const [off, setOff] = useState(isNightGlassDisabled());
  useEffect(() => subscribeNightGlass(() => setOff(isNightGlassDisabled())), []);
  return off;
}
