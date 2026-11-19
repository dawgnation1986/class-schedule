import { useCallback, useEffect, useRef, useState, type ElementType } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MaxContentWidth, Spacing, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { usePageBackground, useBgSetting } from '@/lib/background';
import { NightGlowBackground, NightCard } from '@/components/night-kit';
import { getThemeMode, saveThemeMode, subscribeTheme, themeModeLabel, type ThemeMode } from '@/lib/theme';
import { getWeatherCity, setWeatherCity } from '@/lib/weather';
import { addCountdown, loadCountdowns, removeCountdown, subscribeCountdowns, type Countdown } from '@/lib/countdowns';
import { exportBackup, importBackup, saveBackupToClass } from '@/lib/backup';
import {
  clearBackground,
  getBackground,
  pickBackground,
  setBackgroundOpacity,
  setControlsTransparent,
  subscribeBackground,
  type BgSetting,
} from '@/lib/background';
import { loadAccount, saveAccount, type StartPage } from '@/lib/account';
import { loadSettings } from '@/lib/settings';
import { loadTimetableUI, saveTimetableUI, type TimetableUI } from '@/lib/settings';
import {
  activeSourceLabel,
  clearCustomTimes,
  getPeriodTimes,
  isValidHM,
  parseTimesJson,
  saveCustomTimes,
  subscribeTimes,
  useSeasonPreset,
  type PeriodTimes,
} from '@/lib/schedule-times';
import { UpdateCard } from '@/components/update-card';
import { ThemePresetPicker } from '@/components/theme-preset-picker';
import { adoptCustomForBackground } from '@/lib/theme-preset';
import { UiModePicker } from '@/components/ui-mode-picker';
import { AboutGithub } from '@/components/about-github';
import { OnboardingModal } from '@/components/onboarding';
import { TourTarget, registerTourScroller, startCoachTour } from '@/components/tour';
import { AgreementModal } from '@/components/agreement';
import { requestClassAccess, resetAccessAndEnsureDirs } from '@/lib/class-folder';
import { DEFAULT_SITE_URL, getSiteUrl, setSiteUrl, subscribeSiteUrl } from '@/lib/site';

const PERIOD_ORDER = ['1-2', '3-4', '中午', '5-6', '7-8', '9-10'];

/** 手动编辑每节起止时间 */
function TimesEditorModal({
  visible,
  initial,
  onClose,
  colors,
}: {
  visible: boolean;
  initial: PeriodTimes;
  onClose: () => void;
  colors: Palette;
}) {
  const [values, setValues] = useState<Record<string, [string, string]>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const base = { ...initial };
      for (const p of PERIOD_ORDER) if (!base[p]) base[p] = ['00:00', '00:00'];
      setValues(base);
      setErr(null);
    }
  }, [visible, initial]);

  const save = useCallback(async () => {
    const next: PeriodTimes = {};
    for (const p of PERIOD_ORDER) {
      const [s, e] = values[p] ?? ['', ''];
      if (!isValidHM(s) || !isValidHM(e)) {
        setErr(`"${p}" 的时间格式不对, 需要 HH:MM（如 08:20）`);
        return;
      }
      const toMin = (t: string) => {
        const [h, m] = t.trim().split(':').map(Number);
        return h * 60 + m;
      };
      if (toMin(s) >= toMin(e)) {
        setErr(`"${p}" 的开始时间需要早于结束时间`);
        return;
      }
      next[p] = [s.trim().padStart(5, '0'), e.trim().padStart(5, '0')];
    }
    await saveCustomTimes(next);
    onClose();
  }, [values, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalMask} onPress={onClose}>
        <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>编辑作息时间</Text>
          <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
            直接修改各节起止时间，保存后立即生效（倒计时/通知/今日课程都按此计算）
          </Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {PERIOD_ORDER.map((p) => (
              <View key={p} style={styles.editRow}>
                <Text style={[styles.editLabel, { color: colors.text }]}>{p} 节</Text>
                <TextInput
                  value={values[p]?.[0] ?? ''}
                  onChangeText={(t) => setValues((v) => ({ ...v, [p]: [t, v[p]?.[1] ?? ''] }))}
                  placeholder="08:20"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.editInput, { backgroundColor: colors.backgroundElement, color: colors.text }]}
                />
                <Text style={{ color: colors.textSecondary }}>—</Text>
                <TextInput
                  value={values[p]?.[1] ?? ''}
                  onChangeText={(t) => setValues((v) => ({ ...v, [p]: [v[p]?.[0] ?? '', t] }))}
                  placeholder="10:00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.editInput, { backgroundColor: colors.backgroundElement, color: colors.text }]}
                />
              </View>
            ))}
          </ScrollView>
          {!!err && <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{err}</Text>}
          <View style={styles.modalBtnRow}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
              <Text style={{ color: colors.text }}>取消</Text>
            </Pressable>
            <Pressable onPress={save} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>保存</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 粘贴 JSON 导入作息 */
function JsonImportModal({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: Palette;
}) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      setErr(null);
    }
  }, [visible]);

  const doImport = useCallback(async () => {
    const r = parseTimesJson(text);
    if (!r.ok || !r.times) {
      setErr(r.error ?? '解析失败');
      return;
    }
    await saveCustomTimes(r.times);
    onClose();
  }, [text, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalMask} onPress={onClose}>
        <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>JSON 导入作息</Text>
          <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
            支持格式（键=大节，值=起止时间）：
            {'\n'}{'{'}"1-2": ["08:20","10:00"], "5-6": ["14:00","15:40"]{'}'}
            {'\n'}或 {'{'}"1-2": {'{'}"start":"08:20","end":"10:00"{'}'}{'}'}
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={6}
            placeholder={'{\n  "1-2": ["08:20","10:00"],\n  "3-4": ["10:20","12:00"]\n}'}
            placeholderTextColor={colors.textSecondary}
            style={[styles.jsonInput, { backgroundColor: colors.backgroundElement, color: colors.text }]}
          />
          {!!err && <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{err}</Text>}
          <View style={styles.modalBtnRow}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
              <Text style={{ color: colors.text }}>取消</Text>
            </Pressable>
            <Pressable
              disabled={!text.trim()}
              onPress={doImport}
              style={[styles.modalBtn, { backgroundColor: text.trim() ? colors.primary : colors.backgroundElement }]}>
              <Text style={{ color: text.trim() ? '#fff' : colors.textSecondary, fontWeight: '700' }}>导入</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ProfileScreen() {
  const scheme = useColorScheme();
  const colors = useTheme(); // 墨夜模式下返回深色配色
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  // 控件全透明模式: 设了背景图且开启开关 → 按钮/卡片/输入框只留文字 + 1px 外轮廓
  const glass = !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const glassBorder = (active = false) =>
    glass ? { borderWidth: 1, borderColor: active ? 'rgba(37,99,235,0.55)' : glassLine } : null;
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  // 墨夜模式: 分组卡片交给 NightCard 重绘, 去掉原背景/玻璃描边, 保留圆角与内边距
  const CardWrap: ElementType = night ? NightCard : View;
  const cardStyle = (base: ViewStyle | ViewStyle[]): StyleProp<ViewStyle> =>
    night ? base : [base, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundElement }];
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [startPage, setStartPage] = useState<StartPage>('home');
  const [classLabel, setClassLabel] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [source, setSource] = useState<string>(activeSourceLabel());
  const [showTimes, setShowTimes] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [times, setTimes] = useState<PeriodTimes>(getPeriodTimes());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getThemeMode());
  const [bg, setBg] = useState<BgSetting>(() => getBackground());
  const [wxCity, setWxCity] = useState<string | null>(null);
  const [wxOpen, setWxOpen] = useState(false);
  const [wxInput, setWxInput] = useState('');
  const [cdList, setCdList] = useState<Countdown[]>([]);
  const [cdName, setCdName] = useState('');
  const [cdDate, setCdDate] = useState('');
  const [bkOutOpen, setBkOutOpen] = useState(false);
  const [bkJson, setBkJson] = useState('');
  const [bkInOpen, setBkInOpen] = useState(false);
  const [bkText, setBkText] = useState('');
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  // 官网接口地址(公告/收款码下发源)
  const [siteUrl, setSiteUrlState] = useState<string>(DEFAULT_SITE_URL);
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteInput, setSiteInput] = useState('');
  // 登记滚动容器: 新手引导可自动滚动到屏幕外的目标
  const scrollRef = useRef<ScrollView>(null);
  // 设置搜索: 关键字匹配后跳转/展开
  const [q, setQ] = useState('');
  const goBottom = () => scrollRef.current?.scrollToEnd({ animated: true });
  const goTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
  const SEARCH_ITEMS = [
    { title: '主题预设 (纯白/纯黑/墨夜/护眼米黄/淡雅蓝/自定义)', kw: '主题 预设 纯白 纯黑 墨夜 护眼 米黄 淡雅 蓝 皮肤 配色 导出 导入 主题文件', hint: '本页 · 外观', icon: 'color-palette-outline' as const, go: goTop },
    { title: '自定义配色 / 自定义颜色 (十六进制)', kw: '自定义 配色 颜色 hex 底色 卡片 文字', hint: '本页 · 主题预设内', icon: 'options-outline' as const, go: goTop },
    { title: '控件主色 (按钮/链接颜色)', kw: '主色 控件 按钮 链接 颜色 accent', hint: '本页 · 主题预设内', icon: 'brush-outline' as const, go: goTop },
    { title: '界面设置 (原版界面/墨夜主题)', kw: '界面 设置 墨夜 原版 主题 模式 切换', hint: '本页 · 外观', icon: 'contrast-outline' as const, go: goTop },
    { title: '外观模式 (跟随系统/浅色/深色)', kw: '外观 模式 浅色 深色 跟随 系统 亮色 暗色', hint: '本页 · 外观', icon: 'sunny-outline' as const, go: goTop },
    { title: '自定义背景图 (背景/壁纸/透明度/控件透明)', kw: '背景 壁纸 图片 透明度 控件 全透明 毛玻璃', hint: '本页 · 外观', icon: 'image-outline' as const, go: goTop },
    { title: '班级课表设置 (系部/专业/班级)', kw: '班级 课表 系部 专业 设置 校园 数据', hint: '校园数据', icon: 'school-outline' as const, go: () => router.push('/settings' as never) },
    { title: '作息时间表 (冬季/夏季/手动编辑/JSON导入)', kw: '作息 时间 表 冬季 夏季 上课 下课 时间点', hint: '校园数据', icon: 'time-outline' as const, go: () => setShowTimes(true) },
    { title: '天气城市 (跟随定位/手动设置)', kw: '天气 城市 定位 温度 手动', hint: '校园数据', icon: 'cloud-outline' as const, go: () => setWxOpen(true) },
    { title: '倒计时 (四六级/期末考试)', kw: '倒计时 四六级 期末 考试 日期', hint: '本页', icon: 'hourglass-outline' as const, go: goBottom },
    { title: '备份导出 / 导入 / 保存到手机', kw: '备份 导出 导入 保存 手机 换机 迁移 JSON', hint: '数据与备份', icon: 'save-outline' as const, go: goBottom },
    { title: '公告 (全部公告/历史发布)', kw: '公告 通知 消息 历史 发布', hint: '独立页面', icon: 'megaphone-outline' as const, go: () => router.push('/notices' as never) },
    { title: '支持开发者 (赞助/收款码)', kw: '赞助 支持 开发者 收款码 微信 支付宝 奶茶', hint: '独立页面', icon: 'heart-outline' as const, go: () => router.push('/sponsor' as never) },
    { title: '官网接口地址 (公告/收款码下发)', kw: '官网 接口 地址 下发 公告 服务器', hint: '通用', icon: 'globe-outline' as const, go: () => setSiteOpen(true) },
    { title: '新手引导 (方块高亮指引)', kw: '新手 引导 指引 教程 高亮', hint: '通用', icon: 'compass-outline' as const, go: () => startCoachTour() },
    { title: '图文功能教程 (6页图文)', kw: '图文 教程 功能 介绍 回看', hint: '通用', icon: 'book-outline' as const, go: () => setIntroOpen(true) },
    { title: '用户协议', kw: '用户 协议 条款', hint: '通用', icon: 'document-text-outline' as const, go: () => setAgreementOpen(true) },
    { title: '检查更新 / 镜像设置 / 当前版本', kw: '检查 更新 版本 镜像 下载 升级', hint: '页面底部', icon: 'download-outline' as const, go: goBottom },
    { title: '开发者选项 (登录修复/调试)', kw: '开发者 选项 调试 登录 修复', hint: '通用', icon: 'terminal-outline' as const, go: () => router.push('/dev' as never) },
  ];
  useEffect(() => {
    registerTourScroller('/profile', scrollRef.current);
  }, []);

  useEffect(() => {
    void getWeatherCity().then(setWxCity);
    void getSiteUrl().then(setSiteUrlState);
    return subscribeSiteUrl(() => void getSiteUrl().then(setSiteUrlState));
  }, []);

  useEffect(() => {
    void loadCountdowns().then(setCdList);
    return subscribeCountdowns(() => void loadCountdowns().then(setCdList));
  }, []);

  const addCd = () => {
    const name = cdName.trim();
    const date = cdDate.trim();
    if (!name) {
      Alert.alert('缺少名称', '请填写倒计时名称');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) {
      Alert.alert('日期格式不对', '请按 YYYY-MM-DD 填写，如 2026-12-12');
      return;
    }
    void addCountdown(name, date).then(() => {
      setCdName('');
      setCdDate('');
    });
  };

  useEffect(() => subscribeTheme(() => setThemeMode(getThemeMode())), []);
  useEffect(() => subscribeBackground(() => setBg({ ...getBackground() })), []);

  const THEME_OPTIONS: ThemeMode[] = ['auto', 'light', 'dark'];
  const BG_OPACITIES = [0.2, 0.35, 0.5, 0.75];
  const [ttUI, setTtUI] = useState<TimetableUI>('classic');

  useEffect(() => {
    void loadTimetableUI().then(setTtUI);
  }, []);

  useEffect(() => {
    const sync = () => {
      setSource(activeSourceLabel());
      setTimes(getPeriodTimes());
    };
    sync();
    return subscribeTimes(sync);
  }, []);

  useEffect(() => {
    (async () => {
      const acc = await loadAccount();
      if (acc) {
        setUsername(acc.username);
        setPassword(acc.password);
        setStartPage(acc.startPage);
      }
      const s = await loadSettings();
      setClassLabel(s?.bjLabel ?? null);
    })();
  }, []);

  const save = useCallback(async () => {
    if (!username || !password) return;
    await saveAccount({ username, password, startPage });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [username, password, startPage]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {/* 墨夜背景: 深空渐变 + 顶部辉光(绝对定位铺满, 原版模式不渲染) */}
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>我的</Text>

        {/* 设置搜索: 关键字匹配功能并跳转(位于标题下方) */}
        <View style={[glass ? { borderWidth: 1, borderColor: glassLine } : { backgroundColor: colors.backgroundElement }, { borderRadius: 12, padding: 12, marginTop: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="搜索设置: 主题 / 天气 / 备份 / 赞助 ..."
              placeholderTextColor={colors.textSecondary}
              style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 4 }}
            />
            {q !== '' && (
              <Pressable hitSlop={8} onPress={() => setQ('')}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
          {q.trim() !== '' && (
            <View style={{ marginTop: 8, gap: 6 }}>
              {SEARCH_ITEMS.filter((it) => {
                const s = q.trim().toLowerCase();
                return (it.title + ' ' + it.kw).toLowerCase().includes(s) || it.title.includes(q.trim());
              }).map((it) => (
                <Pressable
                  key={it.title}
                  onPress={() => {
                    it.go();
                    setQ('');
                  }}
                  style={({ pressed }) => [
                    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: night ? 'rgba(91,140,255,0.08)' : glass ? 'rgba(37,99,235,0.08)' : colors.background },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <Ionicons name={it.icon} size={15} color={colors.primary} />
                  <Text style={{ flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>
                    {it.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{it.hint}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                </Pressable>
              ))}
              {SEARCH_ITEMS.filter((it) => {
                const s = q.trim().toLowerCase();
                return (it.title + ' ' + it.kw).toLowerCase().includes(s) || it.title.includes(q.trim());
              }).length === 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, paddingVertical: 8 }}>没有匹配的设置项</Text>
              )}
            </View>
          )}
        </View>

        {/* 主站账号 */}
        <CardWrap style={cardStyle(styles.section)}>
          <Text style={[styles.secTitle, { color: colors.text }]}>主站账号</Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>学号</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="请输入学号"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { backgroundColor: glass ? 'transparent' : colors.backgroundElement, color: colors.text, borderColor: glass ? glassLine : colors.backgroundElement }]}
            autoCapitalize="none"
          />
          <Text style={[styles.label, { color: colors.textSecondary }]}>密码</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="请输入密码"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { backgroundColor: glass ? 'transparent' : colors.backgroundElement, color: colors.text, borderColor: glass ? glassLine : colors.backgroundElement }]}
            secureTextEntry
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>默认起始页</Text>
          <View style={styles.startRow}>
            {(
              [
                ['home', '主站（综合管理平台）'],
                ['timetable', '班级课表查询'],
              ] as [StartPage, string][]
            ).map(([v, label]) => (
              <Pressable
                key={v}
                onPress={() => setStartPage(v)}
                style={[
                  styles.startBtn,
                  glassBorder(startPage === v),
                  { backgroundColor: glass ? (startPage === v ? 'rgba(37,99,235,0.15)' : 'transparent') : startPage === v ? colors.primary : colors.backgroundElement },
                ]}>
                <Text style={{ color: startPage === v && !glass ? '#fff' : colors.text, fontSize: 13, fontWeight: startPage === v ? '700' : '400' }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            disabled={!username || !password}
            onPress={save}
            style={[
              styles.saveBtn,
              glassBorder(!!(username && password)),
              { backgroundColor: glass ? (username && password ? 'rgba(37,99,235,0.15)' : 'transparent') : username && password ? colors.primary : colors.backgroundElement },
            ]}>
            <Text style={{ color: username && password ? (glass ? colors.text : '#fff') : colors.textSecondary, fontWeight: '700' }}>
              {saved ? '已保存 ✓' : '保存'}
            </Text>
          </Pressable>
        </CardWrap>

        {/* 主题预设: 自定义/纯白/纯黑/墨夜/护眼米黄/淡雅蓝 (含主题导出/导入/自定义配色) */}
        <ThemePresetPicker />

        {/* 界面设置: 原版界面 / 墨夜主题 */}
        <UiModePicker />

        {/* 外观: 主题模式 / 自定义背景 / 课表界面 */}
        <TourTarget id="pf.theme">
          <CardWrap style={cardStyle([styles.section, styles.subCard])}>
            <Text style={[styles.secTitle, { color: colors.text }]}>外观模式</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>跟随系统 / 浅色 / 深色，搭配主题预设更出彩</Text>
            <View style={[styles.timesBtnRow, { marginTop: 10, marginBottom: 0 }]}>
              {THEME_OPTIONS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => void saveThemeMode(m)}
                  style={[
                    styles.timesBtn,
                    glassBorder(themeMode === m),
                    { backgroundColor: glass ? (themeMode === m ? 'rgba(37,99,235,0.15)' : 'transparent') : themeMode === m ? colors.primary : colors.backgroundSelected, flex: 1 },
                  ]}>
                  <Text
                    style={{
                      color: themeMode === m && !glass ? '#fff' : colors.text,
                      fontSize: 12,
                      fontWeight: themeMode === m ? '700' : '400',
                    }}>
                    {themeModeLabel(m)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </CardWrap>
        </TourTarget>

        <TourTarget id="pf.bg">
          <CardWrap style={cardStyle([styles.section, styles.subCard])}>
            <Text style={[styles.secTitle, { color: colors.text }]}>自定义背景</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {bg.uri ? '已设置背景图片，全App生效' : '未设置，使用默认纯色背景'}
            </Text>
            <View style={[styles.timesBtnRow, { marginTop: 10 }]}>
              <Pressable
                onPress={() =>
                  void pickBackground().then(() => {
                    // 背景图只属于自定义档: 在内置档位选图后自动切到"自定义"
                    void adoptCustomForBackground();
                  })
                }
                style={[styles.timesBtn, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundSelected, flex: 1 }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>{bg.uri ? '更换图片' : '选择图片'}</Text>
              </Pressable>
              <Pressable
                disabled={!bg.uri}
                onPress={() => void clearBackground()}
                style={[styles.timesBtn, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundSelected, flex: 1, opacity: bg.uri ? 1 : 0.4 }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>恢复默认背景</Text>
              </Pressable>
            </View>
            <View style={[styles.timesBtnRow, { marginTop: 8, marginBottom: 0 }]}>
              {BG_OPACITIES.map((op) => (
                <Pressable
                  key={op}
                  onPress={() => void setBackgroundOpacity(op)}
                  style={[
                    styles.timesBtn,
                    glassBorder(bg.opacity === op),
                    { backgroundColor: glass ? (bg.opacity === op ? 'rgba(37,99,235,0.15)' : 'transparent') : bg.opacity === op ? colors.primary : colors.backgroundSelected, flex: 1 },
                  ]}>
                  <Text style={{ color: bg.opacity === op && !glass ? '#fff' : colors.text, fontSize: 11 }}>
                    {Math.round(op * 100)}%
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.timesBtnRow, { marginTop: 8, marginBottom: 0 }]}>
              <Pressable
                onPress={() => void setControlsTransparent(!bg.ctrl)}
                style={[
                  styles.timesBtn,
                  glassBorder(bg.ctrl),
                  { flex: 1, backgroundColor: glass ? (bg.ctrl ? 'rgba(37,99,235,0.15)' : 'transparent') : bg.ctrl ? colors.primary : colors.backgroundSelected },
                ]}>
                <Text style={{ color: bg.ctrl && !glass ? '#fff' : colors.text, fontSize: 11 }}>
                  控件全透明：{bg.ctrl ? '开' : '关'}（只留文字+1px轮廓）
                </Text>
              </Pressable>
            </View>
          </CardWrap>
        </TourTarget>

        <CardWrap style={cardStyle([styles.section, styles.subCard])}>
          <Text style={[styles.secTitle, { color: colors.text }]}>课表界面</Text>
          <View style={[styles.timesBtnRow, { marginTop: 10, marginBottom: 0 }]}>
            {(
              [
                ['classic', '旧版网格'],
                ['nova', '新版日程'],
              ] as [TimetableUI, string][]
            ).map(([v, label]) => (
              <Pressable
                key={v}
                onPress={() => {
                  setTtUI(v);
                  void saveTimetableUI(v);
                }}
                style={[
                  styles.timesBtn,
                  glassBorder(ttUI === v),
                  { backgroundColor: glass ? (ttUI === v ? 'rgba(37,99,235,0.15)' : 'transparent') : ttUI === v ? colors.primary : colors.backgroundSelected, flex: 1 },
                ]}>
                <Text style={{ color: ttUI === v && !glass ? '#fff' : colors.text, fontSize: 12, fontWeight: ttUI === v ? '700' : '400' }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </CardWrap>

        {/* 校园数据: 班级课表 / 作息时间 / 天气城市 */}
        <CardWrap style={cardStyle(styles.section)}>
          <Text style={[styles.secTitle, { color: colors.text }]}>校园数据</Text>

          <View style={styles.subBlock}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>班级课表</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
              当前班级：{classLabel ?? '未设置'}
            </Text>
            <Pressable
              onPress={() => router.push('/settings')}
              style={[styles.linkBtn, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundSelected }]}>
              <Text style={{ color: colors.text, fontSize: 13 }}>去设置系部 / 专业 / 班级</Text>
            </Pressable>
          </View>

          <View style={[styles.subBlock, styles.hairline, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Pressable onPress={() => setShowTimes((v) => !v)} style={styles.timesHead}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>作息时间表</Text>
              <Text style={{ color: colors.primary, fontSize: 13 }}>{showTimes ? '收起 ▲' : '查看 ▼'}</Text>
            </Pressable>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
              当前使用：{source}
            </Text>
            {showTimes && (
              <View style={{ marginTop: 8, gap: 4 }}>
                {PERIOD_ORDER.filter((p) => times[p]).map((p) => (
                  <View key={p} style={styles.timeRow}>
                    <Text style={{ color: colors.text, width: 52, fontSize: 13 }}>{p} 节</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {times[p][0]} — {times[p][1]}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.timesBtnRow}>
              <Pressable
                onPress={() => useSeasonPreset('winter')}
                style={[styles.timesBtn, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundSelected }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>导入冬季</Text>
              </Pressable>
              <Pressable
                onPress={() => useSeasonPreset('summer')}
                style={[styles.timesBtn, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundSelected }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>导入夏季</Text>
              </Pressable>
              <Pressable
                onPress={() => setEditOpen(true)}
                style={[styles.timesBtn, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundSelected }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>手动编辑</Text>
              </Pressable>
              <Pressable
                onPress={() => setJsonOpen(true)}
                style={[styles.timesBtn, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundSelected }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>JSON 导入</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.subBlock, styles.hairline, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>天气城市</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
              {wxCity ? `手动指定：${wxCity}` : '自动定位（IP 定位，城市可能不准）'}
            </Text>
            <View style={[styles.timesBtnRow, { marginTop: 10, marginBottom: 0 }]}>
              <Pressable
                onPress={() => void setWeatherCity(null).then(() => setWxCity(null))}
                style={[
                  styles.timesBtn,
                  glassBorder(!wxCity),
                  { flex: 1, backgroundColor: glass ? (!wxCity ? 'rgba(37,99,235,0.15)' : 'transparent') : !wxCity ? colors.primary : colors.backgroundSelected },
                ]}>
                <Text style={{ color: !wxCity && !glass ? '#fff' : colors.text, fontSize: 12 }}>跟随定位</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setWxInput(wxCity ?? '');
                  setWxOpen(true);
                }}
                style={[styles.timesBtn, glassBorder(!!wxCity), { flex: 1, backgroundColor: glass ? 'transparent' : colors.backgroundSelected }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>手动设置</Text>
              </Pressable>
            </View>
          </View>
        </CardWrap>

        {/* 倒计时 */}
        <CardWrap style={cardStyle(styles.section)}>
          <Text style={[styles.secTitle, { color: colors.text }]}>倒计时</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            显示在课表页顶部，如四六级、期末考试
          </Text>
          {cdList.length > 0 && (
            <View style={{ marginTop: 8, gap: 6 }}>
              {cdList.map((c) => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                    {c.name} · {c.date}
                  </Text>
                  <Pressable onPress={() => void removeCountdown(c.id)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <TextInput
              value={cdName}
              onChangeText={setCdName}
              placeholder="名称（如：四六级）"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.editInput,
                { flex: 1.3, backgroundColor: colors.backgroundElement, color: colors.text, borderWidth: 1, borderColor: 'rgba(100,116,139,0.45)', minHeight: 40 },
              ]}
            />
            <TextInput
              value={cdDate}
              onChangeText={setCdDate}
              placeholder="2026-12-12"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numbers-and-punctuation"
              style={[
                styles.editInput,
                { flex: 1, backgroundColor: colors.backgroundElement, color: colors.text, borderWidth: 1, borderColor: 'rgba(100,116,139,0.45)', minHeight: 40 },
              ]}
            />
            <Pressable
              onPress={addCd}
              style={[styles.timesBtn, { backgroundColor: colors.primary, minHeight: 40, paddingHorizontal: 14 }]}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>添加</Text>
            </Pressable>
          </View>
        </CardWrap>

        {/* 数据与备份 */}
        <CardWrap style={cardStyle(styles.section)}>
          <Text style={[styles.secTitle, { color: colors.text }]}>数据与备份</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            备份班级设置、作息、待办、倒计时、主题、镜像与账号。导出的 JSON 可发送到微信/QQ 收藏，换机或重装后粘贴导入。
          </Text>
          <View style={[styles.timesBtnRow, { marginTop: 10 }]}>
            <Pressable
              onPress={() =>
                void exportBackup().then((j) => {
                  setBkJson(j);
                  setBkOutOpen(true);
                })
              }
              style={[styles.timesBtn, glassBorder(), { flex: 1, backgroundColor: glass ? 'transparent' : colors.backgroundSelected }]}>
              <Text style={{ color: glass ? colors.text : '#fff', fontSize: 12, fontWeight: '700' }}>导出备份</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setBkText('');
                setBkInOpen(true);
              }}
              style={[styles.timesBtn, glassBorder(), { flex: 1, backgroundColor: glass ? 'transparent' : colors.backgroundSelected }]}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>导入备份</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() =>
              void resetAccessAndEnsureDirs()
                .then((ok) => (ok ? saveBackupToClass() : ({ ok: false, error: '需要授权访问手机 Class 文件夹才能保存备份' } as const)))
                .then((r) => {
                if (r.ok) Alert.alert('已保存', `备份文件已存到 ${r.path}`);
                else
                  Alert.alert('保存失败', `${r.error ?? '未知错误'}\n点"去授权"后在弹窗中选中 Class 文件夹`, [
                    { text: '取消', style: 'cancel' },
                    { text: '去授权', onPress: () => void requestClassAccess() },
                  ]);
              })
            }
            style={[styles.timesBtn, glassBorder(), { marginTop: 8, backgroundColor: glass ? 'transparent' : colors.backgroundSelected, justifyContent: 'center', minHeight: 40 }]}>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>保存到手机 /Class/备份 文件夹</Text>
          </Pressable>
        </CardWrap>

        {/* 通用 */}
        <CardWrap style={cardStyle(styles.section)}>
          <Text style={[styles.secTitle, { color: colors.text }]}>通用</Text>

          <Pressable onPress={() => router.push('/notices' as never)} style={styles.rowBtn}>
            <Ionicons name="megaphone-outline" size={17} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>公告</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>查看全部公告与历史发布</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/sponsor' as never)}
            style={[styles.rowBtn, styles.hairline, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Ionicons name="heart" size={17} color="#ef4444" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>支持开发者</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>请开发者喝杯奶茶（收款码）</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => {
              setSiteInput(siteUrl);
              setSiteOpen(true);
            }}
            style={[styles.rowBtn, styles.hairline, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Ionicons name="globe-outline" size={17} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>官网接口地址</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
                {siteUrl}（公告 / 收款码下发）
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => startCoachTour()}
            style={[styles.rowBtn, styles.hairline, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Ionicons name="compass" size={17} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>新手引导</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>方块高亮+箭头指引, 一步步逛 App</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => setIntroOpen(true)}
            style={[styles.rowBtn, styles.hairline, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Ionicons name="book" size={17} color="#7c3aed" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>图文功能教程</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>6 页图文介绍, 随时回看</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/dev' as never)}
            style={[styles.rowBtn, styles.hairline, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Ionicons name="terminal-outline" size={17} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>开发者选项</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>登录修复 / 调试</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => setAgreementOpen(true)}
            style={[styles.rowBtn, styles.hairline, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Ionicons name="document-text-outline" size={17} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>用户协议</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>
        </CardWrap>

        <UpdateCard colors={colors} />
        <AboutGithub colors={colors} />
      </ScrollView>

      <TimesEditorModal visible={editOpen} initial={times} onClose={() => setEditOpen(false)} colors={colors} />
      <JsonImportModal visible={jsonOpen} onClose={() => setJsonOpen(false)} colors={colors} />
      {/* 用户协议(查看模式) */}
      <AgreementModal visible={agreementOpen} mode="view" onClose={() => setAgreementOpen(false)} />
      {/* 图文功能教程(常驻入口) */}
      <OnboardingModal visible={introOpen} onClose={() => setIntroOpen(false)} />
      {/* 导出备份: 展示 JSON + 系统分享 */}
      <Modal visible={bkOutOpen} transparent animationType="fade" onRequestClose={() => setBkOutOpen(false)}>
        <Pressable style={styles.modalMask} onPress={() => setBkOutOpen(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>备份内容</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <TextInput
                value={bkJson}
                editable={false}
                multiline
                style={[
                  styles.jsonInput,
                  { backgroundColor: colors.backgroundElement, color: colors.text, borderWidth: 1, borderColor: 'rgba(100,116,139,0.45)' },
                ]}
              />
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <Pressable onPress={() => setBkOutOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
                <Text style={{ color: colors.text }}>关闭</Text>
              </Pressable>
              <Pressable
                onPress={() => void Share.share({ message: bkJson })}
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>分享 / 复制</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {/* 导入备份: 粘贴 JSON 恢复 */}
      <Modal visible={bkInOpen} transparent animationType="fade" onRequestClose={() => setBkInOpen(false)}>
        <Pressable style={styles.modalMask} onPress={() => setBkInOpen(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>导入备份</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
              粘贴之前导出的备份 JSON，导入后请退出并重新打开 App 使设置全部生效。
            </Text>
            <TextInput
              value={bkText}
              onChangeText={setBkText}
              multiline
              numberOfLines={6}
              placeholder='{"app":"class-schedule-backup", ...}'
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.jsonInput,
                { backgroundColor: colors.backgroundElement, color: colors.text, borderWidth: 1, borderColor: 'rgba(100,116,139,0.45)' },
              ]}
            />
            <View style={styles.modalBtnRow}>
              <Pressable onPress={() => setBkInOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
                <Text style={{ color: colors.text }}>取消</Text>
              </Pressable>
              <Pressable
                disabled={!bkText.trim()}
                onPress={() =>
                  void importBackup(bkText).then((r) => {
                    if (r.ok) {
                      setBkInOpen(false);
                      Alert.alert('恢复完成', '数据已导入，请退出并重新打开 App 使设置全部生效。');
                    } else {
                      Alert.alert('导入失败', r.error ?? '未知错误');
                    }
                  })
                }
                style={[styles.modalBtn, { backgroundColor: bkText.trim() ? colors.primary : colors.backgroundElement }]}>
                <Text style={{ color: bkText.trim() ? '#fff' : colors.textSecondary, fontWeight: '700' }}>导入</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={wxOpen} transparent animationType="fade" onRequestClose={() => setWxOpen(false)}>
        <Pressable style={styles.modalMask} onPress={() => setWxOpen(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>天气城市</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
              输入城市名（如：长沙、儋州、海口），保存后天气立即按新城市查询；留空保存则恢复自动定位。
            </Text>
            <TextInput
              value={wxInput}
              onChangeText={setWxInput}
              placeholder="长沙"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.editInput,
                {
                  backgroundColor: colors.backgroundElement,
                  color: colors.text,
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: 'rgba(100,116,139,0.45)',
                  minHeight: 44,
                  fontSize: 15,
                },
              ]}
            />
            <View style={styles.modalBtnRow}>
              <Pressable onPress={() => setWxOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
                <Text style={{ color: colors.text }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const c = wxInput.trim() || null;
                  void setWeatherCity(c).then(() => {
                    setWxCity(c);
                    setWxOpen(false);
                  });
                }}
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={siteOpen} transparent animationType="fade" onRequestClose={() => setSiteOpen(false)}>
        <Pressable style={styles.modalMask} onPress={() => setSiteOpen(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>官网接口地址</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
              App 从官网拉取公告与赞助收款码。地址填站点根（不带 /api/config.php），默认 {DEFAULT_SITE_URL}
            </Text>
            <TextInput
              value={siteInput}
              onChangeText={setSiteInput}
              placeholder={DEFAULT_SITE_URL}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="url"
              style={[
                styles.editInput,
                {
                  backgroundColor: colors.backgroundElement,
                  color: colors.text,
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: 'rgba(100,116,139,0.45)',
                  minHeight: 44,
                  fontSize: 14,
                },
              ]}
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => {
                  void setSiteUrl(null).then(() => {
                    setSiteUrlState(DEFAULT_SITE_URL);
                    setSiteOpen(false);
                  });
                }}
                style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
                <Text style={{ color: colors.text }}>恢复默认</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void setSiteUrl(siteInput).then((u) => {
                    setSiteUrlState(u);
                    setSiteOpen(false);
                  });
                }}
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>保存</Text>
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
  content: { padding: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: Spacing.three },
  label: { fontSize: 13, marginBottom: 6, marginTop: Spacing.two },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, fontSize: 15 },
  startRow: { flexDirection: 'row', gap: Spacing.two },
  startBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtn: { borderRadius: 12, alignItems: 'center', paddingVertical: 13, marginTop: Spacing.three },
  section: { borderRadius: 12, padding: Spacing.two, marginTop: Spacing.three, gap: Spacing.one },
  secTitle: { fontSize: 15, fontWeight: '800' },
  subCard: { marginTop: Spacing.two },
  subBlock: { paddingTop: Spacing.one, marginTop: 2 },
  hairline: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.one },
  rowBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, marginTop: 2 },
  linkBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: Spacing.one },
  timesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timesBtnRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.one, flexWrap: 'wrap' },
  timesBtn: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.three },
  modalBox: { borderRadius: 14, padding: Spacing.two },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  modalHint: { fontSize: 12, lineHeight: 18, marginBottom: Spacing.one },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  editLabel: { width: 52, fontSize: 13 },
  editInput: { flex: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  jsonInput: { borderRadius: 10, padding: 12, fontSize: 13, minHeight: 130, textAlignVertical: 'top', fontFamily: 'monospace' },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one, justifyContent: 'flex-end' },
  modalBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
});
