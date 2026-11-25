/**
 * iOS 液态玻璃底层: 放在任意卡片的第一个子节点, 自身绝对填满父容器。
 * - 原生 BlurView 实时模糊背后的壁纸
 * - 白色半透明染色 + 顶部 1px 高光 + 白色细描边
 * 只在「液态玻璃」模式且未关闭原生毛玻璃时渲染, 其他模式完全不占位、不影响布局。
 */
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { useUiMode } from '@/hooks/use-ui-mode';
import { useNightGlassDisabled } from '@/hooks/use-night-glass';

export const GLASS_LINE = 'rgba(255,255,255,0.62)';

export function GlassSurface({
  radius = 16,
  intensity = 48,
  tint = 'light',
  border = true,
}: {
  radius?: number;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  border?: boolean;
}) {
  const mode = useUiMode();
  const blurOff = useNightGlassDisabled();
  if (mode !== 'glass' || blurOff) return null;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <BlurView intensity={intensity} tint={tint} blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
      <View style={styles.sheen} />
      {border && (
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: GLASS_LINE }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheen: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
});
