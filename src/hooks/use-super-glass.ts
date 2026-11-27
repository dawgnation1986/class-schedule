/** SuperGlass 开关的订阅 Hook */
import { useEffect, useState } from 'react';

import { isSuperGlass, subscribeSuperGlass } from '@/lib/super-glass';

export function useSuperGlass(): boolean {
  const [on, setOn] = useState(() => isSuperGlass());
  useEffect(() => subscribeSuperGlass(() => setOn(isSuperGlass())), []);
  return on;
}
