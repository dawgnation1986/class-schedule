import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  loadInitial,
  selectDepartment,
  selectMajor,
  type Option,
  type PageState,
  type QueryType,
} from '@/lib/timetable';
import { DEFAULT_QUERY_TYPE, loadSettings, saveSettings, type Settings } from '@/lib/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PageBackdrop, usePageBackground, useBgSetting } from '@/lib/background';
import { PickerField } from '@/components/picker-field';
import { UiModePicker } from '@/components/ui-mode-picker';
import { ApkDownload } from '@/components/download-view';
import { AboutGithub } from '@/components/about-github';
import { OnboardingModal } from '@/components/onboarding';
import { startCoachTour, TourTarget, registerTourScroller } from '@/components/tour';
import Ionicons from '@expo/vector-icons/Ionicons';
import { checkUpdate, currentVersion, type UpdateInfo } from '@/lib/updates';

type FieldKey = 'xb' | 'zy' | 'bj';

const QUERY_TYPES: { value: QueryType; label: string; hint: string }[] = [
  { value: 'realtime', label: '本周实时课表', hint: '按当前周过滤，推荐' },
  { value: 'original', label: '原始课表', hint: '显示整学期全部课程' },
];

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  // 控件全透明模式: 设了背景图且开启开关 → 按钮/卡片只留文字 + 1px 外轮廓
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.uri && !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const glassBorder = (active = false) =>
    glass ? { borderWidth: 1, borderColor: active ? 'rgba(37,99,235,0.55)' : glassLine } : null;
  const router = useRouter();

  const [state, setState] = useState<PageState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queryType, setQueryType] = useState<QueryType>(DEFAULT_QUERY_TYPE);
  const [sel, setSel] = useState<{ xb: string; zy: string; bj: string }>({ xb: '', zy: '', bj: '' });
  const [savedTip, setSavedTip] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateErr, setUpdateErr] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false); // 新手引导(常驻入口)
  // 登记滚动容器: 新手引导可自动滚动到屏幕外的目标
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    registerTourScroller('/settings', scrollRef.current);
  }, []);

  useEffect(() => {
    (async () => {
      setBusy('加载院系列表…');
      try {
        const s = await loadInitial();
        setState(s);
        const saved = await loadSettings();
        if (saved) {
          setQueryType(saved.queryType);
          setSel({ xb: saved.xb, zy: saved.zy, bj: saved.bj });
          // 已有保存的班级时, 补拉一次专业/班级列表用于回显
          try {
            let next = await selectDepartment(s, saved.xb);
            next = await selectMajor(next, saved.xb, saved.zy);
            setState(next);
          } catch {
            // 网络失败不影响已保存的值回显
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setBusy(null);
      }
    })();
  }, []);

  const pick = useCallback(
    async (key: FieldKey, o: Option) => {
      if (!state) return;
      if (key === 'xb') {
        setSel({ xb: o.value, zy: '', bj: '' });
        setBusy('加载专业…');
        try {
          setState(await selectDepartment(state, o.value));
        } catch (e) {
          setError(e instanceof Error ? e.message : '加载专业失败');
        } finally {
          setBusy(null);
        }
      } else if (key === 'zy') {
        setSel((p) => ({ ...p, zy: o.value, bj: '' }));
        setBusy('加载班级…');
        try {
          setState(await selectMajor(state, sel.xb, o.value));
        } catch (e) {
          setError(e instanceof Error ? e.message : '加载班级失败');
        } finally {
          setBusy(null);
        }
      } else {
        setSel((p) => ({ ...p, bj: o.value }));
      }
    },
    [state, sel.xb],
  );

  const save = useCallback(async () => {
    const xbOpt = state?.departments.find((o) => o.value === sel.xb);
    const zyOpt = state?.majors.find((o) => o.value === sel.zy);
    const bjOpt = state?.classes.find((o) => o.value === sel.bj);
    if (!xbOpt || !zyOpt || !bjOpt) return;
    const s: Settings = {
      xb: xbOpt.value,
      xbLabel: xbOpt.label,
      zy: zyOpt.value,
      zyLabel: zyOpt.label,
      bj: bjOpt.value,
      bjLabel: bjOpt.label,
      queryType,
    };
    await saveSettings(s);
    setSavedTip(true);
    setTimeout(() => setSavedTip(false), 1500);
  }, [state, sel, queryType]);

  const ready = sel.xb && sel.zy && sel.bj;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <PageBackdrop />      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundElement }]}>
          <Text style={{ color: colors.text, fontSize: 14 }}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>设置</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          选择你的院系班级，主页会自动查询，无需每次手动选择。
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <PickerField
          label="系部 / 学院"
          placeholder={busy === '加载院系列表…' ? '加载中…' : '--请选择--'}
          value={sel.xb}
          options={state?.departments ?? []}
          disabled={!state || !!busy}
          onPick={(o) => pick('xb', o)}
          colors={colors}
          glass={glass}
          glassLine={glassLine}
        />
        <PickerField
          label="专业"
          placeholder={busy === '加载专业…' ? '加载中…' : sel.xb ? '--请选择--' : '请先选择系部'}
          value={sel.zy}
          options={state?.majors ?? []}
          disabled={!sel.xb || !!busy}
          onPick={(o) => pick('zy', o)}
          colors={colors}
          glass={glass}
          glassLine={glassLine}
        />
        <PickerField
          label="班级"
          placeholder={busy === '加载班级…' ? '加载中…' : sel.zy ? '--请选择--' : '请先选择专业'}
          value={sel.bj}
          options={state?.classes ?? []}
          disabled={!sel.zy || !!busy}
          onPick={(o) => pick('bj', o)}
          colors={colors}
          glass={glass}
          glassLine={glassLine}
        />

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>查询类型</Text>
        <View style={styles.typeRow}>
          {QUERY_TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => setQueryType(t.value)}
              style={[
                styles.typeBtn,
                glassBorder(queryType === t.value),
                {
                  backgroundColor: glass
                    ? queryType === t.value
                      ? 'rgba(37,99,235,0.15)'
                      : 'transparent'
                    : queryType === t.value
                      ? colors.backgroundSelected
                      : colors.backgroundElement,
                },
              ]}>
              <Text style={{ color: colors.text, fontWeight: queryType === t.value ? '700' : '400' }}>
                {t.label}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{t.hint}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          disabled={!ready || !!busy}
          onPress={save}
          style={[
            styles.saveBtn,
            glassBorder(!!ready),
            { backgroundColor: glass ? (ready ? 'rgba(37,99,235,0.15)' : 'transparent') : ready ? '#2563eb' : colors.backgroundElement },
          ]}>
          {busy ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={{ color: ready ? (glass ? colors.text : '#fff') : colors.textSecondary, fontWeight: '700' }}>
              {savedTip ? '已保存 ✓' : '保存设置'}
            </Text>
          )}
        </Pressable>

        {/* 界面设置: 原版界面 / 液态玻璃界面(水滴动效切换, 立即生效) */}
        <UiModePicker colors={colors} glass={glass} glassLine={glassLine} />

        {/* 教程设置(常驻): 交互式新手引导 + 图文教程 */}
        <TourTarget id="st.guide">
        <View style={[styles.guideCard, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundElement }]}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>教程设置</Text>
          <Pressable
            onPress={() => startCoachTour()}
            style={({ pressed }) => [styles.guideRow, pressed && { opacity: 0.6 }]}>
            <View style={[styles.guideIcon, { backgroundColor: '#2563eb' }]}>
              <Ionicons name="compass" size={19} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14.5 }}>新手引导</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>方块高亮+箭头指引, 一步步带你逛 App</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => setIntroOpen(true)}
            style={({ pressed }) => [styles.guideRow, pressed && { opacity: 0.6 }]}>
            <View style={[styles.guideIcon, { backgroundColor: '#7c3aed' }]}>
              <Ionicons name="book" size={19} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14.5 }}>图文功能教程</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>6 页图文介绍, 首次启动展示过的那份</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
        </TourTarget>

        {/* 检查更新 */}
        <View style={[styles.updateCard, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundElement }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              当前版本 v{currentVersion()}
            </Text>
            <Pressable
              disabled={checking}
              hitSlop={8}
              onPress={async () => {
                setChecking(true);
                setUpdateErr(null);
                setUpdate(null);
                try {
                  const r = await checkUpdate();
                  if (r) setUpdate(r);
                  else setUpdateErr('查询失败，请稍后再试');
                } finally {
                  setChecking(false);
                }
              }}>
              {checking ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text style={{ color: '#2563eb', fontSize: 14 }}>检查更新</Text>
              )}
            </Pressable>
          </View>
          {updateErr && <Text style={[styles.updateMsg, { color: '#ef4444' }]}>{updateErr}</Text>}
          {update && !update.hasUpdate && (
            <Text style={[styles.updateMsg, { color: colors.textSecondary }]}>
              已是最新版本 ✓
            </Text>
          )}
          {update?.hasUpdate && (
            <View style={{ gap: 8 }}>
              <Text style={[styles.updateMsg, { color: '#f59e0b', fontWeight: '700' }]}>
                发现新版本 v{update.latest}
              </Text>
              {!!update.notes && (
                <Text style={[styles.updateMsg, { color: colors.textSecondary }]}>{update.notes}</Text>
              )}
              <ApkDownload info={update} colors={colors} />
            </View>
          )}
        </View>

        <AboutGithub colors={colors} />
      </ScrollView>
      <OnboardingModal visible={introOpen} onClose={() => setIntroOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  backBtn: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: Spacing.two },
  title: { fontSize: 28, fontWeight: '800', marginBottom: Spacing.one },
  subtitle: { marginBottom: Spacing.three, lineHeight: 20 },
  fieldWrap: { marginBottom: Spacing.three },
  fieldLabel: { fontSize: 13, marginBottom: 6 },
  pickerBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13 },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.four },
  modalBox: { borderRadius: 14, overflow: 'hidden' },
  optionRow: { paddingHorizontal: 18, paddingVertical: 14 },
  typeRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three },
  typeBtn: { flex: 1, borderRadius: 10, padding: 12, gap: 2 },
  saveBtn: { borderRadius: 12, alignItems: 'center', paddingVertical: 15, marginTop: Spacing.one },
  updateCard: { borderRadius: 12, padding: Spacing.two, marginTop: Spacing.three, gap: 6 },
  guideCard: { borderRadius: 12, padding: Spacing.two, marginTop: Spacing.three, gap: 4 },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  guideIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  updateMsg: { fontSize: 13, lineHeight: 19 },
  error: { color: '#ef4444', marginBottom: Spacing.two },
});
