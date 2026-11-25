import { useEffect, useState } from 'react';

import { isGlassSkin, subscribeGlassSkin } from '@/lib/glass-skin';

/** 是否处于液态玻璃风格(true 时墨夜布局使用原生毛玻璃渲染) */
export function useGlassSkin(): boolean {
  const [on, setOn] = useState(isGlassSkin());
  useEffect(() => subscribeGlassSkin(() => setOn(isGlassSkin())), []);
  return on;
}
