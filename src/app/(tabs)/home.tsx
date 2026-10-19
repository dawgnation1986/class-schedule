import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AboutGithub } from '@/components/about-github';
import { PORTAL_SITE, clearSession, loadLoginPage, submitLogin, tryRestoreSession, type LoginState, type PortalApp } from '@/lib/portal';
import { loadAccount, saveAccount } from '@/lib/account';

export default function PortalScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
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

  const login = useCallback(async () => {
    if (!state || !username || !password || !captcha) return;
    setLoggingIn(true);
    setError(null);
    try {
      const r = await submitLogin(state, username, password, captcha);
      if (r.ok) {
        setName(r.name);
        setApps(r.apps);
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
  }, [state, username, password, captcha, refreshCaptcha]);

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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>综合管理平台</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {!name && (
          <View style={styles.loginCard}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>学号</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="请输入学号"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundElement }]}
              autoCapitalize="none"
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>密码</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="请输入密码"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundElement }]}
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
            <Pressable
              disabled={loggingIn || loading || !state || !username || !password || !captcha}
              onPress={login}
              style={[styles.loginBtn, { backgroundColor: username && password && captcha ? '#2563eb' : colors.backgroundElement }]}>
              {loggingIn ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={{ color: username && password && captcha ? '#fff' : colors.textSecondary, fontWeight: '700' }}>
                  登 录
                </Text>
              )}
            </Pressable>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              站点限制：每次进入都需重新输入验证码登录。
            </Text>
            <Pressable onPress={() => router.navigate('/timetable')} style={styles.skipLogin}>
              <Text style={{ color: '#2563eb', fontSize: 13 }}>班级课表查询无需登录，直接去查 →</Text>
            </Pressable>
          </View>
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
            <View style={[styles.searchWrap, { backgroundColor: colors.backgroundElement }]}>
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
            </View>
            {shownApps.length > 0 ? (
              <View style={styles.appGrid}>
                {shownApps.map((app) => (
                  <Pressable
                    key={app.href}
                    onPress={() => openApp(app)}
                    style={[styles.appItem, { backgroundColor: colors.backgroundElement }]}>
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
