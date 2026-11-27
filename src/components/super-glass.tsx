/**
 * SuperGlass 材质层: 更厚实的液态玻璃(多层高光 + 双描边 + 斜向光斑)
 *
 * 用法与 GlassSurface 一致 —— 放进绝对定位容器里当作某块控件的"玻璃底":
 *   <View style={styles.card}>
 *     <SuperGlass radius={14} />
 *     ...内容
 *   </View>
 *
 * - SuperGlass 开启且处于液态玻璃界面模式时才渲染, 否则返回 null(不影响原版界面)
 * - 刻意不用 BlurView: expo-blur 的 BlurView 在弹窗(Modal 独立 window)里指向主 window 的
 *   BlurTargetView 会在 onAttachedToWindow 里抛 BlurViewConfigurationException 直接闪退
 *   (1.19.30 的崩溃就是这么来的)。这里只用纯 view 叠层做玻璃质感, 零原生风险。
 * - 与普通卡片(GlassSurface, 12% 白 + 模糊)相比: 边缘更亮更厚、多了斜向光斑和内折光环,
 *   看起来是"一块厚玻璃"而不是一层白膜。
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useSuperGlass } from '@/hooks/use-super-glass';
import { useUiMode } from '@/hooks/use-ui-mode';

type Props = {
  radius?: number;
  /** 玻璃染色; 默认很淡, 让背后内容透出来 */
  tint?: string;
  style?: StyleProp<ViewStyle>;
};

export function SuperGlass({ radius = 16, tint = 'rgba(255,255,255,0.10)', style }: Props) {
  const on = useSuperGlass();
  const mode = useUiMode();
  if (!on || mode !== 'glass') return null;

  const inset = Math.max(6, radius * 0.5);

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: radius, overflow: 'hidden' },
        style,
      ]}>
      {/* 主体染色 */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      {/* 冷白偏蓝的玻璃色 */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(198,220,255,0.12)' }]} />
      {/* 斜向光斑(液态玻璃的"流动感") */}
      <View
        style={{
          position: 'absolute',
          top: -radius * 1.6,
          left: -radius * 0.4,
          width: radius * 3.2,
          height: radius * 2.2,
          borderRadius: radius,
          backgroundColor: 'rgba(255,255,255,0.18)',
          transform: [{ rotate: '-22deg' }],
        }}
      />
      {/* 底部折光带(厚玻璃的透镜感) */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: radius * 0.9,
          backgroundColor: 'rgba(255,255,255,0.10)',
        }}
      />
      {/* 顶部高光 */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: inset,
          right: inset,
          height: 1.5,
          backgroundColor: 'rgba(255,255,255,0.95)',
        }}
      />
      {/* 底部反光 */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: inset,
          right: inset,
          height: 1,
          backgroundColor: 'rgba(255,255,255,0.50)',
        }}
      />
      {/* 外描边 */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.80)' },
        ]}
      />
      {/* 内圈(厚玻璃的折光边) */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: Math.max(1, radius - 2),
            margin: 2,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.36)',
          },
        ]}
      />
    </View>
  );
}

/** 给按钮/返回键用的小圆角玻璃(胶囊) */
export function SuperGlassPill({
  height = 34,
  tint,
  style,
}: {
  height?: number;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <SuperGlass radius={height / 2} tint={tint ?? 'rgba(255,255,255,0.16)'} style={style} />;
}
