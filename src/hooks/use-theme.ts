/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { AzureColors, Colors, NightColors, SepiaColors, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePresetId } from '@/hooks/use-preset-id';
import { useUiMode } from '@/hooks/use-ui-mode';
import { CUSTOM_PALETTES, getAccentColor, getCustomHex, getCustomPaletteId, subscribeCustomPalette } from '@/lib/theme-preset';
import { useEffect, useState } from 'react';

function useCustomPaletteId() {
  const [id, setId] = useState(() => getCustomPaletteId());
  useEffect(() => subscribeCustomPalette(() => setId(getCustomPaletteId())), []);
  return id;
}

/** 订阅配色变更(主色/自定义 hex): 值变化时强制刷新, 避免 setState 相同值被 React 跳过 */
function useThemeTick() {
  const [, setTick] = useState(0);
  useEffect(() => subscribeCustomPalette(() => setTick((v) => v + 1)), []);
}

/** 控件主色 + 自定义 hex 配色合并结果 */
export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  // 墨夜模式下返回深色专用配色, 所有控件呈现墨夜质感
  const mode = useUiMode();
  // 护眼米黄/淡雅蓝预设使用专属调色板
  const presetId = usePresetId();
  // 自定义档下的自定义配色 + 控件主色
  const cpId = useCustomPaletteId();
  useThemeTick();

  if (mode === 'night') return NightColors;
  if (presetId === 'sepia') return SepiaColors;
  if (presetId === 'azure') return AzureColors;
  const base =
    presetId === 'custom' && cpId !== 'default'
      ? (() => {
          const def = CUSTOM_PALETTES.find((p) => p.id === cpId);
          return def ? { ...Colors[theme], ...(theme === 'dark' ? def.dark : def.light) } : Colors[theme];
        })()
      : Colors[theme];
  // 控件主色(全局按钮/链接)与自定义颜色覆盖(自定义档下可覆盖任意配色项)
  const hex = getCustomHex();
  return {
    ...base,
    ...(presetId === 'custom' ? hex : null),
    primary: getAccentColor(),
  } as Palette & { primary: string };
}
