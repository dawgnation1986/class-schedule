/**
 * iOS 液态玻璃底层: 放在任意卡片的第一个子节点, 自身绝对填满父容器。
 * - 原生 BlurView 实时模糊背后的壁纸
 * - 白色半透明染色 + 顶部 1px 高光 + 白色细描边
 * 只在「液态玻璃」模式且未关闭原生毛玻璃时渲染, 其他模式完全不占位、不影响布局。
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { useUiMode } from '@/hooks/use-ui-mode';
import { useNightGlassDisabled } from '@/hooks/use-night-glass';

/**
 * 弹窗遮罩的整屏模糊: 液态玻璃模式下让背后的页面"糊掉", 文字不再和弹窗抢焦点。
 * 放在 Modal 遮罩层里当第一个子节点。
 */
export function MaskBlur({ intensity = 20, tint = 'dark' }: { intensity?: number; tint?: 'light' | 'dark' | 'default' }) {
  const mode = useUiMode();
  const blurOff = useNightGlassDisabled();
  if (mode !== 'glass' || blurOff) return null;
  return (
    <BlurView intensity={intensity} tint={tint} blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
  );
}

export const GLASS_LINE = 'rgba(255,255,255,0.62)';

/**
 * 弹窗 / 下拉面板的亚克力底: 模糊背后内容 + 高不透明度白底。
 * 直接当面板的第一个子节点使用, 面板自身不要再叠低 alpha 的背景色。
 */
export function AcrylicPanel({
  radius = 16,
  intensity = 60,
  style,
  children,
  onPress,
}: {
  radius?: number;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** 传了就渲染成 Pressable(用于吞掉点击, 避免点面板内部就关闭弹窗) */
  onPress?: () => void;
}) {
  const mode = useUiMode();
  const blurOff = useNightGlassDisabled();
  const on = mode === 'glass' && !blurOff;
  const merged = [
    style,
    { borderRadius: radius },
    on && {
      backgroundColor: 'rgba(255,255,255,0.86)',
      borderWidth: 1,
      borderColor: GLASS_LINE,
      overflow: 'hidden' as const,
    },
  ];
  const inner = (
    <>
      {on && <GlassSurface radius={radius} intensity={intensity} />}
      {children}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={merged}>
        {inner}
      </Pressable>
    );
  }
  return <View style={merged}>{inner}</View>;
}

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
