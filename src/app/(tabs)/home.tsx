import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { usePageBackground, useBgSetting } from '@/lib/background';
import { NightGlowBackground, NightCard, NightPrimaryButton } from '@/components/night-kit';
import { AboutGithub } from '@/components/about-github';
import { PORTAL_SITE, clearSession, loadLoginPage, submitLogin, tryRestoreSession, type LoginState, type PortalApp } from '@/lib/portal';
import { loadAccount, saveAccount } from '@/lib/account';
import {
  getCaptchaAutoEnabled,
  getOcrConfig,
  recognizeCaptcha,
  saveOcrConfig,
  setCaptchaAutoEnabled,
  type OcrConfig,
} from '@/lib/captcha-ocr';

export default function PortalScreen() {
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
  // 墨夜模式: 卡片容器交给 NightCard 重绘, 去掉原背景/玻璃描边, 保留圆角与内边距
  const CardWrap: ElementType = night ? NightCard : View;
  const cardStyle = (base: ViewStyle): StyleProp<ViewStyle> =>
    night ? base : [base, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundElement }];
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [state, setState] = useState<LoginState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [apps, setApps] = useState<PortalApp[]>([]);
  const [keyword, setKeyword] = useState('');
  // 自动识别验证码并登录(开关持久化)
  const [autoCaptcha, setAutoCaptcha] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  const [ocrKeyOpen, setOcrKeyOpen] = useState(false);
  const [ocrDraft, setOcrDraft] = useState<OcrConfig>({
    ocrSpaceKey: '',
    baiduAk: '',
    baiduSk: '',
    customUrl: '',
  });
  const autoTries = useRef(0);
  const autoDoneFor = useRef<LoginState | null>(null);

  // 关键字匹配: 按应用标题模糊过滤(支持空格分隔多个关键字, 命中任一即保留)
  const shownApps = useMemo(() => {
    const kws = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!kws.length) return apps;
    return apps.filter((a) => {
      const t = a.title.toLowerCase();
      return kws.some((k) => t.includes(k));
    });
  }, [apps, keyword]);

  const refreshCaptcha = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCaptcha('');
    try {
      setState(await loadLoginPage());
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载登录页失败');
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 站点限制: 优先尝试恢复上次会话(持久登录), 失效才拉新验证码要求重新登录
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const acc = await loadAccount();
        if (acc) {
          setUsername(acc.username);
          setPassword(acc.password);
        }
        setAutoCaptcha(await getCaptchaAutoEnabled());
        // 每次进入页面重置自动尝试次数, 由自动识别流程消费
        autoTries.current = 0;
        autoDoneFor.current = null;
        setOcrMsg(null);
        // 已登录状态下不自动降级(避免误清), 只在未登录时尝试恢复
        if (name) return;
        setLoading(true);
        try {
          const s = await tryRestoreSession();
          if (s) {
            setName(s.name);
            setApps(s.apps);
            return;
          }
        } finally {
          setLoading(false);
        }
        await refreshCaptcha();
      })();
    }, [refreshCaptcha, name]),
  );

  const login = useCallback(
    async (captchaOverride?: string) => {
      const code = (captchaOverride ?? captcha).trim();
      if (!state || !username || !password || !code) return;
      setLoggingIn(true);
      setError(null);
      try {
        const r = await submitLogin(state, username, password, code);
        if (r.ok) {
          setName(r.name);
          setApps(r.apps);
          setOcrMsg(null);
          await saveAccount({ username, password, startPage: (await loadAccount())?.startPage ?? 'home' });
        } else {
          setError(r.message);
          await refreshCaptcha(); // 验证码已失效, 换一张
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '登录失败，请重试');
        await refreshCaptcha();
      } finally {
        setLoggingIn(false);
      }
    },
    [state, username, password, captcha, refreshCaptcha],
  );

  // 自动识别验证码 → 填入 → 触发登录(每次打开/换验证码最多尝试 2 次, 失败回退手动)
  useEffect(() => {
    if (!autoCaptcha || !state || name || loggingIn || loading) return;
    if (!username || !password) return;
    if (autoDoneFor.current === state || autoTries.current >= 2) return;
    autoDoneFor.current = state;
    autoTries.current += 1;
    let cancelled = false;
    (async () => {
      setOcrBusy(true);
      setOcrMsg('正在自动识别验证码…');
      const r = await recognizeCaptcha(state.captchaUri);
      if (cancelled) return;
      setOcrBusy(false);
      if (!r.ok) {
        setOcrMsg(`自动识别失败：${r.error}，请手动输入`);
        return;
      }
      setCaptcha(r.text);
      setOcrMsg(`已识别 ${r.text}，正在登录…`);
      await login(r.text);
    })();
    return () => {
      cancelled = true;
    };
  }, [autoCaptcha, state, name, loggingIn, loading, username, password, login]);

  const openApp = useCallback(
    (app: PortalApp) => {
      // 班级周课表查询 → 底部导航栏的"课表"页(原生课表, 无需登录)
      if (app.href.includes('kb_bj_cs')) {
        router.navigate('/timetable');
        return;
      }
      if (/^https?:\/\//i.test(app.href) && !app.href.includes('jwtk.cshbxy.com')) {
        // 外部系统(如缴费, 独立程序) → 系统浏览器, 不带任何会话
        Linking.openURL(app.href).catch(() => {});
      } else {
        // 校内应用 → 原生外壳: WebView + 样式注入
        router.push({ pathname: '/portal-page', params: { title: app.title, path: app.href } });
      }
    },
    [router],
  );

  /** OCR 配置输入框(4 个 Key/URL 共用样式) */
  const ocrField = (key: keyof OcrConfig, placeholder: string, secure = false) => (
    <TextInput
      value={ocrDraft[key]}
      onChangeText={(v) => setOcrDraft((d) => ({ ...d, [key]: v }))}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry={secure}
      style={[
        styles.input,
        {
          marginTop: 6,
          backgroundColor: glass ? 'transparent' : colors.backgroundElement,
          color: colors.text,
          borderColor: glass ? glassLine : colors.backgroundElement,
        },
      ]}
    />
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {/* 墨夜背景: 深空渐变 + 顶部辉光(绝对定位铺满, 原版模式不渲染) */}
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
      <ScrollView
        contentContainerStyle={[styles.content, uiMode === 'glass' && { paddingBottom: 124 }]}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>综合管理平台</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {!name && (
          <CardWrap style={styles.loginCard}>
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
            <Text style={[styles.label, { color: colors.textSecondary }]}>验证码（点击图片可刷新）</Text>
            <View style={styles.captchaRow}>
              <TextInput
                value={captcha}
                onChangeText={setCaptcha}
                placeholder="验证码"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, styles.captchaInput, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundElement }]}
                autoCapitalize="characters"
              />
              <Pressable onPress={refreshCaptcha} style={styles.captchaImgWrap}>
                {loading ? (
                  <ActivityIndicator />
                ) : state ? (
                  <Image source={{ uri: state.captchaUri }} style={styles.captchaImg} resizeMode="contain" />
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>点击重试</Text>
                )}
              </Pressable>
            </View>
            {/* 自动识别验证码并登录 */}
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  hitSlop={6}
                  onPress={() => {
                    const next = !autoCaptcha;
                    setAutoCaptcha(next);
                    setOcrMsg(null);
                    void setCaptchaAutoEnabled(next);
                    if (next) {
                      autoTries.current = 0;
                      autoDoneFor.current = null;
                    }
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                  <Ionicons
                    name={autoCaptcha ? 'checkbox' : 'square-outline'}
                    size={17}
                    color={autoCaptcha ? colors.primary : colors.textSecondary}
                  />
                  <Text style={{ color: colors.text, fontSize: 12.5 }}>自动识别验证码并登录</Text>
                </Pressable>
                {ocrBusy && <ActivityIndicator size="small" />}
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    void getOcrConfig().then((c) => {
                      setOcrDraft(c);
                      setOcrKeyOpen(true);
                    });
                  }}>
                  <Text style={{ color: colors.primary, fontSize: 11.5 }}>识别 Key</Text>
                </Pressable>
              </View>
              {autoCaptcha && !ocrMsg && (
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                  打开 App 时自动识别并登录；验证码图片会上传到第三方 OCR 服务，失败会退回手动输入。
                </Text>
              )}
              {!!ocrMsg && (
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>{ocrMsg}</Text>
              )}
            </View>
            {night ? (
              <NightPrimaryButton
                title="登 录"
                onPress={() => void login()}
                disabled={loggingIn || loading || !state || !username || !password || !captcha}
                style={{ marginTop: Spacing.three }}
              />
            ) : (
              <Pressable
                disabled={loggingIn || loading || !state || !username || !password || !captcha}
                onPress={() => void login()}
                style={[
                  styles.loginBtn,
                  glassBorder(!!(username && password && captcha)),
                  { backgroundColor: glass ? (username && password && captcha ? 'rgba(37,99,235,0.15)' : 'transparent') : username && password && captcha ? colors.primary : colors.backgroundElement },
                ]}>
                {loggingIn ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={{ color: username && password && captcha ? (glass ? colors.text : '#fff') : colors.textSecondary, fontWeight: '700' }}>
                    登 录
                  </Text>
                )}
              </Pressable>
            )}
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              站点限制：每次进入都需重新输入验证码登录。
            </Text>
            <Pressable onPress={() => router.navigate('/timetable')} style={styles.skipLogin}>
              <Text style={{ color: colors.primary, fontSize: 13 }}>班级课表查询无需登录，直接去查 →</Text>
            </Pressable>
          </CardWrap>
        )}

        {name && (
          <View style={{ width: '100%' }}>
            <View style={styles.welcomeRow}>
              <Text style={[styles.welcome, { color: colors.textSecondary }, { marginBottom: 0 }]}>
                你好，{name}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={async () => {
                  await clearSession();
                  setName(null);
                  setApps([]);
                  await refreshCaptcha();
                }}>
                <Text style={{ color: '#ef4444', fontSize: 13 }}>退出登录</Text>
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
              会话过期后需重新输入验证码登录。
            </Text>
            <CardWrap style={cardStyle(styles.searchWrap)}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput
                value={keyword}
                onChangeText={setKeyword}
                placeholder="搜索应用，如：成绩 / 课表 / 考试"
                placeholderTextColor={colors.textSecondary}
                style={[styles.searchInput, { color: colors.text }]}
                returnKeyType="search"
              />
              {!!keyword && (
                <Pressable onPress={() => setKeyword('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </Pressable>
              )}
            </CardWrap>
            {shownApps.length > 0 ? (
              <View style={styles.appGrid}>
                {shownApps.map((app) => (
                  <Pressable
                    key={app.href}
                    onPress={() => openApp(app)}
                    style={[styles.appItem, glassBorder(), { backgroundColor: glass ? 'transparent' : colors.backgroundElement }]}>
                    <Text style={[styles.appTitle, { color: colors.text }]} numberOfLines={2}>
                      {app.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.noResult}>
                <Ionicons name="search-outline" size={32} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
                  没有匹配「{keyword.trim()}」的应用
                </Text>
              </View>
            )}
            {apps.length === 0 && (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>没有解析到应用列表</Text>
            )}
          </View>
        )}

        <AboutGithub colors={colors} />
      </ScrollView>

      {/* OCR 服务设置(可选): 自定义接口 → 百度 OCR → ocr.space 依次尝试 */}
      <Modal visible={ocrKeyOpen} transparent animationType="fade" onRequestClose={() => setOcrKeyOpen(false)}>
        <View style={styles.modalMask}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOcrKeyOpen(false)} />
          <View style={[styles.modalBox, { backgroundColor: colors.background }]}>
            <ScrollView style={{ maxHeight: 430 }} keyboardShouldPersistTaps="handled">
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>识别服务设置（可选）</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                识别时按“自定义接口 → 百度 OCR → ocr.space”依次尝试。全部留空也能用内置公共 Key，但配额有限、国内访问可能不稳定。
              </Text>

              <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>ocr.space Key</Text>
              {ocrField('ocrSpaceKey', '留空用内置公共 Key')}
              <Pressable onPress={() => Linking.openURL('https://ocr.space/ocrapi/freekey').catch(() => {})}>
                <Text style={{ color: colors.primary, fontSize: 11.5, marginTop: 4 }}>免费申请 ocr.space Key →</Text>
              </Pressable>

              <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>百度智能云 API Key</Text>
              {ocrField('baiduAk', '填了 AK/SK 才会启用百度 OCR')}
              <Text style={[styles.label, { color: colors.text, marginTop: 8 }]}>百度智能云 Secret Key</Text>
              {ocrField('baiduSk', 'Secret Key', true)}
              <Pressable onPress={() => Linking.openURL('https://console.bce.baidu.com/ai/#/ai/ocr/overview/index').catch(() => {})}>
                <Text style={{ color: colors.primary, fontSize: 11.5, marginTop: 4 }}>去百度智能云开通（有免费额度，国内速度更快）→</Text>
              </Pressable>

              <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>自定义 OCR 接口</Text>
              {ocrField('customUrl', 'https://…（可选）')}
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                兼容 ocr.space 格式：POST 表单 base64Image，返回 ParsedResults[0].ParsedText 或 text 字段。
              </Text>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => setOcrKeyOpen(false)}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: colors.backgroundElement }}>
                <Text style={{ color: colors.text }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void saveOcrConfig(ocrDraft).then(() => {
                    setOcrKeyOpen(false);
                    autoTries.current = 0;
                    autoDoneFor.current = null;
                    setOcrMsg('识别服务已保存，下次识别生效');
                  });
                }}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: colors.primary }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: Spacing.three },
  error: { color: '#ef4444', marginBottom: Spacing.two },
  loginCard: { width: '100%' },
  label: { fontSize: 13, marginBottom: 6, marginTop: Spacing.two },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, fontSize: 15 },
  captchaRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  modalBox: { width: '100%', maxWidth: 420, borderRadius: 16, padding: Spacing.three },
  captchaInput: { flex: 1 },
  captchaImgWrap: { width: 110, height: 46, alignItems: 'center', justifyContent: 'center' },
  captchaImg: { width: 110, height: 46 },
  loginBtn: { borderRadius: 12, alignItems: 'center', paddingVertical: 14, marginTop: Spacing.three },
  hint: { fontSize: 12, marginTop: Spacing.two, lineHeight: 18 },
  skipLogin: { alignSelf: 'flex-start', marginTop: Spacing.two, paddingVertical: 4 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
  welcome: { fontSize: 14, marginBottom: Spacing.three },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 42,
    marginBottom: Spacing.three,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  noResult: { alignItems: 'center', paddingVertical: 40 },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  appItem: { width: '47%', flexGrow: 1, borderRadius: 12, padding: Spacing.two, gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 76 },
  appTitle: { fontSize: 14, fontWeight: '600' },
});
