/** 成绩统计: 平均分 / 平均绩点(等权重估算) / 学期趋势 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePageBackground } from '@/lib/background';
import { getGradesStat, scoreToGpa, type GradesStat } from '@/lib/school-data';

export default function GpaScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  const router = useRouter();

  const [stat, setStat] = useState<GradesStat | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    try {
      const r = await getGradesStat(force);
      setStat(r.stat);
      setStale(r.stale);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const maxAvg = stat ? Math.max(80, ...stat.terms.map((t) => t.avg)) : 100;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 16 }}>返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>成绩统计</Text>
        <Pressable onPress={() => load(true)} style={styles.backBtn}>
          <Ionicons name="refresh" size={20} color={colors.text} />
        </Pressable>
      </View>

      {loading && !stat && <Text style={[styles.loading, { color: colors.textSecondary }]}>正在读取成绩…</Text>}

      {!loading && !stat && (
        <Text style={[styles.loading, { color: colors.textSecondary }]}>
          没有读到成绩数据。请先在"主站"登录，然后回到这里刷新。
        </Text>
      )}

      {stale && (
        <Text style={styles.stale}>网络异常，展示的是上次缓存的数据</Text>
      )}

      {stat && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* 总览 */}
          <View style={styles.overview}>
            <View style={[styles.overCard, { backgroundColor: colors.backgroundElement }]}>
              <Text style={[styles.overLabel, { color: colors.textSecondary }]}>总平均分</Text>
              <Text style={[styles.overValue, { color: '#2563eb' }]}>{stat.overallAvg}</Text>
            </View>
            <View style={[styles.overCard, { backgroundColor: colors.backgroundElement }]}>
              <Text style={[styles.overLabel, { color: colors.textSecondary }]}>平均绩点</Text>
              <Text style={[styles.overValue, { color: '#16a34a' }]}>{stat.overallGpa.toFixed(2)}</Text>
            </View>
            <View style={[styles.overCard, { backgroundColor: colors.backgroundElement }]}>
              <Text style={[styles.overLabel, { color: colors.textSecondary }]}>课程数</Text>
              <Text style={[styles.overValue, { color: colors.text }]}>{stat.count}</Text>
            </View>
          </View>

          {/* 学期趋势(条形) */}
          <View style={[styles.trend, { backgroundColor: colors.backgroundElement }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>学期平均分</Text>
            {stat.terms.map((t) => (
              <View key={t.term} style={styles.barRow}>
                <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{t.term}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.max(6, (t.avg / maxAvg) * 100)}%`, backgroundColor: t.avg >= 80 ? '#16a34a' : t.avg >= 70 ? '#d97706' : '#ef4444' },
                    ]}
                  />
                </View>
                <Text style={[styles.barValue, { color: colors.text }]}>{t.avg}</Text>
              </View>
            ))}
          </View>

          {/* 学期明细 */}
          {stat.terms.map((t) => (
            <View key={t.term} style={[styles.termCard, { backgroundColor: colors.backgroundElement }]}>
              <Pressable
                style={styles.termHead}
                onPress={() => setOpenTerm(openTerm === t.term ? null : t.term)}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{t.term}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {t.count} 门课 · 平均 {t.avg} · 绩点 {t.gpa.toFixed(2)}
                  </Text>
                </View>
                <Ionicons name={openTerm === t.term ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
              </Pressable>
              {openTerm === t.term &&
                t.courses.map((c) => {
                  const score = parseFloat(c.total) || 0;
                  const lvl = score ? '' : c.level;
                  const gpa = scoreToGpa(score || ({ 优秀: 95, 良好: 85, 中等: 75, 及格: 65 } as Record<string, number>)[c.level] || 0);
                  return (
                    <View key={c.course + c.term} style={[styles.courseRow, { borderTopColor: colors.background }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 14 }}>{c.course}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                          {c.assess}
                          {c.total ? ` · 总评 ${c.total}` : ''}
                          {c.examScore ? ` · 考试 ${c.examScore}` : ''}
                          {c.regular ? ` · 平时 ${c.regular}` : ''}
                        </Text>
                      </View>
                      <Text style={{ color: score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#ef4444', fontWeight: '700' }}>
                        {score || lvl}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, width: 46, textAlign: 'right' }}>
                        绩点 {score || lvl ? gpa.toFixed(1) : '—'}
                      </Text>
                    </View>
                  );
                })}
            </View>
          ))}

          <Text style={[styles.note, { color: colors.textSecondary }]}>
            绩点按 (分数-50)/10 的 5 分制估算，等级课折算：优95 / 良85 / 中75 / 及格65；未含学分加权，仅供参考
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 64 },
  title: { fontSize: 17, fontWeight: '800' },
  loading: { textAlign: 'center', marginTop: 40, paddingHorizontal: Spacing.three },
  stale: { color: '#d97706', fontSize: 12, textAlign: 'center', marginTop: 6 },
  content: { padding: Spacing.three, gap: 12, paddingBottom: 40 },
  overview: { flexDirection: 'row', gap: 10 },
  overCard: { flex: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 14 },
  overLabel: { fontSize: 12 },
  overValue: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  trend: { borderRadius: 14, padding: 14 },
  sectionTitle: { fontWeight: '800', fontSize: 15, marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { width: 78, fontSize: 11 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: 'rgba(37,99,235,0.10)' },
  barFill: { height: 10, borderRadius: 5 },
  barValue: { width: 34, fontSize: 12, textAlign: 'right', fontWeight: '600' },
  termCard: { borderRadius: 14, padding: 12 },
  termHead: { flexDirection: 'row', alignItems: 'center' },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8, marginTop: 8 },
  note: { fontSize: 11, textAlign: 'center' },
});
