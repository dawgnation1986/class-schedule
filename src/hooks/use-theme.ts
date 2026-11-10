/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, NightColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUiMode } from '@/hooks/use-ui-mode';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  // 墨夜模式下返回深色专用配色, 所有控件呈现墨夜质感
  const mode = useUiMode();

  return mode === 'night' ? NightColors : Colors[theme];
}
