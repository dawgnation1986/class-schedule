/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { AzureColors, Colors, NightColors, SepiaColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePresetId } from '@/hooks/use-preset-id';
import { useUiMode } from '@/hooks/use-ui-mode';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  // 墨夜模式下返回深色专用配色, 所有控件呈现墨夜质感
  const mode = useUiMode();
  // 护眼米黄/淡雅蓝预设使用专属调色板
  const presetId = usePresetId();

  if (mode === 'night') return NightColors;
  if (presetId === 'sepia') return SepiaColors;
  if (presetId === 'azure') return AzureColors;
  return Colors[theme];
}
