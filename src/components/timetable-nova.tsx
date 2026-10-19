/** 新版课表界面(Nova): 日程时间轴视图
 *  与经典网格界面完全独立; 默认显示今天(可点日期条选任意一天),
 *  课程卡片按名称着色, 标注上课中/下一节/已结束。 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePageBackground, useBgSetting } from '@/lib/background';
import {
  beijingNow,
  loadInitial,
  queryTimetable,
  selectDepartment,
  selectMajor,
  type Timetable,
} from '@/lib/timetable';
import { loadSettings, saveTimetableUI, type TimetableUI } from '@/lib/settings';
import { getPeriodTimes, subscribeTimes } from '@/lib/schedule-times';

const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const PERIOD_ORDER = ['1-2', '3-4', '中午', '5-6', '7-8', '9-10'];

function parseHM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 课程名 → 稳定色相(同一课程永远同色) */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

type Item = {
  period: string;
  time: [string, string] | null;
  name: string;
  location: string;
  teacher: string;
};

export function NovaTimetable({ onSwitchUI }: { onSwitchUI: (ui: TimetableUI) => void }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  // 控件全透明模式: 只留文字 + 1px 外轮廓
  const glass = !!bgSetting.uri && !!bgSetting.ctrl;
  const glassLine = isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const router = useRouter();

  const [className, setClassName] = useState('');
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noSettings, setNoSettings] = useState(false);
  const [now, setNow] = useState(() => beijingNow());
  const [selected, setSelected] = useState(() => beijingNow());
  const [periodTimes, setPeriodTimes] = useState(getPeriodTimes());

  useEffect(() => subscribeTimes(() => setPeriodTimes(getPeriodTimes())), []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        setError(null);
        setNoSettings(false);
        try {
          const s = await loadSettings();
          if (!s) {
            if (alive) setNoSettings(true);
            return;
          }
          if (alive) setClassName(s.bjLabel);
          const initial = await loadInitial();
          const withMajors = await selectDepartment(initial, s.xb);
          const withClasses = await selectMajor(withMajors, s.xb, s.zy);
          const tt = await queryTimetable(withClasses, s.xb, s.zy, s.bj, 'realtime', selected);
          if (alive) setTimetable(tt);
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : '查询失败，请重试');
        } finally {
          if (alive) setLoading(false);
        }
      })();
      const t = setInterval(() => alive && setNow(beijingNow()), 60_000);
      return () => {
        alive = false;
        clearInterval(t);
      };
    }, [selected]),
  );

  const mins = now.getHours() * 60 + now.getMinutes();

  /** 本周一的日期 */
  const mondayOf = (d: Date) => {
    const m = new Date(d);
    m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    m.setHours(0, 0, 0, 0);
    return m;
  };
  const monday = mondayOf(selected);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const col = (selected.getDay() + 6) % 7;
  const items: Item[] = timetable
    ? timetable.rows
        .flatMap((row) =>
          (row.days[col] ?? [])
            .filter((c) => c.name)
            .map((c) => ({
              period: row.period,
              time: periodTimes[row.period] ?? null,
              name: c.name,
              location: c.location,
              teacher: c.teacher,
            })),
        )
        .sort((a, b) => PERIOD_ORDER.indexOf(a.period) - PERIOD_ORDER.indexOf(b.period))
    : [];

  const statusOf = (it: Item): -1 | 0 | 1 => {
    if (!it.time) return 1;
    if (mins > parseHM(it.time[1])) return -1;
    if (mins >= parseHM(it.time[0])) return 0;
    return 1;
  };
  const nextIdx = items.findIndex((it) => statusOf(it) >= 0);
  const remainMin = (it: Item) =>
    it.time ? parseHM(it.time[1]) - mins : 0;

  const switchUI = async (ui: TimetableUI) => {
    await saveTimetableUI(ui);
    onSwitchUI(ui);
  };

  const cardColors = (name: string) => {
    const h = hueOf(name);
    return isDark
      ? { bg: `hsl(${h}, 32%, 24%)`, fg: `hsl(${h}, 70%, 82%)`, sub: `hsl(${h}, 25%, 72%)` }
      : { bg: `hsl(${h}, 75%, 93%)`, fg: `hsl(${h}, 55%, 34%)`, sub: `hsl(${h}, 30%, 45%)` };
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {/* 顶栏 */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }} numberOfLines={1}>
            {className || '班级课表'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            {selected.getMonth() + 1}月{selected.getDate()}日 · {WEEK_NAMES[selected.getDay()] && `星期${WEEK_NAMES[selected.getDay()]}`}
            {sameDay(selected, now) ? ' · 今天' : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => void switchUI('classic')}
          style={[styles.headerBtn, glass ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: glassLine } : null, { backgroundColor: glass ? 'transparent' : colors.backgroundElement }]}>
          <Ionicons name="grid-outline" size={14} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 12 }}>经典</Text>
        </Pressable>
        {!sameDay(selected, now) && (
          <Pressable
            onPress={() => setSelected(beijingNow())}
            style={[styles.headerBtn, { backgroundColor: '#2563eb' }]}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>今天</Text>
          </Pressable>
        )}
      </View>

      {/* 周日期条 */}
      <View
        style={[
          styles.weekRow,
          glass ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: glassLine } : null,
          { backgroundColor: glass ? 'transparent' : colors.backgroundElement },
        ]}>
        {weekDays.map((d, i) => {
          const active = sameDay(d, selected);
          const today = sameDay(d, now);
          return (
            <Pressable
              key={i}
              onPress={() => setSelected(new Date(d))}
              style={[
                styles.dayChip,
                active ? { backgroundColor: '#2563eb' } : { backgroundColor: 'transparent' },
                today && !active && { borderWidth: 1.5, borderColor: '#2563eb' },
              ]}>
              <Text style={{ color: active ? 'rgba(255,255,255,0.85)' : colors.textSecondary, fontSize: 10 }}>
                {WEEK_NAMES[(i + 1) % 7]}
              </Text>
              <Text style={{ color: active ? '#fff' : colors.text, fontSize: 15, fontWeight: '700' }}>
                {d.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color="#2563eb" />
          <Text style={{ color: colors.textSecondary, marginTop: 10 }}>正在查询课表…</Text>
        </View>
      )}

      {!loading && noSettings && (
        <View style={styles.center}>
          <Ionicons name="settings-outline" size={40} color={colors.textSecondary} />
          <Text style={{ color: colors.text, marginTop: 10 }}>还没有配置班级</Text>
          <Pressable onPress={() => router.push('/settings')} style={styles.goSetBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>去设置</Text>
          </Pressable>
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#ef4444" />
          <Text style={{ color: colors.textSecondary, marginTop: 10, paddingHorizontal: 40, textAlign: 'center' }}>{error}</Text>
        </View>
      )}

      {!loading && !noSettings && !error && items.length === 0 && (
        <View style={styles.center}>
          <Ionicons name="sunny-outline" size={44} color="#f59e0b" />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 12 }}>这一天没有课</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 6 }}>看看别的日子吧</Text>
        </View>
      )}

      {!loading && !noSettings && !error && items.length > 0 && (
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {items.map((it, i) => {
            const st = statusOf(it);
            const cc = cardColors(it.name);
            return (
              <View key={`${it.period}-${it.name}-${i}`} style={styles.row}>
                {/* 左侧时间轴 */}
                <View style={styles.timeCol}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>{it.period}</Text>
                  {it.time && <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{it.time[0]}</Text>}
                  {it.time && <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{it.time[1]}</Text>}
                  {i < items.length - 1 && <View style={[styles.timelineLine, { backgroundColor: 'rgba(128,128,128,0.3)' }]} />}
                </View>
                {/* 课程卡片 */}
                <Pressable
                  style={[
                    styles.courseCard,
                    glass
                      ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: cc.fg }
                      : { backgroundColor: cc.bg },
                    st === 0 && { borderWidth: 2, borderColor: '#16a34a' },
                    st < 0 && { opacity: 0.5 },
                  ]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: cc.fg, fontSize: 15, fontWeight: '800' }} numberOfLines={2}>
                      {it.name}
                    </Text>
                    <Text style={{ color: cc.sub, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                      {[it.location, it.teacher].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                  {st === 0 && (
                    <View style={[styles.stateChip, { backgroundColor: 'rgba(22,163,74,0.18)' }]}>
                      <Text style={{ color: '#16a34a', fontSize: 11, fontWeight: '700' }}>
                        {remainMin(it) > 0 ? `还剩${remainMin(it)}分钟` : '上课中'}
                      </Text>
                    </View>
                  )}
                  {st === 1 && i === nextIdx && (
                    <View style={[styles.stateChip, { backgroundColor: 'rgba(37,99,235,0.15)' }]}>
                      <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '700' }}>下一节</Text>
                    </View>
                  )}
                  {st < 0 && (
                    <View style={[styles.stateChip, { backgroundColor: 'rgba(128,128,128,0.15)' }]}>
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>已结束</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })}
          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 14 }}>
            按本周实时课表显示 · 每分钟刷新状态
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  weekRow: { flexDirection: 'row', marginHorizontal: Spacing.three, marginTop: 12, borderRadius: 14, padding: 5 },
  dayChip: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 6, gap: 1 },
  list: { flex: 1, paddingHorizontal: Spacing.three, marginTop: 14 },
  row: { flexDirection: 'row', gap: 12 },
  timeCol: { width: 46, alignItems: 'center', gap: 1 },
  timelineLine: { flex: 1, width: 2, borderRadius: 1, marginTop: 6, marginBottom: 6 },
  courseCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12, marginBottom: 12 },
  stateChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  goSetBtn: { backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 14 },
});
