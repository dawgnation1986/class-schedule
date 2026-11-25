import { useEffect, useState } from 'react';

import { getTabBarLook, subscribeTabBarLook, type TabBarLook } from '@/lib/tab-bar-style';

export function useTabBarLook(): TabBarLook {
  const [look, setLook] = useState(getTabBarLook());
  useEffect(() => subscribeTabBarLook(() => setLook(getTabBarLook())), []);
  return look;
}
