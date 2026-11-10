/**
 * 墨夜控件库: 墨夜主题下的全套重绘控件
 * - NightGlowBackground  屏幕背景: 深空渐变 + 顶部蓝紫辉光
 * - NightCard            卡片: 实色深面板 + 发光描边 + 顶部渐变光线 + 层叠投影
 * - NightPrimaryButton   主按钮: 蓝紫渐变 + 辉光投影 + 按压缩放(RN Animated, 无 reanimated)
 * - NightSectionHeader   分组标题: 渐变强调条 + 加粗标题
 *
 * 设计原则: 不使用半透明磨砂, 全部实色 + 光效, 任何设备零原生崩溃风险。
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

import { useTheme } from '@/hooks/use-theme';

export const NightTint = {
  blue: '#5B8CFF',
  violet: '#7B5BFF',
  glow: 'rgba(91,140,255,0.35)',
  line: 'rgba(146,166,255,0.12)',
  panel: '#151B2B',
  panelAlt: '#1A2236',
};

/** 屏幕背景: 深空渐变 + 顶部辉光, 替代纯色背景 */
export function NightGlowBackground({ children }: { children: ReactNode }) {
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

/** 卡片: 墨夜重绘, 顶部渐变光线 + 发光描边 + 层叠投影 */
export function NightCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
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

/** 主按钮: 蓝紫渐变 + 辉光, 按压缩放反馈 */
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
  glowTop: { position: 'absolute', top: -60, left: -40, right: -40, height: 260 },
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
  btnWrap: { borderRadius: 16, overflow: 'hidden' },
  btnDisabled: { opacity: 0.6 },
  btnGrad: { paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, letterSpacing: 1 },
  secRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 },
  secBar: { width: 4, height: 16, borderRadius: 2 },
  secTitle: { fontWeight: '800', fontSize: 15 },
});
