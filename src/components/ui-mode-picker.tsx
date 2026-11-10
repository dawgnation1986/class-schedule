/**
 * 界面设置: 原版界面 / 墨夜主题
 * 选择器带水滴动效: 指示器拉伸滑到目标档位, 一颗小水珠拖尾跟来, 落定收拢
 *
 * 稳定性说明: 动画使用 RN 内置 Animated(JS 线程驱动), 不用 reanimated worklet
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiMode } from '@/hooks/use-ui-mode';
import { useTheme } from '@/hooks/use-theme';
import { saveUiMode, type UiMode } from '@/lib/ui-mode';
import { NightCard, NightTint } from '@/components/night-kit';

const OPTIONS: { value: UiMode; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'original', label: '原版界面', hint: '经典样式, 清晰直白', icon: 'square' },
  { value: 'night', label: '墨夜主题', hint: '深邃夜空 · 蓝紫辉光', icon: 'moon' },
];

export function UiModePicker() {
  const mode = useUiMode();
  const colors = useTheme();
  const [draft, setDraft] = useState<UiMode>(mode);
  useEffect(() => setDraft(mode), [mode]);

  // 两档布局: 指示器按像素平移(段宽 onLayout 实测)
  const [segW, setSegW] = useState(0);

  const x = useRef(new Animated.Value(OPTIONS.findIndex((o) => o.value === draft) * segW)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const x2 = useRef(new Animated.Value(OPTIONS.findIndex((o) => o.value === draft) * segW)).current;
  const op2 = useRef(new Animated.Value(0)).current;
  const lastX = useRef(0);

  useEffect(() => {
    const tx = OPTIONS.findIndex((o) => o.value === draft) * segW;
    if (tx === lastX.current) return;
    op2.setValue(0.85);
    x2.setValue(lastX.current);
    Animated.parallel([
      Animated.spring(x, { toValue: tx, friction: 7, tension: 170, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 0, friction: 5, tension: 80, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.spring(x2, { toValue: tx, friction: 9, tension: 55, useNativeDriver: true, delay: 90 }),
        Animated.timing(op2, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    ]).start();
    lastX.current = tx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, segW]);

  const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });

  const night = mode === 'night';
  const indBg = night
    ? 'rgba(91,140,255,0.22)'
    : colors.background === '#000000'
      ? 'rgba(255,255,255,0.20)'
      : 'rgba(37,99,235,0.12)';
  const activeColor = night ? '#5B8CFF' : '#2563eb';

  const pick = (v: UiMode) => {
    setDraft(v);
    void saveUiMode(v);
  };

  const body = (
    <>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>界面设置</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
        切换后立即生效, 全局应用
      </Text>

      <View
        style={styles.segWrap}
        onLayout={(e) => setSegW(e.nativeEvent.layout.width / OPTIONS.length)}>
        {/* 拖尾小水珠 */}
        <Animated.View
          pointerEvents="none"
          style={[styles.drop, { backgroundColor: indBg, opacity: op2 }, { transform: [{ translateX: x2 }] }]}
        />
        {/* 水滴指示器 */}
        <Animated.View
          pointerEvents="none"
          style={[styles.ind, { backgroundColor: indBg }, { transform: [{ translateX: x }, { scaleX }, { scaleY }] }]}
        />
        <View style={styles.row}>
          {OPTIONS.map((o) => {
            const active = draft === o.value;
            return (
              <Pressable key={o.value} onPress={() => pick(o.value)} style={styles.opt}>
                <Ionicons name={o.icon} size={20} color={active ? activeColor : colors.textSecondary} />
                <Text style={{ color: active ? activeColor : colors.text, fontWeight: active ? '800' : '500', fontSize: 14 }}>
                  {o.label}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{o.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );

  if (night) {
    return <NightCard style={styles.nightCard}>{body}</NightCard>;
  }
  return <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginTop: 24, gap: 4 },
  nightCard: { padding: 16, marginTop: 24, gap: 4 },
  segWrap: {
    flexDirection: 'row',
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: NightTint.line,
    overflow: 'hidden',
    backgroundColor: 'rgba(91,140,255,0.06)',
  },
  row: { flex: 1, flexDirection: 'row' },
  opt: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 14 },
  ind: { position: 'absolute', top: 4, bottom: 4, left: 4, width: '50%', borderRadius: 13 },
  drop: { position: 'absolute', top: 8, left: 4, width: 9, height: 9, borderRadius: 4.5 },
});
