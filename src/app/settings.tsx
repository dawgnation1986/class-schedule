import { useCallback, useEffect, useRef, useState, type ElementType } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  loadInitial,
  selectDepartment,
  selectMajor,
  type Option,
  type PageState,
  type QueryType,
} from '@/lib/timetable';
import { DEFAULT_QUERY_TYPE, loadSettings, saveSettings, type Settings } from '@/lib/settings';
import { refreshWidgets } from '@/lib/widget';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { PageBackdrop, usePageBackground, useBgSetting } from '@/lib/background';
import { NightGlowBackground, NightCard, NightPrimaryButton, NightSectionHeader } from '@/components/night-kit';
import { GlassSurface, GLASS_LINE } from '@/components/glass-surface';
import { PickerField } from '@/components/picker-field';
import { UiModePicker } from '@/components/ui-mode-picker';
import { ThemePresetPicker } from '@/components/theme-preset-picker';
import { ApkDownload } from '@/components/download-view';
import { AboutGithub } from '@/components/about-github';
import { OnboardingModal } from '@/components/onboarding';
import { startCoachTour, TourTarget, registerTourScroller } from '@/components/tour';
import Ionicons from '@expo/vector-icons/Ionicons';
import { checkUpdate, currentVersion, type UpdateInfo } from '@/lib/updates';
import { openAutoStartSettings, openBatteryWhitelist } from '@/lib/autostart';
import { setSuperGlass } from '@/lib/super-glass';
import { useSuperGlass } from '@/hooks/use-super-glass';

type FieldKey = 'xb' | 'zy' | 'bj';

const QUERY_TYPES: { value: QueryType; label: string; hint: string }[] = [
  { value: 'realtime', label: '本周实时课表', hint: '按当前周过滤，推荐' },
  { value: 'original', label: '原始课表', hint: '显示整学期全部课程' },
];

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const colors = useTheme(); // 墨夜模式下返回深色配色
  const pageBg = usePageBackground(colors);
  // 控件全透明模式: 设了背景图且开启开关 → 按钮/卡片只留文字 + 1px 外轮廓
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.ctrl;
  const uiMode = useUiMode();
  const glassLine =
    scheme === 'dark' ? 'rgba(255,255,255,0.40)' : uiMode === 'glass' ? GLASS_LINE : 'rgba(0,0,0,0.30)';
  const glassBorder = (active = false) =>
    glass ? { borderWidth: 1, borderColor: active ? 'rgba(37,99,235,0.55)' : glassLine } : null;
  const night = uiMode === 'night';
  const superGlass = useSuperGlass();
  // 墨夜模式: 卡片容器交给 NightCard 重绘, 去掉原背景/玻璃描边, 保留圆角与内边距
  const CardWrap: ElementType = night ? NightCard : View;
  const cardStyle = (base: ViewStyle): StyleProp<ViewStyle> =>
    night ? base : [base, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundElement }];
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
    void refreshWidgets();
    setSavedTip(true);
    setTimeout(() => setSavedTip(false), 1500);
  }, [state, sel, queryType]);

  const ready = sel.xb && sel.zy && sel.bj;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {/* 墨夜背景: 深空渐变 + 顶部辉光(绝对定位铺满, 原版模式不渲染) */}
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
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
              <GlassSurface radius={10} />
              <Text style={{ color: colors.text, fontWeight: queryType === t.value ? '700' : '400' }}>
                {t.label}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{t.hint}</Text>
            </Pressable>
          ))}
        </View>

        {night ? (
          <NightPrimaryButton
            title={savedTip ? '已保存 ✓' : '保存设置'}
            onPress={save}
            disabled={!ready || !!busy}
            style={{ marginTop: Spacing.one }}
          />
        ) : (
          <Pressable
            disabled={!ready || !!busy}
            onPress={save}
            style={[
              styles.saveBtn,
              glassBorder(!!ready),
              { backgroundColor: glass ? (ready ? 'rgba(37,99,235,0.15)' : 'transparent') : ready ? colors.primary : colors.backgroundElement },
            ]}>
            <GlassSurface radius={12} />
            {busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={{ color: ready ? (glass ? colors.text : '#fff') : colors.textSecondary, fontWeight: '700' }}>
                {savedTip ? '已保存 ✓' : '保存设置'}
              </Text>
            )}
          </Pressable>
        )}

        {/* 主题预设: 自定义/纯白/纯黑/墨夜/护眼米黄/淡雅蓝 (含主题导出/导入) */}
        <ThemePresetPicker />

        {/* 界面设置: 原版界面 / 墨夜主题(水滴动效切换, 立即生效) — "自定义"档微调用 */}
        <UiModePicker />

        {/* SuperGlass: 全站原生液态玻璃材质开关(依赖 expo-android-glass-view) */}
        <CardWrap style={cardStyle(styles.guideCard)}>
          <GlassSurface radius={12} />
          <Pressable
            onPress={() => setSuperGlass(!superGlass)}
            style={({ pressed }) => [styles.guideRow, pressed && { opacity: 0.6 }]}>
            <View style={[styles.guideIcon, { backgroundColor: '#6366f1' }]}>
              <Ionicons name="sparkles" size={19} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>SuperGlass 全局液态玻璃</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                卡片、控件、弹窗、下拉与返回键统一使用原生液态玻璃材质(需液态玻璃界面)
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 11,
                backgroundColor: superGlass ? '#2563EB' : 'rgba(120,120,128,0.20)',
              }}>
              <Text style={{ color: superGlass ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                {superGlass ? '开' : '关'}
              </Text>
            </View>
          </Pressable>
        </CardWrap>

        {/* 自启动与后台: Android 没有统一的"自启动权限", 只能把用户送到系统白名单页面 */}
        <CardWrap style={cardStyle(styles.guideCard)}>
          <GlassSurface radius={12} />
          {night ? (
            <NightSectionHeader title="自启动与后台" />
          ) : (
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>自启动与后台</Text>
          )}
          <Pressable
            onPress={() => void openAutoStartSettings()}
            style={({ pressed }) => [styles.guideRow, pressed && { opacity: 0.6 }]}>
            <View style={[styles.guideIcon, { backgroundColor: '#0ea5e9' }]}>
              <Ionicons name="power" size={19} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14.5 }}>开机自启动</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                打开系统自启动管理, 把本应用加入白名单; 否则重启后提醒/小组件可能不刷新
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => void openBatteryWhitelist()}
            style={({ pressed }) => [styles.guideRow, pressed && { opacity: 0.6 }]}>
            <View style={[styles.guideIcon, { backgroundColor: '#16a34a' }]}>
              <Ionicons name="battery-charging" size={19} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14.5 }}>电池优化白名单</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                允许后台运行, 避免息屏后课程提醒被系统清理
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        </CardWrap>

        {/* 教程设置(常驻): 交互式新手引导 + 图文教程 */}
        <TourTarget id="st.guide">
        <CardWrap style={cardStyle(styles.guideCard)}>
          <GlassSurface radius={12} />
          {night ? (
            <NightSectionHeader title="教程设置" />
          ) : (
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>教程设置</Text>
          )}
          <Pressable
            onPress={() => startCoachTour()}
            style={({ pressed }) => [styles.guideRow, pressed && { opacity: 0.6 }]}>
            <View style={[styles.guideIcon, { backgroundColor: colors.primary }]}>
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
        </CardWrap>
        </TourTarget>

        {/* 检查更新 */}
        <CardWrap style={cardStyle(styles.updateCard)}>
          <GlassSurface radius={12} />
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
                <Text style={{ color: colors.primary, fontSize: 14 }}>检查更新</Text>
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
        </CardWrap>

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
