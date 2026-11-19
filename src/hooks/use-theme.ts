/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { AzureColors, Colors, NightColors, SepiaColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePresetId } from '@/hooks/use-preset-id';
import { useUiMode } from '@/hooks/use-ui-mode';
import { CUSTOM_PALETTES, getCustomPaletteId, subscribeCustomPalette } from '@/lib/theme-preset';
import { useEffect, useState } from 'react';

function useCustomPaletteId() {
  const [id, setId] = useState(() => getCustomPaletteId());
  useEffect(() => subscribeCustomPalette(() => setId(getCustomPaletteId())), []);
  return id;
}

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  // 墨夜模式下返回深色专用配色, 所有控件呈现墨夜质感
  const mode = useUiMode();
  // 护眼米黄/淡雅蓝预设使用专属调色板
  const presetId = usePresetId();
  // 自定义档下的自定义配色
  const cpId = useCustomPaletteId();

  if (mode === 'night') return NightColors;
  if (presetId === 'sepia') return SepiaColors;
  if (presetId === 'azure') return AzureColors;
  if (presetId === 'custom' && cpId !== 'default') {
    const def = CUSTOM_PALETTES.find((p) => p.id === cpId);
    if (def) return { ...Colors[theme], ...(theme === 'dark' ? def.dark : def.light) };
  }
  return Colors[theme];
}
