/** 今日课程: 从实时课表提取今天所有课程, 按时间排列并标注当前/下一节 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePageBackground } from '@/lib/background';
import {
  beijingNow,
  loadInitial,
  queryTimetable,
  selectDepartment,
  selectMajor,
  type Timetable,
} from '@/lib/timetable';
import { loadSettings } from '@/lib/settings';
import { getPeriodTimes, subscribeTimes } from '@/lib/schedule-times';

const WEEK_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 每个大节的上课时间 — 从作息时间表动态读取(支持冬季/夏季/自定义) */
const PERIOD_ORDER = ['1-2', '3-4', '中午', '5-6', '7-8', '9-10'];

function parseHM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function TodayScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  const router = useRouter();

  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => beijingNow());
  const [periodTimes, setPeriodTimes] = useState<Record<string, [string, string]>>(getPeriodTimes());

  // 跟随作息时间表变化(手动编辑/JSON 导入/切换季节后自动刷新)
  useEffect(() => subscribeTimes(() => setPeriodTimes(getPeriodTimes())), []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        setError(null);
        setTimetable(null);
        try {
          const s = await loadSettings();
          if (!s) {
            if (alive) setError('还没有配置班级，请先到「我的」里设置班级');
            return;
          }
          const initial = await loadInitial();
          const withMajors = await selectDepartment(initial, s.xb);
          const withClasses = await selectMajor(withMajors, s.xb, s.zy);
          const tt = await queryTimetable(withClasses, s.xb, s.zy, s.bj, 'realtime', beijingNow());
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
    }, []),
  );

  const day = now.getDay(); // 0=周日
  const col = (day + 6) % 7; // 0..6 = 星期一~星期日
  const mins = now.getHours() * 60 + now.getMinutes();

  const items = timetable
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
              weeks: c.weeks,
            })),
        )
        .sort((a, b) => PERIOD_ORDER.indexOf(a.period) - PERIOD_ORDER.indexOf(b.period))
    : [];

  /** 节次状态: -1 已结束 / 0 上课中 / 1 未开始 */
  const statusOf = (period: string): number => {
    const t = periodTimes[period];
    if (!t) return 1;
    if (mins > parseHM(t[1])) return -1;
    if (mins >= parseHM(t[0])) return 0;
    return 1;
  };
  const nextIdx = items.findIndex((it) => statusOf(it.period) >= 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 16 }}>返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>今日课程</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={[styles.dateText, { color: colors.textSecondary }]}>
        {fmtDate(now)} {WEEK_NAMES[day]}
      </Text>

      {loading && (
        <View style={styles.centerWrap}>
          <ActivityIndicator color="#2563eb" />
          <Text style={{ color: colors.textSecondary, marginTop: 10 }}>正在查询课表…</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={40} color="#ef4444" />
          <Text style={{ color: colors.textSecondary, marginTop: 10, textAlign: 'center', paddingHorizontal: 40 }}>
            {error}
          </Text>
        </View>
      )}

      {!loading && !error && items.length === 0 && (
        <View style={styles.centerWrap}>
          <Ionicons name="sunny-outline" size={44} color="#f59e0b" />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 12 }}>今天没有课</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 6 }}>好好休息，或去图书馆自习吧</Text>
        </View>
      )}

      {!loading && !error && items.length > 0 && (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {items.map((it, i) => {
            const st = statusOf(it.period);
            const isNext = i === nextIdx;
            return (
              <View
                key={`${it.period}-${it.name}-${i}`}
                style={[
                  styles.card,
                  { backgroundColor: colors.backgroundElement },
                  st === 0 && { borderWidth: 2, borderColor: '#16a34a' },
                  isNext && st === 1 && { borderWidth: 2, borderColor: '#2563eb' },
                  st < 0 && { opacity: 0.55 },
                ]}>
                <View style={[styles.timeCol, { backgroundColor: st === 0 ? '#16a34a' : isNext ? '#2563eb' : 'rgba(128,128,128,0.25)' }]}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{it.period}</Text>
                  {!!it.time && <Text style={styles.timeText}>{it.time[0]}</Text>}
                  {!!it.time && <Text style={styles.timeText}>{it.time[1]}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={2}>
                    {it.name}
                  </Text>
                  <View style={styles.metaRow}>
                    {!!it.location && (
                      <View style={styles.metaChip}>
                        <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{it.location}</Text>
                      </View>
                    )}
                    {!!it.teacher && (
                      <View style={styles.metaChip}>
                        <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{it.teacher}</Text>
                      </View>
                    )}
                  </View>
                </View>
                {st === 0 ? (
                  <View style={[styles.stateChip, { backgroundColor: 'rgba(22,163,74,0.14)' }]}>
                    <Text style={{ color: '#16a34a', fontSize: 11, fontWeight: '700' }}>上课中</Text>
                  </View>
                ) : isNext ? (
                  <View style={[styles.stateChip, { backgroundColor: 'rgba(37,99,235,0.12)' }]}>
                    <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '700' }}>下一节</Text>
                  </View>
                ) : st < 0 ? (
                  <View style={[styles.stateChip, { backgroundColor: 'rgba(128,128,128,0.15)' }]}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>已结束</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          <Text style={[styles.note, { color: colors.textSecondary }]}>按本周实时课表显示 · 每分钟自动刷新状态</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 60 },
  title: { fontSize: 17, fontWeight: '800' },
  dateText: { textAlign: 'center', fontSize: 13, marginTop: 6 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  list: { padding: Spacing.three, gap: 10, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12, overflow: 'hidden' },
  timeCol: { width: 52, borderRadius: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 1 },
  timeText: { color: 'rgba(255,255,255,0.85)', fontSize: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stateChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  note: { fontSize: 11, textAlign: 'center', marginTop: 6 },
});
