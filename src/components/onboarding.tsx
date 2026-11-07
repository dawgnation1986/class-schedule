/** 新手引导: 6 步分页引导, 首次启动自动弹出, 设置页可随时重温
 *  动画: reanimated 循环浮动/脉冲光环/步骤切换滑入/按钮按压缩放
 *  配色全部不透明, 不跟随「控件透明」模式 */
import { useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  FadeInDown,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const DONE_KEY = 'onboarding.done.v1';

export async function shouldShowOnboarding(): Promise<boolean> {
  try {
    return !(await AsyncStorage.getItem(DONE_KEY));
  } catch {
    return false;
  }
}

export async function markOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(DONE_KEY, '1');
  } catch {
    // 存储失败不影响使用
  }
}

type Step = {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  desc: string;
  tips?: string[];
};

const STEPS: Step[] = [
  {
    icon: 'school',
    accent: '#2563eb',
    title: '欢迎使用学生综合管理平台',
    desc: '你的专属课表助手。跟着引导走, 30 秒了解全部核心功能。',
  },
  {
    icon: 'layers',
    accent: '#7c3aed',
    title: '三步绑定你的班级',
    desc: '在「设置」页依次选择 系部 → 专业 → 班级 并保存, 主页就会自动查询课表, 每周实时更新, 无需重复登录。',
    tips: ['设置页支持一键保存', '支持临时查看其他班级课表'],
  },
  {
    icon: 'grid',
    accent: '#059669',
    title: '课表随心看',
    desc: '课表支持手势操作, 想怎么看就怎么看。',
    tips: ['双指捏合即可缩放课表', '「全屏周视图」横屏铺满一整周', '一键分享课表长图给同学'],
  },
  {
    icon: 'notifications',
    accent: '#f59e0b',
    title: '上课再也不迟到',
    desc: 'App 自动在上课前 5 分钟发出提醒。请在系统设置中允许「通知」权限, 小米等机型还需允许「悬浮通知」才会弹出横幅。',
    tips: ['提醒随课表自动排期, 无需手动设置'],
  },
  {
    icon: 'color-palette',
    accent: '#ec4899',
    title: '打造你的专属风格',
    desc: '在「我的」页可以尽情定制外观。',
    tips: ['深色 / 浅色主题随意切换', '自定义背景图与控件透明度', '手动编辑每节课程的作息时间'],
  },
  {
    icon: 'checkmark-circle',
    accent: '#16a34a',
    title: '一切就绪!',
    desc: '现在去「设置」页绑定班级, 开启你的课表之旅吧。这份引导会常驻在设置里, 随时可以回来看。',
  },
];

/** 步骤插画: 脉冲光环 + 浮动图标块 + 环绕小圆点 */
function StepArt({ icon, accent }: { icon: keyof typeof Ionicons.glyphMap; accent: string }) {
  const float = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(withTiming(-12, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true);
    ring1.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false);
    ring2.value = withDelay(1100, withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false));
    dot1.value = withRepeat(withTiming(-8, { duration: 2000, easing: Easing.inOut(Easing.quad) }), -1, true);
    dot2.value = withDelay(700, withRepeat(withTiming(9, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [float, ring1, ring2, dot1, dot2]);

  const ringStyle = (v: typeof ring1) =>
    useAnimatedStyle(() => ({
      transform: [{ scale: 0.7 + v.value * 0.9 }],
      opacity: 0.35 * (1 - v.value),
    }));
  const R1 = ringStyle(ring1);
  const R2 = ringStyle(ring2);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));
  const d1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const d2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));

  const size = 108;
  return (
    <View style={{ width: 210, height: 170, alignItems: 'center', justifyContent: 'center' }}>
      {/* 脉冲光环 x2 */}
      <Animated.View
        style={[
          { position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: accent },
          R1,
        ]}
      />
      <Animated.View
        style={[
          { position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: accent },
          R2,
        ]}
      />
      {/* 环绕小点 */}
      <Animated.View style={[{ position: 'absolute', left: 14, top: 38, width: 10, height: 10, borderRadius: 5, backgroundColor: accent, opacity: 0.5 }, d1]} />
      <Animated.View style={[{ position: 'absolute', right: 18, bottom: 34, width: 14, height: 14, borderRadius: 7, backgroundColor: accent, opacity: 0.35 }, d2]} />
      <Animated.View style={[{ position: 'absolute', right: 30, top: 22, width: 8, height: 8, borderRadius: 4, backgroundColor: accent, opacity: 0.3 }, d1]} />
      {/* 浮动图标块 */}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: 28,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: accent,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.4,
            shadowRadius: 18,
            elevation: 10,
          },
          floatStyle,
        ]}>
        <Ionicons name={icon} size={52} color="#fff" />
      </Animated.View>
    </View>
  );
}

/** 按压缩放按钮 */
function SpringPress({ onPress, disabled, style, children }: {
  onPress: () => void;
  disabled?: boolean;
  style: object | object[];
  children: React.ReactNode;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => (s.value = withSpring(0.94, { damping: 14 }))}
      onPressOut={() => (s.value = withSpring(1, { damping: 14 }))}>
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

/** 进度圆点: 当前步拉长成胶囊(弹簧动画) */
function Dot({ active, accent }: { active: boolean; accent: string }) {
  const w = useSharedValue(active ? 24 : 8);
  useEffect(() => {
    w.value = withSpring(active ? 24 : 8, { damping: 16 });
  }, [active, w]);
  const a = useAnimatedStyle(() => ({ width: w.value }));
  return (
    <Animated.View
      style={[{ height: 8, borderRadius: 4, backgroundColor: active ? accent : 'rgba(128,128,128,0.35)' }, a]}
    />
  );
}

function Dots({ n, cur, accent }: { n: number; cur: number; accent: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
      {Array.from({ length: n }, (_, i) => (
        <Dot key={i} active={i === cur} accent={accent} />
      ))}
    </View>
  );
}

export function OnboardingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // 每次打开都从第一步开始
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const finish = () => {
    void markOnboardingDone();
    onClose();
  };
  const next = () => (isLast ? finish() : setStep((v) => v + 1));

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={finish}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* 背景装饰大圆(不透明底色上的低透明装饰) */}
        <View style={[styles.deco1, { backgroundColor: s.accent, opacity: 0.06 }]} />
        <View style={[styles.deco2, { backgroundColor: s.accent, opacity: 0.05 }]} />

        {/* 跳过 */}
        <View style={styles.topRow}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {step + 1} / {STEPS.length}
          </Text>
          <SpringPress onPress={finish} style={styles.skipBtn}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>跳过</Text>
          </SpringPress>
        </View>

        {/* 步骤内容: key 切换触发滑入动画 */}
        <ScrollView contentContainerStyle={styles.body} bounces={false} showsVerticalScrollIndicator={false}>
          <Animated.View key={step} entering={FadeInDown.springify().damping(16)} style={styles.stepBox}>
            <StepArt icon={s.icon} accent={s.accent} />
            <Text style={[styles.title, { color: colors.text }]}>{s.title}</Text>
            <Text style={[styles.desc, { color: colors.textSecondary }]}>{s.desc}</Text>
            {!!s.tips?.length && (
              <View style={styles.tips}>
                {s.tips.map((t, i) => (
                  <Animated.View
                    key={t}
                    entering={FadeInDown.delay(180 + i * 110).springify().damping(16)}
                    style={[styles.tipRow, { backgroundColor: colors.backgroundElement }]}>
                    <Ionicons name="checkmark" size={15} color={s.accent} />
                    <Text style={[styles.tipText, { color: colors.text }]}>{t}</Text>
                  </Animated.View>
                ))}
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* 底部: 圆点 + 按钮 */}
        <View style={styles.bottom}>
          <Dots n={STEPS.length} cur={step} accent={s.accent} />
          <View style={styles.btnRow}>
            {step > 0 ? (
              <SpringPress
                onPress={() => setStep((v) => v - 1)}
                style={[styles.ghostBtn, { borderColor: colors.textSecondary, opacity: 0.9 }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>上一步</Text>
              </SpringPress>
            ) : (
              <View style={{ width: 108 }} />
            )}
            <SpringPress onPress={next} style={[styles.primaryBtn, { backgroundColor: s.accent }]}>
              <Text style={styles.primaryText}>{isLast ? '开始使用' : '下一步'}</Text>
              {!isLast && <Ionicons name="arrow-forward" size={17} color="#fff" />}
            </SpringPress>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width: W } = Dimensions.get('window');

const styles = StyleSheet.create({
  root: { flex: 1 },
  deco1: { position: 'absolute', width: W * 1.1, height: W * 1.1, borderRadius: W * 0.55, top: -W * 0.55, right: -W * 0.35 },
  deco2: { position: 'absolute', width: W * 0.8, height: W * 0.8, borderRadius: W * 0.4, bottom: -W * 0.35, left: -W * 0.3 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: 54 },
  skipBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(128,128,128,0.14)' },
  body: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four },
  stepBox: { alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: Spacing.two, lineHeight: 30 },
  desc: { fontSize: 14.5, lineHeight: 23, textAlign: 'center', marginTop: Spacing.two, maxWidth: 320 },
  tips: { marginTop: Spacing.three, gap: 9, alignSelf: 'stretch', maxWidth: 330 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12 },
  tipText: { fontSize: 13.5, flexShrink: 1 },
  bottom: { paddingBottom: 34, paddingHorizontal: Spacing.three, gap: Spacing.three, alignItems: 'center' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', maxWidth: 380 },
  ghostBtn: { width: 108, paddingVertical: 13, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  primaryBtn: { minWidth: 150, paddingVertical: 13, paddingHorizontal: 22, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
