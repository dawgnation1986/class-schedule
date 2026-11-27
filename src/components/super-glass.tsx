/**
 * SuperGlass 材质层: 更厚实的液态玻璃(真模糊 + 多层高光/双描边)
 *
 * 用法与 GlassSurface 一致 —— 放进绝对定位容器里当作某块控件的"玻璃底":
 *   <View style={styles.card}>
 *     <SuperGlass radius={14} />
 *     ...内容
 *   </View>
 *
 * - SuperGlass 开启且处于液态玻璃界面模式时才渲染, 否则返回 null(不影响原版界面)
 * - 与普通卡片(GlassSurface, 12% 白 + 中等模糊)相比刻意做了区分: 模糊更重, 多了斜向光斑、
 *   顶部高光、双描边和内圈, 看起来是"一块厚玻璃"而不是一层白膜
 * - 关闭原生毛玻璃时退化为纯高光层, 仍然比普通卡片更像玻璃
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

import { useBlurTarget } from '@/components/glass-surface';
import { useNightGlassDisabled } from '@/hooks/use-night-glass';
import { useSuperGlass } from '@/hooks/use-super-glass';
import { useUiMode } from '@/hooks/use-ui-mode';

type Props = {
  radius?: number;
  /** 玻璃染色; 默认几乎透明, 让背后内容真正透出来 */
  tint?: string;
  style?: StyleProp<ViewStyle>;
};

export function SuperGlass({ radius = 16, tint = 'rgba(255,255,255,0.06)', style }: Props) {
  const on = useSuperGlass();
  const mode = useUiMode();
  const blurOff = useNightGlassDisabled();
  const target = useBlurTarget();
  if (!on || mode !== 'glass') return null;

  const wrap: StyleProp<ViewStyle> = [
    StyleSheet.absoluteFill,
    { borderRadius: radius, overflow: 'hidden' },
    style,
  ];
  const inset = Math.max(6, radius * 0.5);

  return (
    <View pointerEvents="none" style={wrap}>
      {/* 重模糊: 比普通卡片(48)重得多, 背后内容被揉开但仍透出来 */}
      {!blurOff && (
        <BlurView
          blurTarget={target ?? undefined}
          intensity={92}
          tint="light"
          blurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
      )}
      {/* 冷白染色 */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(198,220,255,0.10)' }]} />
      {/* 斜向光斑(液态玻璃的"流动感") */}
      <View
        style={{
          position: 'absolute',
          top: -radius * 1.6,
          left: -radius * 0.4,
          width: radius * 3.2,
          height: radius * 2.2,
          borderRadius: radius,
          backgroundColor: 'rgba(255,255,255,0.16)',
          transform: [{ rotate: '-22deg' }],
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
          backgroundColor: 'rgba(255,255,255,0.45)',
        }}
      />
      {/* 外描边 */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, borderWidth: 1, borderColor: 'rgba(255,255,255,0.78)' },
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
            borderColor: 'rgba(255,255,255,0.34)',
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
  return <SuperGlass radius={height / 2} tint={tint ?? 'rgba(255,255,255,0.14)'} style={style} />;
}
