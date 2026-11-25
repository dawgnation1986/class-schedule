/**
 * 墨夜控件库: 墨夜主题下的全套重绘控件
 * - NightGlowBackground  屏幕背景: 深空渐变 + 彩色光斑(iOS 26 液态玻璃底)
 * - NightCard            卡片: 真实毛玻璃(expo-blur) + 半透明暗色叠层 + 细描边
 * - NightPrimaryButton   主按钮: 蓝紫渐变 + 玻璃描边 + 按压缩放
 * - NightSectionHeader   分组标题: 渐变强调条 + 加粗标题
 *
 * 玻璃效果全部由 JS/StyleSheet 实现, 不引入原生模糊模块, 不会因此闪退。
 * 兼容模式(调试开关): 关闭「液态玻璃」后自动回退为实色深面板。
 */
import { type ReactNode, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import { useTheme } from '@/hooks/use-theme';
import { useNightGlass } from '@/hooks/use-night-glass';

export const NightTint = {
  blue: '#5B8CFF',
  violet: '#7B5BFF',
  glow: 'rgba(91,140,255,0.35)',
  line: 'rgba(255,255,255,0.15)',
  panel: '#151B2B',
  panelAlt: '#1A2236',
};

/** 屏幕背景: 深空渐变 + 彩色光斑, 玻璃卡片背后透出流动的色彩 */
export function NightGlowBackground({ children }: { children: ReactNode }) {
  const glass = useNightGlass();
  if (!glass) {
    return (
      <LinearGradient colors={['#101527', '#0B0E17']} style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={['rgba(91,140,255,0.16)', 'rgba(123,91,255,0.07)', 'transparent']}
          style={styles.glowTop}
        />
        {children}
      </LinearGradient>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['#0A0F1F', '#05070D', '#0B1020']} style={StyleSheet.absoluteFill} />
      {/* 多层低透明圆叠加, 不依赖模糊模块也能得到柔和的彩色辉光 */}
      <View pointerEvents="none" style={[styles.blob, styles.blobBlueOuter]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobBlueInner]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobVioletOuter]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobVioletInner]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobCyan]} />
      <LinearGradient
        colors={['rgba(160,190,255,0.16)', 'rgba(160,190,255,0.04)', 'transparent']}
        style={styles.glowTop}
      />
      {children}
    </View>
  );
}

/** 卡片: 液态玻璃(半透明面板 + 顶部高光 + 玻璃描边), 兼容模式为实色深面板 */
export function NightCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const glass = useNightGlass();
  if (!glass) {
    // 兼容模式: 不用原生模糊, 仅半透明深色面板(最稳, 不会因 BlurView 崩溃)
    return <View style={[styles.fallbackCard, style]}>{children}</View>;
  }
  return (
    <View style={[styles.glassShadow, style]}>
      <BlurView
        intensity={50}
        tint="dark"
        blurMethod="dimezisBlurView"
        style={styles.glassCard}>
        {/* 轻微暗色叠层, 保证文字可读性 */}
        <View pointerEvents="none" style={styles.glassTint} />
        {/* 顶部 1px 高光边 */}
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.glassEdge}
        />
        {children}
      </BlurView>
    </View>
  );
}

/** 主按钮: 蓝紫渐变 + 玻璃描边, 按压缩放反馈 */
export function NightPrimaryButton({
  title,
  onPress,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable onPress={press} disabled={disabled} style={[styles.btnWrap, disabled && styles.btnDisabled]}>
        <LinearGradient
          colors={disabled ? ['#3A4258', '#4A5068'] : [NightTint.blue, NightTint.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btnGrad}>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.28)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.btnText}>{title}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

/** 分组标题: 渐变强调条 + 加粗标题 */
export function NightSectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  const colors = useTheme();
  return (
    <View style={styles.secRow}>
      <LinearGradient
        colors={[NightTint.blue, NightTint.violet]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.secBar}
      />
      <Text style={[styles.secTitle, { color: colors.text }]}>{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  // —— 背景 ——
  glowTop: { position: 'absolute', top: -60, left: -40, right: -40, height: 260 },
  blob: { position: 'absolute', borderRadius: 999 },
  blobBlueOuter: { width: 560, height: 560, top: -260, left: -220, backgroundColor: 'rgba(48,110,255,0.10)' },
  blobBlueInner: { width: 300, height: 300, top: -130, left: -90, backgroundColor: 'rgba(76,132,255,0.12)' },
  blobVioletOuter: { width: 480, height: 480, top: 150, right: -240, backgroundColor: 'rgba(140,80,255,0.09)' },
  blobVioletInner: { width: 260, height: 260, top: 240, right: -120, backgroundColor: 'rgba(152,92,255,0.11)' },
  blobCyan: { width: 460, height: 460, bottom: -240, left: 30, backgroundColor: 'rgba(0,190,255,0.06)' },

  // —— 玻璃卡片 ——
  glassShadow: {
    borderRadius: 22,
    shadowColor: '#020617',
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  glassCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  glassTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,18,32,0.30)',
  },
  glassEdge: { position: 'absolute', top: 0, left: 14, right: 14, height: 1 },

  // —— 兼容模式(无原生模糊) ——
  fallbackCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(18,24,40,0.88)',
    shadowColor: '#020617',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    overflow: 'hidden',
  },

  // —— 按钮 ——
  btnWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    shadowColor: '#4C7BFF',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  btnGrad: { paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, letterSpacing: 1 },

  secRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 },
  secBar: { width: 4, height: 16, borderRadius: 2 },
  secTitle: { fontWeight: '800', fontSize: 15 },
});
