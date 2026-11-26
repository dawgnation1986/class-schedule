/**
 * 墨夜 / 液态玻璃控件库(共用一套布局)
 * - 墨夜主题: 实色深色面板 + 蓝紫强调条
 * - 液态玻璃: iOS 26 风格原生毛玻璃(expo-blur) + 彩色流光背景 + 玻璃描边
 *
 * 两套风格由「液态玻璃」开关决定, 布局、位置、尺寸完全一致。
 * 毛玻璃可由调试开关关闭(回退为无原生模糊的半透明面板), 不会因此闪退。
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
import { useBlurTarget } from '@/components/glass-surface';
import { useGlassSkin } from '@/hooks/use-glass-skin';

export const NightTint = {
  blue: '#5B8CFF',
  violet: '#7B5BFF',
  glow: 'rgba(91,140,255,0.35)',
  line: 'rgba(255,255,255,0.15)',
  panel: '#151B2B',
  panelAlt: '#1A2236',
};

/** 屏幕背景: 墨夜为深空渐变; 液态玻璃为彩色流光(让毛玻璃有可折射的内容) */
export function NightGlowBackground({ children }: { children: ReactNode }) {
  const glassSkin = useGlassSkin();
  if (!glassSkin) {
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
      <LinearGradient
        colors={['#16224A', '#3A2060', '#0E1A38', '#24123A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* 多层低透明圆叠加, 形成柔和的彩色流光背景 */}
      <View pointerEvents="none" style={[styles.blob, styles.blobBlueOuter]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobBlueInner]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobPinkOuter]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobPinkInner]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobCyan]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobViolet]} />
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.05)', 'transparent']}
        style={styles.glowTop}
      />
      {children}
    </View>
  );
}

/** 卡片: 液态玻璃下为真实毛玻璃, 墨夜下为实色深面板 */
export function NightCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const glassSkin = useGlassSkin();
  const blurOn = useNightGlass();
  const blurTarget = useBlurTarget();

  if (!glassSkin) {
    return (
      <View style={[styles.cardShadow, style]}>
        <View style={styles.card}>
          <LinearGradient
            colors={[NightTint.blue, NightTint.violet, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.hairline}
          />
          {children}
        </View>
      </View>
    );
  }

  if (!blurOn) {
    // 兼容模式: 无原生模糊, 仅半透明玻璃色面板
    return <View style={[styles.glassFallback, style]}>{children}</View>;
  }

  return (
    <View style={[styles.glassShadow, style]}>
      <BlurView blurTarget={blurTarget ?? undefined} intensity={48} tint="dark" blurMethod="dimezisBlurView" style={styles.glassCard}>
        <View pointerEvents="none" style={styles.glassTint} />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
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
  blobBlueOuter: { width: 620, height: 620, top: -280, left: -240, backgroundColor: 'rgba(70,130,255,0.20)' },
  blobBlueInner: { width: 340, height: 340, top: -140, left: -100, backgroundColor: 'rgba(90,150,255,0.22)' },
  blobPinkOuter: { width: 520, height: 520, top: 120, right: -260, backgroundColor: 'rgba(255,90,160,0.13)' },
  blobPinkInner: { width: 280, height: 280, top: 220, right: -130, backgroundColor: 'rgba(255,110,180,0.16)' },
  blobCyan: { width: 520, height: 520, bottom: -280, left: 10, backgroundColor: 'rgba(0,210,255,0.10)' },
  blobViolet: { width: 400, height: 400, bottom: -160, right: -140, backgroundColor: 'rgba(160,90,255,0.14)' },

  // —— 液态玻璃卡片 ——
  glassShadow: {
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  glassCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  glassTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(16,22,40,0.22)',
  },
  glassEdge: { position: 'absolute', top: 0, left: 16, right: 16, height: 1 },
  glassFallback: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(26,34,58,0.72)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },

  // —— 墨夜实色卡片 ——
  cardShadow: {
    borderRadius: 20,
    backgroundColor: NightTint.panel,
    shadowColor: '#5B8CFF',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: NightTint.line,
    backgroundColor: NightTint.panel,
    overflow: 'hidden',
  },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.8 },

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
