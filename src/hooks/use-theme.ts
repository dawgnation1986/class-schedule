/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, GlassColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUiMode } from '@/hooks/use-ui-mode';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  // 液态玻璃模式下返回半透明玻璃配色, 全部控件统一呈现玻璃质感
  const mode = useUiMode();

  return (mode === 'glass' ? GlassColors : Colors)[theme];
}
