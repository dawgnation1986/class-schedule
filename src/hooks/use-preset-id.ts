/** 主题预设档位订阅 Hook */
import { useEffect, useState } from 'react';

import { getPresetId, subscribePreset, type PresetId } from '@/lib/theme-preset';

export function usePresetId(): PresetId {
  const [id, setId] = useState<PresetId>(() => getPresetId());
  useEffect(() => subscribePreset(() => setId(getPresetId())), []);
  return id;
}
