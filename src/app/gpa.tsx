/** 成绩统计: 平均分 / 学分加权绩点 / 目标 GPA 反推 / 学期趋势 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PageBackdrop, usePageBackground } from '@/lib/background';
import { GlassSurface } from '@/components/glass-surface';
import {
  getGradesStat,
  gradeKey,
  gradeScore,
  gpaToScore,
  loadCredits,
  loadGpaGoal,
  requiredGpa,
  saveGpaGoal,
  scoreToGpa,
  setCredit,
  subscribeCredits,
  weightedGpa,
  type GradeCourse,
  type GradesStat,
} from '@/lib/school-data';

const CREDIT_STEPS = ['0.5', '1', '2', '3', '4', '5'];

export default function GpaScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  const router = useRouter();

  const [stat, setStat] = useState<GradesStat | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  // 学分由用户自己填写(教务页面不返回学分)
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [goalTarget, setGoalTarget] = useState('');
  const [goalRemain, setGoalRemain] = useState('');
  const [editing, setEditing] = useState<{ key: string; name: string; value: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const shotRef = useRef<ScrollView>(null);

  /** 把整页成绩截成图片分享(含滚动区域全部内容) */
  const shareImage = useCallback(async () => {
    if (!shotRef.current || sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(shotRef as unknown as RefObject<View>, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        snapshotContentContainer: true,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '分享成绩统计' });
      }
    } catch (e) {
      Alert.alert('导出失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSharing(false);
    }
  }, [sharing]);

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

  useEffect(() => {
    void loadCredits().then(setCredits);
    void loadGpaGoal().then((g) => {
      setGoalTarget(g.target ? String(g.target) : '');
      setGoalRemain(g.remainCredits ? String(g.remainCredits) : '');
    });
    return subscribeCredits(() => {
      void loadCredits().then(setCredits);
    });
  }, []);

  const maxAvg = stat ? Math.max(80, ...stat.terms.map((t) => t.avg)) : 100;

  // 挂科预警: 总评低于 60(含等级制"不及格/不合格")
  const failing = stat
    ? stat.terms.flatMap((t) =>
        t.courses
          .filter((c) => (c.total || c.level) && gradeScore(c) < 60)
          .map((c) => ({ term: t.term, course: c.course, score: gradeScore(c), level: c.level })),
      )
    : [];
  const danger = scheme === 'dark' ? '#f87171' : '#dc2626';

  const allCourses: GradeCourse[] = stat ? stat.terms.flatMap((t) => t.courses) : [];
  const overall = weightedGpa(allCourses, credits);
  const gpaShown = overall.credited ? overall.gpa : stat?.overallGpa ?? 0;

  const targetNum = parseFloat(goalTarget);
  const remainNum = parseFloat(goalRemain);
  const needGpa =
    overall.credited > 0 && targetNum > 0 && remainNum > 0
      ? requiredGpa(targetNum, overall.gpa, overall.credits, remainNum)
      : null;

  const saveGoal = useCallback((target: string, remain: string) => {
    const t = parseFloat(target);
    const r = parseFloat(remain);
    void saveGpaGoal({ target: Number.isFinite(t) ? t : 0, remainCredits: Number.isFinite(r) ? r : 0 });
  }, []);

  const saveCredit = useCallback(
    (value: string | null) => {
      if (!editing) return;
      const n = value == null ? NaN : parseFloat(value);
      void setCredit(editing.key, Number.isFinite(n) && n > 0 ? n : null);
      setEditing(null);
    },
    [editing],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <PageBackdrop />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 16 }}>返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>成绩统计</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => void shareImage()}
            disabled={!stat || sharing}
            hitSlop={6}
            style={[styles.backBtn, { opacity: stat ? 1 : 0.35 }]}>
            {sharing ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Ionicons name="share-outline" size={21} color={colors.text} />
            )}
          </Pressable>
          <Pressable onPress={() => load(true)} style={styles.backBtn}>
            <Ionicons name="refresh" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {loading && !stat && <Text style={[styles.loading, { color: colors.textSecondary }]}>正在读取成绩…</Text>}

      {!loading && !stat && (
        <Text style={[styles.loading, { color: colors.textSecondary }]}>
          没有读到成绩数据。请先在"主站"登录，然后回到这里刷新。
        </Text>
      )}

      {stale && <Text style={styles.stale}>网络异常，展示的是上次缓存的数据</Text>}

      {stat && (
        <ScrollView
          ref={shotRef}
          contentContainerStyle={[styles.content, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}>
          {/* 总览 */}
          <View style={styles.overview}>
            <View style={[styles.overCard, { backgroundColor: colors.backgroundElement }]}>
              <GlassSurface radius={14} />
              <Text style={[styles.overLabel, { color: colors.textSecondary }]}>总平均分</Text>
              <Text style={[styles.overValue, { color: colors.primary }]}>{stat.overallAvg}</Text>
              <Text style={[styles.overSub, { color: colors.textSecondary }]}>等权平均</Text>
            </View>
            <View style={[styles.overCard, { backgroundColor: colors.backgroundElement }]}>
              <GlassSurface radius={14} />
              <Text style={[styles.overLabel, { color: colors.textSecondary }]}>
                {overall.credited ? '加权绩点' : '平均绩点'}
              </Text>
              <Text style={[styles.overValue, { color: '#16a34a' }]}>{Number(gpaShown).toFixed(2)}</Text>
              <Text style={[styles.overSub, { color: colors.textSecondary }]}>
                {overall.credited ? `${overall.credits} 学分 · ${overall.credited}/${overall.total} 门` : '未填学分'}
              </Text>
            </View>
            <View style={[styles.overCard, { backgroundColor: colors.backgroundElement }]}>
              <GlassSurface radius={14} />
              <Text style={[styles.overLabel, { color: colors.textSecondary }]}>课程数</Text>
              <Text style={[styles.overValue, { color: colors.text }]}>{stat.count}</Text>
              <Text style={[styles.overSub, { color: colors.textSecondary }]}>已出成绩</Text>
            </View>
          </View>

          {/* 学分 / 目标 GPA */}
          <View style={[styles.goalCard, { backgroundColor: colors.backgroundElement }]}>
            <GlassSurface radius={14} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="flag-outline" size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>学分与目标 GPA</Text>
            </View>
            <Text style={[styles.goalHint, { color: colors.textSecondary }]}>
              教务页不提供学分，点下面课程右侧「填写学分」录入后自动加权；填好目标即可反推还需要考多少分。
            </Text>
            <View style={styles.goalInputs}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>目标绩点（5 分制）</Text>
                <TextInput
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                  onBlur={() => saveGoal(goalTarget, goalRemain)}
                  keyboardType="decimal-pad"
                  placeholder="如 3.5"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, borderColor: 'rgba(128,128,128,0.35)' }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>剩余学分</Text>
                <TextInput
                  value={goalRemain}
                  onChangeText={setGoalRemain}
                  onBlur={() => saveGoal(goalTarget, goalRemain)}
                  keyboardType="decimal-pad"
                  placeholder="如 30"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.text, borderColor: 'rgba(128,128,128,0.35)' }]}
                />
              </View>
            </View>
            {needGpa != null && needGpa > 5 ? (
              <Text style={[styles.goalResult, { color: danger }]}>
                目标偏高：剩余课程需要 {needGpa.toFixed(2)} 绩点，超出 5 分制上限
              </Text>
            ) : needGpa != null && needGpa <= 0 ? (
              <Text style={[styles.goalResult, { color: '#16a34a' }]}>按当前成绩，这个目标已经达成了</Text>
            ) : needGpa != null ? (
              <Text style={[styles.goalResult, { color: '#16a34a' }]}>
                剩余 {remainNum} 学分平均需 {needGpa.toFixed(2)} 绩点（约{' '}
                {Math.min(100, gpaToScore(needGpa)).toFixed(0)} 分）
              </Text>
            ) : (
              <Text style={[styles.goalHint, { color: colors.textSecondary, marginTop: 8 }]}>
                填好目标绩点和剩余学分，并给课程填上学分后，这里会算出剩余课程需要达到的平均绩点。
              </Text>
            )}
          </View>

          {/* 挂科预警 */}
          <View
            style={[
              styles.warnCard,
              {
                backgroundColor: failing.length ? 'rgba(239,68,68,0.10)' : colors.backgroundElement,
                borderColor: failing.length ? 'rgba(239,68,68,0.35)' : 'transparent',
              },
            ]}>
            <GlassSurface radius={14} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons
                name={failing.length ? 'alert-circle' : 'checkmark-circle'}
                size={16}
                color={failing.length ? danger : '#16a34a'}
              />
              <Text style={{ color: failing.length ? danger : '#16a34a', fontWeight: '800', fontSize: 14 }}>
                {failing.length ? `挂科预警 · ${failing.length} 门` : '暂无不及格课程'}
              </Text>
            </View>
            {failing.map((f, i) => (
              <View key={`${f.term}-${f.course}-${i}`} style={[styles.warnRow, { borderTopColor: 'rgba(239,68,68,0.20)' }]}>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                  {f.course}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                  {f.term} · {f.level || f.score}
                </Text>
              </View>
            ))}
            {failing.length > 0 && (
              <Text style={[styles.warnTip, { color: colors.textSecondary }]}>
                低于 60 分一般需要补考或重修，尽快联系任课老师确认
              </Text>
            )}
          </View>

          {/* 学期趋势(条形) */}
          <View style={[styles.trend, { backgroundColor: colors.backgroundElement }]}>
            <GlassSurface radius={14} />
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
          {stat.terms.map((t) => {
            const termW = weightedGpa(t.courses, credits);
            const termGpa = termW.credited ? termW.gpa : t.gpa;
            return (
              <View key={t.term} style={[styles.termCard, { backgroundColor: colors.backgroundElement }]}>
                <GlassSurface radius={14} />
                <Pressable
                  style={styles.termHead}
                  onPress={() => setOpenTerm(openTerm === t.term ? null : t.term)}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{t.term}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {t.count} 门课 · 平均 {t.avg} · {termW.credited ? '加权' : ''}绩点 {termGpa.toFixed(2)}
                      {termW.credited ? ` · ${termW.credits} 学分` : ''}
                    </Text>
                  </View>
                  <Ionicons name={openTerm === t.term ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                </Pressable>
                {openTerm === t.term &&
                  t.courses.map((c) => {
                    const score = gradeScore(c);
                    const lvl = parseFloat(c.total) ? '' : c.level;
                    const gpa = scoreToGpa(score);
                    const credit = credits[gradeKey(c)];
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
                          <Pressable
                            onPress={() =>
                              setEditing({
                                key: gradeKey(c),
                                name: c.course,
                                value: credit ? String(credit) : '',
                              })
                            }
                            style={[
                              styles.creditPill,
                              {
                                borderColor: credit ? 'rgba(37,99,235,0.45)' : 'rgba(128,128,128,0.35)',
                                backgroundColor: credit ? 'rgba(37,99,235,0.10)' : 'transparent',
                              },
                            ]}>
                            <Ionicons
                              name="pricetag-outline"
                              size={10}
                              color={credit ? colors.primary : colors.textSecondary}
                            />
                            <Text style={{ color: credit ? colors.primary : colors.textSecondary, fontSize: 10.5 }}>
                              {credit ? `${credit} 学分` : '填写学分'}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={{
                              color: score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#ef4444',
                              fontWeight: '700',
                            }}>
                            {score || lvl || '—'}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            绩点 {score ? gpa.toFixed(1) : '—'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
              </View>
            );
          })}

          <Text style={[styles.note, { color: colors.textSecondary }]}>
            绩点按 (分数-50)/10 的 5 分制估算，等级课折算：优95 / 良85 / 中75 / 及格65；填了学分后按学分加权。数据由教务系统换算，仅供参考
          </Text>
          <Text style={[styles.shareFoot, { color: colors.textSecondary }]}>由 课表助手 生成</Text>
        </ScrollView>
      )}

      {/* 学分编辑 */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.mask} onPress={() => setEditing(null)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.background }]}
            onPress={() => {}}>
            <GlassSurface radius={18} />
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }} numberOfLines={1}>
              {editing?.name}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
              填写这门课的学分，可精确到 0.5
            </Text>
            <TextInput
              value={editing?.value ?? ''}
              onChangeText={(v) => setEditing((cur) => (cur ? { ...cur, value: v } : cur))}
              keyboardType="decimal-pad"
              placeholder="如 3"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              style={[styles.modalInput, { color: colors.text, borderColor: 'rgba(128,128,128,0.35)' }]}
            />
            <View style={styles.stepRow}>
              {CREDIT_STEPS.map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setEditing((cur) => (cur ? { ...cur, value: v } : cur))}
                  style={[styles.stepChip, { borderColor: 'rgba(128,128,128,0.35)' }]}>
                  <Text style={{ color: colors.text, fontSize: 12 }}>{v}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => saveCredit(null)}
                style={[styles.modalBtn, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                <GlassSurface radius={10} />
                <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 13 }}>清除</Text>
              </Pressable>
              <Pressable onPress={() => setEditing(null)} style={[styles.modalBtn, { backgroundColor: 'rgba(128,128,128,0.12)' }]}>
                <GlassSurface radius={10} />
                <Text style={{ color: colors.text, fontSize: 13 }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => saveCredit(editing?.value ?? '')}
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                <GlassSurface radius={10} />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  overCard: { flex: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
  overLabel: { fontSize: 12 },
  overValue: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  overSub: { fontSize: 9.5, marginTop: 3 },
  goalCard: { borderRadius: 14, padding: 14 },
  goalHint: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  goalInputs: { flexDirection: 'row', gap: 10, marginTop: 10 },
  inputLabel: { fontSize: 10.5, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  goalResult: { fontSize: 12, fontWeight: '700', marginTop: 10, lineHeight: 17 },
  warnCard: { borderRadius: 14, padding: 12, borderWidth: 1 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 7, marginTop: 7 },
  warnTip: { fontSize: 11, marginTop: 8 },
  trend: { borderRadius: 14, padding: 14 },
  sectionTitle: { fontWeight: '800', fontSize: 15, marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { width: 78, fontSize: 11 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: 'rgba(37,99,235,0.10)' },
  barFill: { height: 10, borderRadius: 5 },
  barValue: { width: 34, fontSize: 12, textAlign: 'right', fontWeight: '600' },
  termCard: { borderRadius: 14, padding: 12 },
  termHead: { flexDirection: 'row', alignItems: 'center' },
  courseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderTopWidth: 1, paddingTop: 8, marginTop: 8 },
  creditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 5,
  },
  note: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  shareFoot: { fontSize: 10, textAlign: 'center', marginTop: 10, opacity: 0.7 },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 18, padding: 18 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16, marginTop: 14 },
  stepRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  stepChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
});
