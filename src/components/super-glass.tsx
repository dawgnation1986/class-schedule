/**
 * SuperGlass 材质层: 原生 Android 液态玻璃(expo-android-glass-view)
 *
 * 用法与 GlassSurface 一致 —— 放进绝对定位容器里当作某块控件的"玻璃底":
 *   <View style={styles.card}>
 *     <SuperGlass radius={14} />
 *     ...内容
 *   </View>
 *
 * - SuperGlass 开启且处于液态玻璃界面模式时才渲染, 否则返回 null(不影响原版界面)
 * - iOS/低版本 Android 用半透明 View 兜底, 不留空白
 */
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AndroidGlassView } from 'expo-android-glass-view';

import { useSuperGlass } from '@/hooks/use-super-glass';
import { useUiMode } from '@/hooks/use-ui-mode';

type Props = {
  radius?: number;
  /** 玻璃染色; 默认几乎透明, 让背后内容真正透出来 */
  tint?: string;
  style?: StyleProp<ViewStyle>;
};

export function SuperGlass({ radius = 16, tint = 'rgba(255,255,255,0.08)', style }: Props) {
  const on = useSuperGlass();
  const mode = useUiMode();
  if (!on || mode !== 'glass') return null;

  const wrap: StyleProp<ViewStyle> = [
    StyleSheet.absoluteFill,
    { borderRadius: radius, overflow: 'hidden' },
    style,
  ];

  if (Platform.OS !== 'android') {
    return <View pointerEvents="none" style={[wrap, { backgroundColor: 'rgba(255,255,255,0.30)' }]} />;
  }

  return (
    <View pointerEvents="none" style={wrap}>
      <AndroidGlassView
        style={StyleSheet.absoluteFill}
        cornerRadius={radius}
        tintColor={tint}
        fallbackColor="rgba(255,255,255,0.32)"
        theme="light"
        interactive={false}
      />
    </View>
  );
}

/** 给按钮/返回键用的小圆角玻璃(胶囊) */
export function SuperGlassPill({ height = 34, tint, style }: { height?: number; tint?: string; style?: StyleProp<ViewStyle> }) {
  return <SuperGlass radius={height / 2} tint={tint ?? 'rgba(255,255,255,0.14)'} style={style} />;
}
