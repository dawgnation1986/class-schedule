/** 新手引导(教练式): 高亮方块 + 箭头指引真实界面元素, 点击任意位置才能下一步, 可跳过
 *  原理: 各页面用 <TourTarget id> 登记控件引用; CoachTour 渲染全屏遮罩, 每步跳到对应页
 *  并周期性实时测量目标控件窗口坐标(滚动/布局变化都跟随), 挖洞高亮 + 指引卡片 */
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View, findNodeHandle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const DONE_KEY = 'tour.done.v1';

export async function shouldShowTour(): Promise<boolean> {
  try {
    return !(await AsyncStorage.getItem(DONE_KEY));
  } catch {
    return false;
  }
}

export async function markTourDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(DONE_KEY, '1');
  } catch {
    // 存储失败不影响使用
  }
}

type Rect = { x: number; y: number; w: number; h: number };
export type TourStep = { route: string; target: string; title: string; desc: string };

export const TOUR_STEPS: TourStep[] = [
  { route: '/timetable', target: 'tt.toolbar', title: '课表工具栏', desc: '实时/原始课表切换、查其他班级、翻周翻日、分享与全屏周视图都排在这里, 左右滑动工具栏可见更多按钮。' },
  { route: '/timetable', target: 'tt.grid', title: '课程表格', desc: '双指捏合即可缩放课表; 点格子可查看课程详情。' },
  { route: '/profile', target: 'pf.theme', title: '外观模式', desc: '深色 / 浅色 / 跟随系统随你切换。' },
  { route: '/profile', target: 'pf.bg', title: '自定义背景', desc: '选一张喜欢的图片做全 App 背景, 支持调节背景透明度和控件全透明。' },
  { route: '/settings', target: 'st.guide', title: '教程设置', desc: '新手引导和图文教程常驻在这里, 随时可以回看。' },
];

// ---- 目标注册表: TourTarget 只登记视图引用, CoachTour 持续实时测量坐标(滚动/布局变化都能跟上) ----
const targetRefs = new Map<string, View>();
const startListeners = new Set<() => void>();
// 页面把自己的 ScrollView 登记进来(route -> scroller), 引导可自动滚动到屏幕外的目标
const scrollers = new Map<string, ScrollView>();

/** 页面登记其滚动容器, 使引导能滚动到屏幕外的目标控件 */
export function registerTourScroller(route: string, ref: ScrollView | null): void {
  if (ref) scrollers.set(route, ref);
  else scrollers.delete(route);
}

/** 触发新手引导(首次启动自动 / 教程设置手动) */
export function startCoachTour(): void {
  startListeners.forEach((l) => l());
}

/** 包住要高亮的元素; 坐标由 CoachTour 周期性 measureInWindow 实时获取, 避免滚动后错位 */
export function TourTarget({ id, style, children }: { id: string; style?: object; children: React.ReactNode }) {
  const setRef = useCallback(
    (v: View | null) => {
      if (v) targetRefs.set(id, v);
      else targetRefs.delete(id);
    },
    [id],
  );
  return (
    <View ref={setRef} collapsable={false} style={style}>
      {children}
    </View>
  );
}

const { width: W, height: H } = Dimensions.get('window');
const ACCENT = '#2563eb';
const HOLE_PAD = 8;

export function CoachTour() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const router = useRouter();
  const [st, setSt] = useState({ active: false, idx: 0 });
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(170);

  useEffect(() => {
    const l = () => setSt({ active: true, idx: 0 });
    startListeners.add(l);
    return () => void startListeners.delete(l);
  }, []);

  const finish = useCallback(() => {
    setSt({ active: false, idx: 0 });
    setRect(null);
    void markTourDone();
  }, []);

  const next = useCallback(() => {
    setRect(null);
    setSt((s) => {
      if (s.idx + 1 >= TOUR_STEPS.length) {
        void markTourDone();
        return { active: false, idx: 0 };
      }
      return { active: true, idx: s.idx + 1 };
    });
  }, []);

  const step = st.active ? TOUR_STEPS[st.idx] : null;

  // 每步: 跳到对应页面, 周期性实时测量目标控件窗口坐标(滚动/布局变化实时跟随; 找不到则跳到下一步)
  useEffect(() => {
    if (!step) return;
    let alive = true;
    let tries = 0;
    router.navigate(step.route as never);
    const poll = () => {
      if (!alive) return;
      const ref = targetRefs.get(step.target);
      if (!ref) {
        setRect(null);
        if (tries++ > 40) next();
        return;
      }
      ref.measureInWindow((x, y, w, h) => {
        if (!alive) return;
        if (w > 0 && h > 0) {
          tries = 0;
          setRect((p) => (p && p.x === x && p.y === y && p.w === w && p.h === h ? p : { x, y, w, h }));
          // 目标在屏幕外: 自动滚动到可见(带 140px 余量)
          if (y + h > H - 16 || y < 0) {
            const sc = scrollers.get(step.route);
            const node = findNodeHandle(ref);
            if (sc && node) {
              (sc as unknown as {
                scrollResponderScrollNativeHandleToKeyboard: (h: number, extra: number, animated: boolean) => void;
              }).scrollResponderScrollNativeHandleToKeyboard(node, 140, true);
            }
          }
        } else {
          setRect(null);
          if (tries++ > 40) next();
        }
      });
    };
    const t0 = setTimeout(poll, 350);
    const iv = setInterval(poll, 250);
    return () => {
      alive = false;
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, [step, router, next]);

  // 洞的位置(弹簧动画)
  const hx = useSharedValue(W / 2);
  const hy = useSharedValue(H / 2);
  const hw = useSharedValue(0);
  const hh = useSharedValue(0);
  useEffect(() => {
    if (rect) {
      hx.value = withSpring(rect.x - HOLE_PAD, { damping: 18 });
      hy.value = withSpring(rect.y - HOLE_PAD, { damping: 18 });
      hw.value = withSpring(rect.w + HOLE_PAD * 2, { damping: 18 });
      hh.value = withSpring(rect.h + HOLE_PAD * 2, { damping: 18 });
    }
  }, [rect, hx, hy, hw, hh]);

  const dimTop = useAnimatedStyle(() => ({ left: 0, top: 0, width: W, height: Math.max(0, hy.value) }));
  const dimBottom = useAnimatedStyle(() => ({ left: 0, top: hy.value + hh.value, width: W, height: Math.max(0, H - (hy.value + hh.value)) }));
  const dimLeft = useAnimatedStyle(() => ({ left: 0, top: hy.value, width: Math.max(0, hx.value), height: hh.value }));
  const dimRight = useAnimatedStyle(() => ({ left: hx.value + hw.value, top: hy.value, width: Math.max(0, W - (hx.value + hw.value)), height: hh.value }));
  const hole = useAnimatedStyle(() => ({ left: hx.value, top: hy.value, width: hw.value, height: hh.value }));

  // 洞边框脉冲
  const pulse = useSharedValue(0.6);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value * (rect ? 1 : 0) }));

  // 卡片定位: 优先在洞下方, 放不下则上方; 左右夹紧
  const cw = Math.min(330, W - 32);
  const below = rect ? rect.y + rect.h + 18 + cardH < H - 16 : true;
  const cardTop = rect ? (below ? rect.y + rect.h + 18 : Math.max(14, rect.y - cardH - 18)) : 0;
  const cardLeft = rect ? Math.min(Math.max(8, rect.x + rect.w / 2 - cw / 2), W - cw - 8) : 0;
  const arrowLeft = rect ? Math.min(Math.max(20, rect.x + rect.w / 2 - cardLeft - 10), cw - 30) : 0;
  const isLast = st.idx === TOUR_STEPS.length - 1;

  return (
    <Modal visible={st.active} transparent statusBarTranslucent animationType="fade" onRequestClose={finish}>
      <Pressable style={styles.fill} onPress={next}>
        {/* 四块半透明遮罩拼出挖洞 */}
        <Animated.View style={[styles.abs, styles.dim, dimTop]} />
        <Animated.View style={[styles.abs, styles.dim, dimBottom]} />
        <Animated.View style={[styles.abs, styles.dim, dimLeft]} />
        <Animated.View style={[styles.abs, styles.dim, dimRight]} />
        {/* 洞边框 + 脉冲光圈 */}
        <Animated.View style={[styles.abs, styles.holeBorder, hole, { borderColor: ACCENT }]} />
        <Animated.View style={[styles.abs, styles.holePulse, hole, { borderColor: ACCENT }, pulseStyle]} />
        {/* 指引卡片 */}
        {!!rect && !!step && (
          <Animated.View
            entering={FadeInDown.springify().damping(16)}
            onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
            style={[styles.card, { top: cardTop, left: cardLeft, width: cw, backgroundColor: colors.backgroundElement }]}>
            {/* 箭头(旋转方块) */}
            <View
              style={[
                styles.arrow,
                { backgroundColor: colors.backgroundElement, left: arrowLeft, top: below ? -9 : undefined, bottom: below ? undefined : -9 },
              ]}
            />
            <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '700' }}>
              第 {st.idx + 1} / {TOUR_STEPS.length} 步
            </Text>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 3 }}>{step.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13.5, lineHeight: 20, marginTop: 6 }}>{step.desc}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <Pressable onPress={finish} hitSlop={8}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>跳过</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '700' }}>{isLast ? '完成' : '点击任意位置继续'}</Text>
                <Ionicons name={isLast ? 'checkmark-circle' : 'arrow-forward'} size={14} color={ACCENT} />
              </View>
            </View>
          </Animated.View>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  abs: { position: 'absolute' },
  dim: { backgroundColor: 'rgba(0,0,0,0.62)' },
  holeBorder: { borderWidth: 2.5, borderRadius: 14, borderStyle: 'dashed' },
  holePulse: { borderWidth: 2, borderRadius: 14 },
  card: { position: 'absolute', borderRadius: 14, padding: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 },
  arrow: { position: 'absolute', width: 18, height: 18, transform: [{ rotate: '45deg' }] },
});
