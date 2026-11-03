import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as ScreenOrientation from 'expo-screen-orientation';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePageBackground, useBgSetting } from '@/lib/background';
import {
  beijingNow,
  loadInitial,
  queryTimetable,
  selectDepartment,
  selectMajor,
  type QueryType,
  type Timetable,
  type TimetableRow,
} from '@/lib/timetable';
import { DEFAULT_QUERY_TYPE, loadSettings, loadTimetableUI, type Settings, type TimetableUI } from '@/lib/settings';
import { getTempOverride, setTempOverride } from '@/lib/tempOverride';
import { fetchWeather, fetchWeatherFull, setWeatherCity, type Weather, type WeatherFull } from '@/lib/weather';
import { WeatherModal } from '@/components/weather-modal';
import { scheduleClassReminders } from '@/lib/notifications';
import { TourTarget } from '@/components/tour';
import { getPeriodTimes, subscribeTimes } from '@/lib/schedule-times';
import { NovaTimetable } from '@/components/timetable-nova';
import { getExams, type ExamInfo } from '@/lib/school-data';
import { daysUntil, loadCountdowns, subscribeCountdowns, type Countdown } from '@/lib/countdowns';

const WEEK_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEK_COLS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function parseHM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** 当前所处的大节; 不在上课时间时吸附到时间上最近的大节(如 18:31 → 7-8节) */
function currentPeriod(now: Date, times: Record<string, [string, string]>): string | null {
  const mins = minutesOf(now);
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [period, [start, end]] of Object.entries(times)) {
    const s = parseHM(start);
    const e = parseHM(end);
    const dist = mins < s ? s - mins : mins > e ? mins - e : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = period;
    }
  }
  return best;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** 日历式日期选择: 月份网格, 左右翻月, 今天高亮, 快速回到今天 */
function DatePickModal({
  visible,
  value,
  onClose,
  onConfirm,
  colors,
}: {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onConfirm: (d: Date) => void;
  colors: (typeof Colors)[keyof typeof Colors];
}) {
  const [view, setView] = useState({ y: value.getFullYear(), m: value.getMonth() + 1 });
  const [sel, setSel] = useState(value);

  useEffect(() => {
    if (visible) {
      const base = value ?? beijingNow();
      setSel(base);
      setView({ y: base.getFullYear(), m: base.getMonth() + 1 });
    }
  }, [visible, value]);

  const today = beijingNow();
  const sameDM = (a: Date, y: number, m: number, d: number) =>
    a.getFullYear() === y && a.getMonth() + 1 === m && a.getDate() === d;

  // 周一开头的日历网格: 补齐前置空位
  const lead = (new Date(view.y, view.m - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const dayCell = (d: number) => {
    const isSel = sameDM(sel, view.y, view.m, d);
    const isToday = sameDM(today, view.y, view.m, d);
    return (
      <Pressable
        key={d}
        onPress={() => setSel(new Date(view.y, view.m - 1, d))}
        style={[
          styles.calDay,
          isToday && !isSel && { borderWidth: 1, borderColor: '#2563eb' },
          isSel && { backgroundColor: '#2563eb' },
        ]}>
        <Text style={{ color: isSel ? '#fff' : colors.text, fontSize: 13, fontWeight: isSel || isToday ? '700' : '400' }}>
          {d}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalMask} onPress={onClose}>
        <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>选择查询日期</Text>
          <View style={styles.calHead}>
            <Pressable onPress={() => setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { ...v, m: v.m - 1 }))} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
              {view.y}年{view.m}月
            </Text>
            <Pressable onPress={() => setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { ...v, m: v.m + 1 }))} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.calWeekRow}>
            {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
              <Text key={w} style={[styles.calWeek, { color: colors.textSecondary }]}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {cells.map((d, i) => (d === null ? <View key={`e${i}`} style={styles.calDay} /> : dayCell(d)))}
          </View>
          <View style={styles.modalBtnRow}>
            <Pressable
              onPress={() => {
                const now = beijingNow();
                onConfirm(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
              }}
              style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
              <Text style={{ color: colors.text }}>回到今天</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(sel)} style={[styles.modalBtn, { backgroundColor: '#2563eb' }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>查询</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 课表捏合缩放容器: 双指 1~3 倍缩放, 松手后缩得太小自动回弹 */
function PinchZoom({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const pinch = Gesture.Pinch()
    .onStart(() => {
      saved.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(3, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value < 1.2) scale.value = withSpring(1);
    });
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={pinch}>
        <Animated.View style={[{ flex: 1 }, anim]}>{children}</Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/** 全屏横屏整周视图: 自动横屏铺满一周, 双指捏合缩放(0.5~4 倍)+双指拖动 */
function FullWeekView({
  visible,
  onClose,
  rows,
  colors,
  todayCol,
  isToday,
  curPeriod,
}: {
  visible: boolean;
  onClose: () => void;
  rows: TimetableRow[];
  colors: (typeof Colors)[keyof typeof Colors];
  todayCol: number;
  isToday: boolean;
  curPeriod: string | null;
}) {
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const stx = useSharedValue(0);
  const sty = useSharedValue(0);

  // 进入锁横屏, 退出恢复竖屏
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (visible) {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
    } else {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    }
  }, [visible]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      saved.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(4, Math.max(0.5, saved.value * e.scale));
    });
  const pan = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      stx.value = tx.value;
      sty.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = stx.value + e.translationX;
      ty.value = sty.value + e.translationY;
    });
  const gesture = Gesture.Simultaneous(pinch, pan);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const pinW = 38;
  const pad = 10;
  const dayW = Math.max(56, (dim.w - pad * 2 - pinW) / 7 - 2);
  const headH = 24;
  const rowH = rows.length > 0 ? Math.max(32, Math.min(64, Math.floor((dim.h - headH - 44) / rows.length))) : 40;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1 }} onLayout={(e) => setDim({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          <View style={{ position: 'absolute', top: 10, right: 14, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>双指缩放/拖动</Text>
            <Pressable
              onPress={onClose}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(37,99,235,0.15)' }}>
              <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '700' }}>关闭</Text>
            </Pressable>
          </View>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[{ flex: 1, padding: pad, justifyContent: 'center' }, anim]}>
              <View>
                {/* 表头 */}
                <View style={{ flexDirection: 'row' }}>
                  <View style={[fwStyles.pin, { width: pinW, height: headH }]}>
                    <Text style={{ color: colors.textSecondary, fontSize: 10 }}>节次</Text>
                  </View>
                  {WEEK_COLS.map((d, i) => (
                    <View
                      key={d}
                      style={[fwStyles.cell, { width: dayW, height: headH }, i === todayCol && fwStyles.todayCell]}>
                      <Text style={{ color: i === todayCol ? colors.text : colors.textSecondary, fontSize: 10, fontWeight: i === todayCol ? '700' : '400' }}>
                        {d}
                        {i === todayCol && isToday ? ' · 今' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
                {/* 数据行 */}
                {rows.map((row) => (
                  <View key={row.index} style={{ flexDirection: 'row' }}>
                    <View style={[fwStyles.pin, { width: pinW, height: rowH }]}>
                      <Text style={{ color: colors.textSecondary, fontSize: 9, textAlign: 'center' }}>{row.period}</Text>
                    </View>
                    {row.days.map((courses, i) => (
                      <View
                        key={i}
                        style={[
                          fwStyles.cell,
                          { width: dayW, height: rowH },
                          i === todayCol && fwStyles.todayCell,
                          curPeriod === row.period && i === todayCol && { backgroundColor: 'rgba(37,99,235,0.15)' },
                        ]}>
                        {courses.map((c, k) => (
                          <Text key={k} style={{ color: colors.text, fontSize: 9, lineHeight: 12 }} numberOfLines={3}>
                            {c.name}
                            {c.location ? ` @${c.location}` : ''}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const fwStyles = StyleSheet.create({
  pin: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.35)', backgroundColor: 'rgba(100,116,139,0.08)' },
  cell: { alignItems: 'center', justifyContent: 'center', padding: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.35)' },
  todayCell: { backgroundColor: 'rgba(37,99,235,0.10)' },
});

export default function TimetableEntry() {
  const [ui, setUi] = useState<TimetableUI | null>(null);
  useFocusEffect(
    useCallback(() => {
      void loadTimetableUI().then(setUi);
    }, []),
  );
  if (ui === null) return null; // 等待读取设置, 避免闪屏
  if (ui === 'nova') return <NovaTimetable onSwitchUI={(u) => setUi(u)} />;
  return <ClassicScreen />;
}

function ClassicScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  // 控件全透明模式: 设了背景图且开启开关 → 按钮/卡片/表格只留文字 + 1px 外轮廓
  const glass = !!bgSetting.uri && !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const btnBg = (active = false): string | null =>
    glass ? (active ? 'rgba(37,99,235,0.15)' : 'transparent') : null;
  const glassBorder = (active = false) =>
    glass ? { borderWidth: 1, borderColor: active ? 'rgba(37,99,235,0.55)' : glassLine } : null;
  const router = useRouter();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [usingTemp, setUsingTemp] = useState(false); // 是否正在临时查看其他班级
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [queryType, setQueryType] = useState<QueryType>(DEFAULT_QUERY_TYPE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => beijingNow());
  const [periodTimes, setPeriodTimes] = useState<Record<string, [string, string]>>(getPeriodTimes());

  // 跟随作息时间表变化(手动编辑/JSON 导入/切换季节后自动刷新)
  useEffect(() => subscribeTimes(() => setPeriodTimes(getPeriodTimes())), []);
  const [selectedDate, setSelectedDate] = useState(() => beijingNow());
  const [weather, setWeather] = useState<Weather | null>(null);
  const [wxOpen, setWxOpen] = useState(false);
  const [wxFull, setWxFull] = useState<WeatherFull | null>(null);
  const [wxLoading, setWxLoading] = useState(false);
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [cds, setCds] = useState<Countdown[]>([]);
  const [detailCell, setDetailCell] = useState<{
    period: string;
    dayIdx: number;
    name: string;
    location: string;
    teacher: string;
    weeks: string;
  } | null>(null);
  // 分享长图: 离屏渲染横版完整课表(含节次列, 不受滚动裁剪)
  const SHARE_W = 46 + 7 * CELL_W + 16;
  const hScrollRef = useRef<ScrollView>(null);
  const shotRef = useRef<View>(null);
  const hRef = useCallback((node: ScrollView | null) => {
    hScrollRef.current = node;
  }, []);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false); // 全屏横屏整周视图
  const queryTypeRef = useRef(queryType);
  queryTypeRef.current = queryType;
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  const refresh = useCallback(async (s?: Settings, type?: QueryType, date?: Date) => {
    // 优先用传入的; 否则用临时覆盖(其他班级); 最后用保存的设置
    const ov = getTempOverride();
    const target = s ?? ov ?? (await loadSettings());
    setSettings(target);
    setUsingTemp(!s && !!ov);
    setNow(beijingNow());
    if (!target) return;
    // 主页的查询类型跟随设置(主页可临时切换查看, 重新进入页面后恢复为设置值)
    if (!type) {
      setQueryType(target.queryType);
      queryTypeRef.current = target.queryType;
    }
    setLoading(true);
    setError(null);
    const t = type ?? queryTypeRef.current;
    try {
      // 每次查询都从首页重新建立会话(接口是状态链, 最稳妥)
      const initial = await loadInitial();
      const withMajors = await selectDepartment(initial, target.xb);
      const withClasses = await selectMajor(withMajors, target.xb, target.zy);
      const tt = await queryTimetable(
        withClasses,
        target.xb,
        target.zy,
        target.bj,
        t,
        date ?? selectedDateRef.current,
      );
      setTimetable(tt);
      // 按最新课表重排未来 7 天的提醒(上课前 5 分钟 + 下课前 1 分钟, 静默失败)
      scheduleClassReminders(tt);
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次切到该页面自动查询一次
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // 每分钟刷新一次"当前节次"显示
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => setNow(beijingNow()), 60_000);
      return () => clearInterval(t);
    }, []),
  );

  // 天气: 按 IP 定位查询(30 分钟缓存), 切到本页时顺带刷新
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchWeather()
        .then((w) => {
          if (alive) setWeather(w);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );

  const switchType = useCallback(
    (t: QueryType) => {
      setQueryType(t);
      if (settings) refresh(settings, t);
    },
    [settings, refresh],
  );

  const confirmDate = useCallback(
    (d: Date) => {
      setDatePickerOpen(false);
      setSelectedDate(d);
      selectedDateRef.current = d;
      // 不传 s: 临时查看时 refresh 内部会沿用 override, "回到我的班级"横幅得以保留
      refresh(undefined, queryTypeRef.current, d);
    },
    [refresh],
  );

  /** 前一天 / 后一天 */
  const shiftDate = useCallback(
    (delta: number) => {
      const d = new Date(selectedDateRef.current);
      d.setDate(d.getDate() + delta);
      confirmDate(d);
    },
    [confirmDate],
  );

  /** 退出临时查看, 回到"我的班级" */
  const exitTemp = useCallback(() => {
    setTempOverride(null);
    refresh();
  }, [refresh]);

  const bjDay = selectedDate.getDay(); // 0=周日
  const todayCol = WEEK_COLS.indexOf(WEEK_NAMES[bjDay]);
  const isToday = sameDay(selectedDate, now);
  // 当前节次按真实时间计算, 与查询哪天的课表无关(任何日期都定位到同一时间段行)
  const curPeriod = currentPeriod(now, periodTimes);

  // 自动滚动到"当前星期 + 当前节次"的十字位置
  const vScrollRef = useRef<ScrollView>(null);
  // 各行实测位置/高度(键=节次), 用于固定节次列对齐和纵向定位
  const [headerH, setHeaderH] = useState(0);
  const [tableH, setTableH] = useState(0);
  const [rowMetrics, setRowMetrics] = useState<Record<string, { y: number; h: number }>>({});

  /** 当前(或下一个)要定位到的节次行; 午休时定位到下午第一节 */
  const targetPeriod = curPeriod === '中午' ? '5-6' : curPeriod;

  /** 本节课剩余分钟数(真正处于上课时间段才显示; ≤10 分钟快下课) */
  const curLeft = (() => {
    if (!curPeriod || curPeriod === '中午') return null;
    const [s, e] = periodTimes[curPeriod];
    const mins = minutesOf(now);
    if (mins < parseHM(s) || mins > parseHM(e)) return null;
    return parseHM(e) - mins;
  })();

  /** 未来的考试(按天数升序, 最多 5 个) */
  const upcomingExams = exams
    .filter((e) => e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  /** 未过期的自定义倒计时(按天数升序) */
  const activeCds = cds
    .map((c) => ({ ...c, left: daysUntil(c.date) }))
    .filter((c) => c.left >= 0)
    .sort((a, b) => a.left - b.left);

  // 倒计时列表变化时同步
  useEffect(() => {
    void loadCountdowns().then(setCds);
    return subscribeCountdowns(() => void loadCountdowns().then(setCds));
  }, []);

  /** 课表长图分享: 截取离屏完整课表视图 */
  const shareSchedule = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('提示', '请在手机 App 内使用长图分享');
      return;
    }
    if (!shotRef.current) return;
    try {
      const uri = await captureRef(shotRef, {
        format: 'png',
        quality: 1,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '分享课表长图' });
      } else {
        Alert.alert('分享失败', '当前设备不支持分享');
      }
    } catch {
      Alert.alert('分享失败', '生成图片失败，请重试');
    }
  }, []);

  useEffect(() => {
    if (loading || !timetable || timetable.rows.length === 0) return;
    const t = setTimeout(() => {
      // 竖向: 滚到当前时间段所在行
      const m = targetPeriod ? rowMetrics[targetPeriod] : undefined;
      if (m) vScrollRef.current?.scrollTo({ y: Math.max(0, m.y - 70), animated: true });
      // 横向: 滚到查询日期所在列
      hScrollRef.current?.scrollTo({ x: Math.max(0, todayCol * CELL_W - 60), animated: true });
    }, 400);
    return () => clearTimeout(t);
  }, [loading, timetable, targetPeriod, todayCol, rowMetrics]);

  if (!settings) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>还没有配置班级</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            先去设置里选择系部、专业和班级，之后打开 APP 就会自动查询本周课表。
          </Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.push('/settings')}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>去设置</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={{ flex: 1 }} onPress={() => setDatePickerOpen(true)}>
          <View style={styles.titleRow}>
            <Text style={[styles.classTitle, { color: colors.text, flexShrink: 1 }]}>{settings.bjLabel}</Text>
            {weather && (
              <Pressable
                onPress={() => {
                  setWxOpen(true);
                  if (!wxFull && !wxLoading) {
                    setWxLoading(true);
                    fetchWeatherFull()
                      .then(setWxFull)
                      .catch(() => {})
                      .finally(() => setWxLoading(false));
                  }
                }}>
                <View style={[styles.weatherChip, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
                  <Ionicons
                    name={weather.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={15}
                    color={weather.tint}
                  />
                  <Text style={[styles.weatherText, { color: colors.text }]}>
                    {weather.city} {weather.temp}° {weather.desc}
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {isToday ? '今天' : '查询日'}：{fmtDate(selectedDate)} {WEEK_NAMES[bjDay]}（点击可选日期）
            {curPeriod
              ? curPeriod === '中午'
                ? ` · 当前：午休`
                : ` · 当前：${curPeriod} 节`
              : isToday
                ? ' · 当前：非上课时间'
                : ''}
            {curLeft != null && (
              <Text style={{ color: curLeft <= 10 ? '#f97316' : '#16a34a', fontWeight: '700' }}>
                {' · '}本节课还剩 {curLeft} 分钟
              </Text>
            )}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => refresh()}
          disabled={loading}
          style={[styles.refreshBtn, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
          <Text style={{ color: colors.text }}>{loading ? '查询中…' : '刷新'}</Text>
        </Pressable>
      </View>

      <TourTarget id="tt.toolbar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.typeSwitch}
        contentContainerStyle={styles.typeSwitchInner}>
        {(
          [
            ['realtime', '本周实时课表'],
            ['original', '原始课表'],
          ] as [QueryType, string][]
        ).map(([v, label]) => (
          <Pressable
            key={v}
            onPress={() => switchType(v)}
            style={[
              styles.typeTab,
              glassBorder(queryType === v),
              { backgroundColor: btnBg(queryType === v) ?? (queryType === v ? colors.backgroundSelected : colors.backgroundElement) },
            ]}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: queryType === v ? '700' : '400' }}>
              {label}
            </Text>
          </Pressable>
        ))}
        <View style={styles.dayBtnRow}>
          <Pressable
            onPress={() => router.push('/temp-query')}
            style={[styles.dayBtn, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
            <Text style={{ color: colors.text, fontSize: 13 }}>查其他班级</Text>
          </Pressable>
          <Pressable
            disabled={isToday}
            onPress={() => confirmDate(beijingNow())}
            style={[styles.dayBtn, glassBorder(isToday), { backgroundColor: glass ? (isToday ? 'rgba(37,99,235,0.15)' : 'transparent') : isToday ? 'rgba(37,99,235,0.10)' : '#2563eb', opacity: isToday && !glass ? 0.6 : 1 }]}>
            <Ionicons name="today-outline" size={14} color={isToday ? '#2563eb' : '#fff'} />
            <Text style={{ color: isToday ? '#2563eb' : '#fff', fontSize: 13, fontWeight: isToday ? '400' : '700' }}>回到今天</Text>
          </Pressable>
          <Pressable onPress={() => shiftDate(-1)} style={[styles.dayBtn, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
            <Text style={{ color: colors.text, fontSize: 13 }}>前一天</Text>
          </Pressable>
          <Pressable onPress={() => shiftDate(1)} style={[styles.dayBtn, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
            <Text style={{ color: colors.text, fontSize: 13 }}>后一天</Text>
          </Pressable>
          <Pressable onPress={() => shiftDate(-7)} style={[styles.dayBtn, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
            <Text style={{ color: colors.text, fontSize: 13 }}>上一周</Text>
          </Pressable>
          <Pressable onPress={() => shiftDate(7)} style={[styles.dayBtn, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
            <Text style={{ color: colors.text, fontSize: 13 }}>下一周</Text>
          </Pressable>
          <Pressable onPress={shareSchedule} style={[styles.dayBtn, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
            <Ionicons name="share-social-outline" size={14} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 13 }}>分享</Text>
          </Pressable>
          <Pressable
            onPress={() => setFullOpen(true)}
            style={[styles.dayBtn, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
            <Ionicons name="expand-outline" size={14} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 13 }}>全屏周视图</Text>
          </Pressable>
          <View style={{ width: 1, backgroundColor: 'rgba(128,128,128,0.3)' }} />
          <Pressable
            onPress={() => router.push('/todos')}
            style={[styles.dayBtn, { backgroundColor: 'rgba(22,163,74,0.12)' }]}>
            <Ionicons name="checkbox-outline" size={14} color="#16a34a" />
            <Text style={{ color: '#16a34a', fontSize: 13 }}>作业清单</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/gpa')}
            style={[styles.dayBtn, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
            <Ionicons name="stats-chart" size={14} color="#f59e0b" />
            <Text style={{ color: '#f59e0b', fontSize: 13 }}>成绩GPA</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/today')}
            style={[styles.dayBtn, { backgroundColor: 'rgba(22,163,74,0.12)' }]}>
            <Ionicons name="today-outline" size={14} color="#16a34a" />
            <Text style={{ color: '#16a34a', fontSize: 13 }}>今日课程</Text>
          </Pressable>
        </View>
      </ScrollView>
      </TourTarget>

      {usingTemp && settings && (
        <Pressable onPress={exitTemp} style={[styles.tempBanner, { backgroundColor: 'rgba(37,99,235,0.12)' }]}>
          <Text style={{ color: '#2563eb', fontSize: 12 }}>
            临时查看：{settings.bjLabel} · 点击返回我的班级
          </Text>
        </Pressable>
      )}

      {(upcomingExams.length > 0 || activeCds.length > 0) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.examStrip}
          contentContainerStyle={styles.examStripInner}>
          <View style={styles.examLead}>
            <Ionicons name="pencil" size={13} color="#ef4444" />
            <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>考试</Text>
          </View>
          {upcomingExams.map((e, i) => {
            const urgent = e.daysLeft <= 3;
            return (
              <View
                key={`${e.course}-${e.date}-${i}`}
                style={[styles.examCard, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
                <Text style={[styles.examDays, { color: urgent ? '#ef4444' : '#2563eb' }]}>
                  {e.daysLeft === 0 ? '今天考' : `${e.daysLeft} 天`}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                    {e.course || e.name}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                    {e.date}
                    {e.room ? ` · ${e.room}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
          {activeCds.length > 0 && (
            <View style={styles.examLead}>
              <Ionicons name="alarm" size={13} color="#8b5cf6" />
              <Text style={{ color: '#8b5cf6', fontSize: 12, fontWeight: '700' }}>倒计时</Text>
            </View>
          )}
          {activeCds.map((c, i) => (
            <View
              key={c.id}
              style={[styles.examCard, glassBorder(), { backgroundColor: btnBg() ?? colors.backgroundElement }]}>
              <Text style={[styles.examDays, { color: '#8b5cf6' }]}>
                {c.left === 0 ? '就是今天' : `${c.left} 天`}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                  {c.date}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {loading && <Text style={[styles.loadingText, { color: colors.textSecondary }]}>正在查询课表…</Text>}
      {!loading && timetable && timetable.rows.length === 0 && (
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>没有查询到课表数据</Text>
      )}
      {!loading && timetable && timetable.rows.length > 0 && (
        <TourTarget id="tt.grid">
        <PinchZoom>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tableContent}>
          <View style={styles.tableWrap}>
            {/* 左侧固定节次列(不随横向滚动, 按实测行位置绝对对齐) */}
            <View style={[styles.pinCol, { height: tableH || undefined }]}>
              <View
                style={[
                  styles.pinCell,
                  glassBorder(),
                  {
                    top: 0,
                    height: headerH || 34,
                    backgroundColor: glass ? 'transparent' : colors.backgroundElement,
                  },
                ]}>
                <Text style={[styles.cellText, { color: colors.textSecondary }]}>节次</Text>
              </View>
              {timetable.rows.map((row) => {
                const m = rowMetrics[row.period];
                if (!m) return null;
                const isTarget = targetPeriod === row.period;
                return (
                  <View
                    key={row.index}
                    style={[
                      styles.pinCell,
                      glassBorder(isTarget),
                      {
                        top: m.y,
                        height: m.h,
                        backgroundColor: isTarget ? '#2563eb' : glass ? 'transparent' : colors.backgroundElement,
                      },
                    ]}>
                    <Text
                      style={{
                        color: isTarget ? '#fff' : colors.text,
                        fontSize: 11,
                        textAlign: 'center',
                        fontWeight: isTarget ? '700' : '400',
                      }}>
                      {row.period}
                    </Text>
                  </View>
                );
              })}
            </View>
            {/* 右侧可横向滚动课表 */}
            <ScrollView
              ref={hRef}
              horizontal
              showsHorizontalScrollIndicator={false}>
              <View onLayout={(e) => setTableH(e.nativeEvent.layout.height)}>
                {/* 表头 */}
                <View
                  style={styles.row}
                  onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
                  {WEEK_COLS.map((d, i) => (
                    <View
                      key={d}
                      style={[
                        styles.cell,
                        styles.cellHead,
                        glassBorder(i === todayCol),
                        { backgroundColor: glass ? (i === todayCol ? 'rgba(37,99,235,0.15)' : 'transparent') : i === todayCol ? colors.backgroundSelected : colors.backgroundElement },
                      ]}>
                      <Text style={{ color: i === todayCol ? colors.text : colors.textSecondary, fontSize: 12 }}>
                        {d}
                        {i === todayCol && isToday ? ' (今天)' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
                {/* 数据行 */}
                {timetable.rows.map((row) => {
                  const isCur = curPeriod === row.period;
                  const isTarget = targetPeriod === row.period;
                  return (
                    <View
                      key={row.index}
                      onLayout={(e) => {
                        const { y, height } = e.nativeEvent.layout;
                        setRowMetrics((prev) =>
                          prev[row.period]?.y === y && prev[row.period]?.h === height
                            ? prev
                            : { ...prev, [row.period]: { y, h: height } },
                        );
                      }}
                      style={[styles.row, isTarget && styles.rowTarget]}>
                      {row.days.map((courses, i) => {
                        const isCross = isTarget && i === todayCol;
                        return (
                          <View
                            key={i}
                            style={[
                              styles.cell,
                              isCross && styles.cellCross,
                              glassBorder(i === todayCol),
                              { backgroundColor: glass ? (i === todayCol ? 'rgba(37,99,235,0.15)' : 'transparent') : i === todayCol ? colors.backgroundSelected : colors.backgroundElement },
                            ]}>
                            {isCross && courses.length === 0 ? (
                              <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center' }}>
                                空闲
                              </Text>
                            ) : (
                              courses.map((c, k) => (
                                <Pressable
                                  key={k}
                                  onPress={() =>
                                    setDetailCell({
                                      period: row.period,
                                      dayIdx: i,
                                      name: c.name,
                                      location: c.location,
                                      teacher: c.teacher,
                                      weeks: c.weeks,
                                    })
                                  }>
                                  <View
                                    style={[
                                      styles.course,
                                      isCur && { backgroundColor: 'rgba(37,99,235,0.12)', borderRadius: 8 },
                                    ]}>
                                    <Text style={[styles.courseName, { color: colors.text }]} numberOfLines={3}>
                                      {c.name}
                                    </Text>
                                    {!!c.location && (
                                      <Text style={{ color: colors.textSecondary, fontSize: 10 }}>@{c.location}</Text>
                                    )}
                                    {!!c.teacher && (
                                      <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{c.teacher}</Text>
                                    )}
                                    {queryType === 'original' && !!c.weeks && (
                                      <Text style={{ color: '#2563eb', fontSize: 10 }}>{c.weeks}</Text>
                                    )}
                                  </View>
                                </Pressable>
                              ))
                            )}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
        </PinchZoom>
        </TourTarget>
      )}
      {/* 全屏横屏整周视图(捏合缩放) */}
      {timetable && (
        <FullWeekView
          visible={fullOpen}
          onClose={() => setFullOpen(false)}
          rows={timetable.rows}
          colors={colors}
          todayCol={todayCol}
          isToday={isToday}
          curPeriod={curPeriod}
        />
      )}
      {/* 课程详情卡 */}
      <Modal visible={!!detailCell} transparent animationType="fade" onRequestClose={() => setDetailCell(null)}>
        <Pressable style={styles.modalMask} onPress={() => setDetailCell(null)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{detailCell?.name}</Text>
            {[
              ['节次', detailCell?.period],
              ['星期', detailCell ? WEEK_COLS[detailCell.dayIdx] : ''],
              ['教室', detailCell?.location || '未指定'],
              ['教师', detailCell?.teacher || '未指定'],
              ['周次', detailCell?.weeks || '全学期'],
            ].map(([label, val]) => (
              <View key={label} style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
                <Text style={{ color: colors.text, flex: 1, textAlign: 'right' }}>{val}</Text>
              </View>
            ))}
            {/* 节次对应时间: 起止时间 + 查询日为今天时的动态倒计时 */}
            {!!detailCell &&
              (() => {
                const t = periodTimes[detailCell.period];
                if (!t) return null;
                const mins = minutesOf(now);
                const s = parseHM(t[0]);
                const e = parseHM(t[1]);
                let hint: string | null = null;
                let hintColor: string = colors.textSecondary;
                if (sameDay(selectedDate, now)) {
                  if (mins < s) {
                    hint = `距上课还有 ${s - mins} 分钟`;
                    hintColor = '#2563eb';
                  } else if (mins < e) {
                    hint = `已上课 · 还有 ${e - mins} 分钟下课`;
                    hintColor = '#16a34a';
                  } else {
                    hint = '本节已下课';
                  }
                }
                return (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>时间</Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ color: colors.text }}>
                        {t[0]} – {t[1]}
                      </Text>
                      {!!hint && <Text style={{ color: hintColor, fontSize: 12 }}>{hint}</Text>}
                    </View>
                  </View>
                );
              })()}
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setDetailCell(null)}
                style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
                <Text style={{ color: colors.text }}>关闭</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!detailCell) return;
                  router.push({
                    pathname: '/todos',
                    params: {
                      course: detailCell.name,
                      linkDay: WEEK_COLS[detailCell.dayIdx],
                      linkPeriod: detailCell.period,
                    },
                  });
                  setDetailCell(null);
                }}
                style={[styles.modalBtn, { backgroundColor: '#16a34a' }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>记这节课的作业</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <DatePickModal
        visible={datePickerOpen}
        value={selectedDate}
        onClose={() => setDatePickerOpen(false)}
        onConfirm={confirmDate}
        colors={colors}
      />
      <WeatherModal
        visible={wxOpen}
        data={wxFull}
        loading={wxLoading}
        onClose={() => setWxOpen(false)}
        onChangeCity={(c) => {
          void setWeatherCity(c).then(() => {
            setWxLoading(true);
            fetchWeatherFull()
              .then(setWxFull)
              .catch(() => {})
              .finally(() => setWxLoading(false));
          });
        }}
      />

      {/* 离屏横版周课表(仅用于生成分享长图): 表头节次格固定 46pt 与数据行对齐 */}
      {!loading && timetable && timetable.rows.length > 0 && (
        <View ref={shotRef} collapsable={false} style={[styles.shareSheet, { width: SHARE_W }]}>
          <Text style={styles.shareTitle}>{settings.bjLabel} · 周课表</Text>
          <Text style={styles.shareSub}>
            {fmtDate(selectedDate)} {WEEK_NAMES[bjDay]}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <View style={[styles.shareCell, styles.shareHeadCell, { width: 46 }]}>
              <Text style={styles.shareHeadText} numberOfLines={1}>
                节次
              </Text>
            </View>
            {WEEK_COLS.map((d) => (
              <View key={d} style={[styles.shareCell, styles.shareHeadCell]}>
                <Text style={styles.shareHeadText} numberOfLines={1}>
                  {d}
                </Text>
              </View>
            ))}
          </View>
          {timetable.rows.map((row) => (
            <View key={row.index} style={{ flexDirection: 'row' }}>
              <View style={[styles.shareCell, styles.sharePinCell]}>
                <Text style={styles.sharePinText}>{row.period}</Text>
              </View>
              {row.days.map((courses, i) => (
                <View key={i} style={styles.shareCell}>
                  {courses.map((c, k) => (
                    <View key={k} style={styles.shareCourse}>
                      <Text style={styles.shareCourseName} numberOfLines={3}>
                        {c.name}
                      </Text>
                      {!!c.location && <Text style={styles.shareCourseMeta}>@{c.location}</Text>}
                      {!!c.teacher && <Text style={styles.shareCourseMeta}>{c.teacher}</Text>}
                      {!!c.weeks && <Text style={styles.shareCourseWeeks}>{c.weeks}</Text>}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}
          <Text style={styles.shareFoot}>来自班级课表 · 长沙环境保护职业技术学院</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const CELL_W = 108;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.two },
  classTitle: { fontSize: 22, fontWeight: '800' },
  dateText: { fontSize: 13, marginTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weatherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  weatherText: { fontSize: 12, fontWeight: '600' },
  refreshBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  typeSwitch: { marginTop: Spacing.two, flexGrow: 0 },
  typeSwitchInner: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, alignItems: 'center' },
  typeTab: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  dayBtnRow: { flexDirection: 'row', gap: Spacing.one, alignItems: 'center' },
  dayBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  examStrip: { marginTop: Spacing.one, flexGrow: 0 },
  examStripInner: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.three, alignItems: 'center' },
  examLead: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  examCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: 150, flexShrink: 0 },
  examDays: { fontSize: 14, fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  detailLabel: { fontSize: 13, width: 56 },
  tempBanner: { marginHorizontal: Spacing.three, marginTop: Spacing.one, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center' },
  error: { color: '#ef4444', paddingHorizontal: Spacing.three, marginTop: Spacing.two },
  loadingText: { paddingHorizontal: Spacing.three, marginTop: Spacing.three },
  tableContent: { padding: Spacing.three, paddingBottom: 40 },
  tableWrap: { flexDirection: 'row', alignSelf: 'flex-start' },
  pinCol: { width: 46 },
  pinCell: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row' },
  rowTarget: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 4, overflow: 'hidden' },
  cellCross: { borderWidth: 2, borderColor: '#2563eb', borderRadius: 4 },
  cell: { width: CELL_W, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.35)', padding: 5, minHeight: 86 },
  cellPeriod: { width: 46, justifyContent: 'center' },
  cellHead: { minHeight: 34, justifyContent: 'center', alignItems: 'center' },
  cellText: { fontSize: 12 },
  course: { marginBottom: 6, padding: 4 },
  courseName: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  emptyBtn: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12, marginTop: Spacing.two },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.four },
  modalBox: { borderRadius: 14, padding: Spacing.three },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: Spacing.two },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  calWeekRow: { flexDirection: 'row', marginBottom: 2 },
  calWeek: { flex: 1, textAlign: 'center', fontSize: 11 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: { width: `${100 / 7}%`, aspectRatio: 1.35, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  modalBtn: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 12 },
  // 离屏分享长图(横版白底课表, 宽度 = 节次46 + 7列 + 左右padding)
  shareSheet: {
    position: 'absolute',
    left: -10000,
    top: 0,
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  shareTitle: { fontSize: 17, fontWeight: '800', color: '#111827', textAlign: 'center' },
  shareSub: { fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 2, marginBottom: 8 },
  shareCell: {
    width: CELL_W,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.4)',
    padding: 4,
    minHeight: 56,
  },
  shareHeadCell: { minHeight: 26, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef2ff' },
  shareHeadText: { fontSize: 12, fontWeight: '700', color: '#111827' },
  sharePinCell: { width: 46, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6' },
  sharePinText: { fontSize: 11, color: '#374151' },
  shareCourse: { marginBottom: 4, padding: 3 },
  shareCourseName: { fontSize: 11, fontWeight: '600', color: '#111827' },
  shareCourseMeta: { fontSize: 10, color: '#6b7280' },
  shareCourseWeeks: { fontSize: 10, color: '#2563eb' },
  shareFoot: { fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 8 },
});
