/**
 * 界面设置: 原版界面 / 液态玻璃
 * 液态玻璃沿用原版界面的布局与配色, 只在最底层加一层模糊流光壁纸,
 * 并把卡片/按钮变成半透明玻璃(复用现有透明控件样式)。
 *
 * 选择器带水滴动效: 指示器拉伸滑到目标档位, 一颗小水珠拖尾跟来, 落定收拢
 * 稳定性说明: 动画使用 RN 内置 Animated(JS 线程驱动), 不用 reanimated worklet
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiMode } from '@/hooks/use-ui-mode';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNightGlassDisabled } from '@/hooks/use-night-glass';
import { useTabBarLook } from '@/hooks/use-tab-bar-look';
import { saveUiMode, type UiMode } from '@/lib/ui-mode';
import { setNightGlassDisabled } from '@/lib/night-glass';
import { previewTabBarLook, resetTabBarLook, setTabBarLook, TAB_BAR_COLORS } from '@/lib/tab-bar-style';
import { useBgSetting } from '@/lib/background';
import { GlassSurface, GLASS_LINE } from '@/components/glass-surface';
import { GlassSlider } from '@/components/glass-slider';

type PickerVal = Extract<UiMode, 'original' | 'glass'>;

const OPTIONS: { value: PickerVal; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'original', label: '原版界面', hint: '经典样式 · 清晰', icon: 'square' },
  { value: 'glass', label: '液态玻璃', hint: 'iOS 26 · 毛玻璃', icon: 'sparkles' },
];

export function UiModePicker() {
  const mode = useUiMode();
  const colors = useTheme();
  const scheme = useColorScheme();
  const glassDisabled = useNightGlassDisabled();
  const bgSetting = useBgSetting();
  const look = useTabBarLook();
  const [hex, setHex] = useState(look.color);
  useEffect(() => setHex(look.color), [look.color]);
  const commitHex = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) void setTabBarLook({ color: hex.toUpperCase() });
    else setHex(look.color);
  };
  const glassActive = mode === 'glass';
  const transparent = glassActive || !!bgSetting.ctrl;
  const glassLine =
    scheme === 'dark' ? 'rgba(255,255,255,0.40)' : glassActive ? GLASS_LINE : 'rgba(0,0,0,0.30)';

  const current: PickerVal = glassActive ? 'glass' : 'original';
  const [draft, setDraft] = useState<PickerVal>(current);
  useEffect(() => setDraft(current), [current]);

  // 两档布局: 指示器按像素平移(段宽 onLayout 实测)
  const [segW, setSegW] = useState(0);

  const x = useRef(new Animated.Value(OPTIONS.findIndex((o) => o.value === current) * segW)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const x2 = useRef(new Animated.Value(OPTIONS.findIndex((o) => o.value === current) * segW)).current;
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

  const indBg = glassActive
    ? 'rgba(120,190,255,0.26)'
    : colors.background === '#000000'
      ? 'rgba(255,255,255,0.20)'
      : 'rgba(37,99,235,0.12)';
  const activeColor = glassActive ? (scheme === 'dark' ? '#8FD0FF' : '#2563EB') : colors.primary;

  const pick = (v: PickerVal) => {
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
        style={[styles.segWrap, transparent && styles.segWrapGlass, { borderColor: glassLine }]}
        onLayout={(e) => setSegW(e.nativeEvent.layout.width / OPTIONS.length)}>
        <GlassSurface radius={16} />
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

      {/* 调试/兼容开关: 关闭后液态玻璃回退为无原生模糊的半透明面板 */}
      {glassActive && (
        <View style={[styles.glassRow, { borderColor: glassLine }]}>
          <GlassSurface radius={12} />
          <Ionicons name="sparkles-outline" size={16} color={activeColor} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>原生毛玻璃</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 2 }}>
              如遇卡顿、花屏或崩溃可关闭，立即回退为半透明面板
            </Text>
          </View>
          <Switch
            value={!glassDisabled}
            onValueChange={(v) => void setNightGlassDisabled(!v)}
            trackColor={{ true: '#2563EB', false: 'rgba(128,128,128,0.35)' }}
            thumbColor="#FFFFFF"
          />
        </View>
      )}

      {/* 底栏外观: 颜色 + 透字模式 */}
      {glassActive && (
        <View style={styles.barBlock}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>底栏颜色</Text>
          <View style={styles.swatchRow}>
            {TAB_BAR_COLORS.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => void setTabBarLook({ color: c.value })}
                style={[
                  styles.swatch,
                  { backgroundColor: c.value },
                  look.color === c.value && { borderWidth: 2, borderColor: activeColor },
                ]}>
                {look.color === c.value && <Ionicons name="checkmark" size={14} color={look.color === '#20242E' ? '#fff' : '#2563EB'} />}
              </Pressable>
            ))}
          </View>
          <TextInput
            value={hex}
            onChangeText={setHex}
            onBlur={commitHex}
            onSubmitEditing={commitHex}
            placeholder="#F7F3EA"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            maxLength={7}
            style={[styles.hexInput, { color: colors.text, borderColor: glassLine }]}
          />
          {/* 底栏永远是透明玻璃, 只调节染色浓度 */}
          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, color: colors.text, fontWeight: '700', fontSize: 12.5 }}>玻璃染色浓度</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{Math.round(look.alpha * 100)}%</Text>
            </View>
            <GlassSlider
              value={look.alpha}
              min={0}
              max={0.25}
              activeColor={activeColor}
              trackColor={glassLine}
              onChange={(v) => previewTabBarLook({ alpha: v })}
              onComplete={(v) => void setTabBarLook({ alpha: v })}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 10.5 }}>
              0% 是纯模糊无染色；往右加一点点底栏颜色。底栏没有白色底板
            </Text>
          </View>

          {/* 液态模式: 实心白玻璃胶囊 + 液态折射边 */}
          <View style={styles.barRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>液态玻璃胶囊</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 2 }}>
                选中项是独立的浅蓝玻璃胶囊；关闭则用纯白胶囊
              </Text>
            </View>
            <Switch
              value={look.liquid}
              onValueChange={(v) => void setTabBarLook({ liquid: v })}
              trackColor={{ true: '#2563EB', false: 'rgba(128,128,128,0.35)' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* 调试: 清掉旧的底栏配置(tabbar-look-v1), 回到当前代码的默认值 */}
          <Pressable
            onPress={() => {
              void resetTabBarLook().then(() => Alert.alert('已重置', '底栏旧配置已清除, 已恢复默认值'));
            }}
            style={({ pressed }) => [styles.barRow, pressed && { opacity: 0.6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>重置底栏配置</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 2 }}>
                清除本地保存的底栏外观(不影响其他数据), 恢复默认
              </Text>
            </View>
            <Ionicons name="refresh-circle-outline" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}
    </>
  );

  if (transparent) {
    return (
      <View style={[styles.card, { backgroundColor: 'transparent', borderWidth: 1, borderColor: glassLine }]}>
        <GlassSurface radius={12} />
        {body}
      </View>
    );
  }
  return <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginTop: 24, gap: 4 },
  segWrap: {
    flexDirection: 'row',
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(91,140,255,0.06)',
  },
  segWrapGlass: { backgroundColor: 'transparent' },
  row: { flex: 1, flexDirection: 'row' },
  opt: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 14 },
  ind: { position: 'absolute', top: 4, bottom: 4, left: 4, width: '50%', borderRadius: 13 },
  drop: { position: 'absolute', top: 8, left: 4, width: 9, height: 9, borderRadius: 4.5 },
  glassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  barBlock: { marginTop: 14, gap: 6 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hexInput: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    letterSpacing: 1,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
});
