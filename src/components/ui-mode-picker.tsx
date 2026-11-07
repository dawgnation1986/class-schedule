/**
 * 界面设置: 原版界面 / 液态玻璃界面
 * 选择器带水滴动效: 指示器拉伸滑到目标档位, 一颗小水珠拖尾跟来, 落定收拢
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { ThemeColor } from '@/constants/theme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { saveUiMode, type UiMode } from '@/lib/ui-mode';

const OPTIONS: { value: UiMode; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'original', label: '原版界面', hint: '经典样式, 清晰直白', icon: 'square' },
  { value: 'glass', label: '液态玻璃', hint: '磨砂玻璃 · Apple 风格', icon: 'water' },
];

const DROP_SPRING = { damping: 15, stiffness: 160, mass: 0.9 };
const TRAIL_SPRING = { damping: 22, stiffness: 75, mass: 0.7 };

export function UiModePicker({
  colors,
  glass,
  glassLine,
}: {
  colors: Record<ThemeColor, string>;
  glass: boolean;
  glassLine: string;
}) {
  const mode = useUiMode();
  const [draft, setDraft] = useState<UiMode>(mode);
  useEffect(() => setDraft(mode), [mode]);
  // 段宽度: onLayout 实测, 指示器按像素平移(百分比 transform 在 Reanimated 不可靠)
  const [segW, setSegW] = useState(0);

  // 两档布局: 指示器在 0 / 1 之间水滴式滑动
  const p = useSharedValue(OPTIONS.findIndex((o) => o.value === mode));
  const p2 = useSharedValue(OPTIONS.findIndex((o) => o.value === mode));

  useEffect(() => {
    const idx = OPTIONS.findIndex((o) => o.value === draft);
    p.value = withSpring(idx, DROP_SPRING);
    p2.value = withSpring(idx, TRAIL_SPRING);
  }, [draft, p, p2]);

  const ind = useAnimatedStyle(() => {
    const frac = p.value - Math.round(p.value);
    const s = Math.min(Math.abs(frac), 0.5) * 0.5;
    return {
      transform: [
        { translateX: p.value * segW },
        { scaleX: 1 + s },
        { scaleY: 1 - s * 0.5 },
      ],
    };
  });

  const drop = useAnimatedStyle(() => {
    const gap = Math.abs(p.value - p2.value);
    return {
      transform: [{ translateX: p2.value * segW + segW * 0.5 - 4.5 }],
      opacity: Math.min(gap * 3.2, 0.85),
    };
  });

  const dark = colors.background === '#000000';
  const indBg = dark ? 'rgba(255,255,255,0.20)' : 'rgba(37,99,235,0.12)';

  const pick = (v: UiMode) => {
    setDraft(v);
    void saveUiMode(v);
  };

  return (
    <View
      style={[
        styles.card,
        glass
          ? { borderWidth: 1, borderColor: glassLine, backgroundColor: 'transparent' }
          : { backgroundColor: colors.backgroundElement },
      ]}>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>界面设置</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
        切换后立即生效, 全局应用
      </Text>

      <View
        style={styles.segWrap}
        onLayout={(e) => setSegW(e.nativeEvent.layout.width / OPTIONS.length)}>
        {/* 拖尾小水珠 */}
        <Animated.View pointerEvents="none" style={[styles.drop, drop, { backgroundColor: indBg }]} />
        {/* 水滴指示器 */}
        <Animated.View pointerEvents="none" style={[styles.ind, ind, { backgroundColor: indBg }]} />
        <View style={styles.row}>
          {OPTIONS.map((o) => {
            const active = draft === o.value;
            return (
              <Pressable key={o.value} onPress={() => pick(o.value)} style={styles.opt}>
                <Ionicons name={o.icon} size={20} color={active ? '#2563eb' : colors.textSecondary} />
                <Text style={{ color: active ? '#2563eb' : colors.text, fontWeight: active ? '800' : '500', fontSize: 14 }}>
                  {o.label}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{o.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginTop: 24, gap: 4 },
  segWrap: {
    flexDirection: 'row',
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(127,150,190,0.25)',
    overflow: 'hidden',
  },
  row: { flex: 1, flexDirection: 'row' },
  opt: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 14 },
  ind: { position: 'absolute', top: 4, bottom: 4, left: 4, width: '50%', borderRadius: 13 },
  drop: { position: 'absolute', top: 8, left: 4, width: 9, height: 9, borderRadius: 4.5 },
});
