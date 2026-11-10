/** 开发者页面: 登录修复 / 登录字段缓存 / 联通测试 / 通知调试 / 存储概览 / 诊断与日志导出 / 危险操作 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PageBackdrop, usePageBackground, useBgSetting } from '@/lib/background';
import { PORTAL_SITE, clearSession, loadLoginPage, type LoginState } from '@/lib/portal';
import { loadSettings } from '@/lib/settings';
import { setTempOverride } from '@/lib/tempOverride';
import { END_CHANNEL_ID, ensureReminderChannel, START_CHANNEL_ID } from '@/lib/notifications';

type LogLine = { ok: boolean | null; text: string };

/** 登录字段缓存键: 拉取一次后持久保存, 查看不再重复请求 */
const LOGIN_FIELDS_KEY = 'dev.loginfields.v1';
type CachedLoginFields = { vs: string; g: string; ev: string; captchaUri: string; cookie: string; at: number };

/** 折叠分组: 点标题收起/展开 */
function Section({
  title,
  icon,
  color,
  colors,
  glass,
  glassLine,
  danger,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  colors: (typeof Colors)[keyof typeof Colors];
  glass: boolean;
  glassLine: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: glass ? 'transparent' : colors.backgroundElement,
          borderColor: danger ? 'rgba(239,68,68,0.4)' : glass ? glassLine : 'transparent',
          borderWidth: 1,
        },
      ]}>
      <Pressable style={styles.cardHead} onPress={() => setOpen((o) => !o)} hitSlop={6}>
        <Ionicons name={icon} size={16} color={color ?? '#2563eb'} />
        <Text style={{ color: color ?? colors.text, fontWeight: '700', fontSize: 14, flex: 1 }}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textSecondary} />
      </Pressable>
      {open && children}
    </View>
  );
}

function Btn({
  label,
  onPress,
  colors,
  tone,
  disabled,
  glass,
  glassLine,
}: {
  label: string;
  onPress: () => void;
  colors: (typeof Colors)[keyof typeof Colors];
  tone?: 'primary' | 'danger';
  disabled?: boolean;
  glass: boolean;
  glassLine: string;
}) {
  const solid = tone === 'danger' ? '#ef4444' : tone === 'primary' ? '#2563eb' : null;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        glass
          ? { backgroundColor: solid ? 'rgba(37,99,235,0.15)' : 'transparent', borderWidth: 1, borderColor: solid && tone !== 'danger' ? 'rgba(37,99,235,0.55)' : glassLine }
          : { backgroundColor: solid ?? colors.backgroundSelected },
        disabled && { opacity: 0.5 },
      ]}>
      <Text style={{ color: !glass && solid ? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export default function DevScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  // 控件全透明模式: 与其他页一致, 只留文字 + 1px 轮廓
  const glass = !!bgSetting.uri && !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const router = useRouter();

  const [logs, setLogs] = useState<LogLine[]>([]);
  const [repairing, setRepairing] = useState(false);
  const [net, setNet] = useState<Record<string, string>>({});
  const [perm, setPerm] = useState<string>('未查询');
  const [channelInfo, setChannelInfo] = useState<string>('未查询');
  const [keys, setKeys] = useState<string[] | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [settingsLabel, setSettingsLabel] = useState('未设置');
  const [cachedFields, setCachedFields] = useState<CachedLoginFields | null>(null);
  const [fetchingFields, setFetchingFields] = useState(false);

  /** 从本地缓存读登录字段(不发网络请求) */
  const loadCachedFields = useCallback(async () => {
    const raw = await AsyncStorage.getItem(LOGIN_FIELDS_KEY);
    setCachedFields(raw ? (JSON.parse(raw) as CachedLoginFields) : null);
  }, []);

  /** 拉取最新登录页并写缓存 */
  const fetchAndCacheFields = useCallback(async () => {
    setFetchingFields(true);
    try {
      const s = await loadLoginPage();
      const c: CachedLoginFields = {
        vs: s.vs,
        g: s.g,
        ev: s.ev,
        captchaUri: s.captchaUri,
        cookie: s.cookie,
        at: Date.now(),
      };
      await AsyncStorage.setItem(LOGIN_FIELDS_KEY, JSON.stringify(c));
      setCachedFields(c);
    } catch (e) {
      Alert.alert('拉取失败', e instanceof Error ? e.message : '网络异常');
    } finally {
      setFetchingFields(false);
    }
  }, []);

  const push = (ok: boolean | null, text: string) => setLogs((l) => [...l, { ok, text }]);

  /** 一键修复登录: 清脏数据 → 重新拉登录页 → 校验登录字段 */
  const repairLogin = useCallback(async () => {
    setRepairing(true);
    setLogs([]);
    try {
      await clearSession();
      push(true, '① 已清除本地持久会话');
      setTempOverride(null);
      push(true, '② 已清除临时班级查看数据');
      let state: LoginState;
      try {
        state = await loadLoginPage();
      } catch (e) {
        push(false, `③ 登录页拉取失败: ${e instanceof Error ? e.message : '网络异常'}`);
        push(null, '结论: 学校服务器可能挂了或被墙, 稍后重试');
        return;
      }
      push(true, '③ 登录页与验证码图拉取成功');
      // 顺带刷新登录字段缓存
      const c: CachedLoginFields = {
        vs: state.vs,
        g: state.g,
        ev: state.ev,
        captchaUri: state.captchaUri,
        cookie: state.cookie,
        at: Date.now(),
      };
      await AsyncStorage.setItem(LOGIN_FIELDS_KEY, JSON.stringify(c));
      setCachedFields(c);
      push(true, '④ 登录字段已缓存, 可在下方「登录字段」中查看');
      const fields: [string, string][] = [
        ['__VIEWSTATE', state.vs],
        ['__VIEWSTATEGENERATOR', state.g],
        ['__EVENTVALIDATION', state.ev],
      ];
      for (const [name, val] of fields) {
        push(!!val, `${name}: ${val ? `OK (${val.length} 字符)` : '缺失! 站点改版了'}`);
      }
      push(state.captchaUri.startsWith('data:image'), `验证码图: ${state.captchaUri.slice(5, 20)}...`);
      const missing = fields.filter(([, v]) => !v);
      push(
        missing.length === 0,
        missing.length === 0
          ? '✅ 修复完成, 登录字段全部正常, 请回「主站」重新登录'
          : `❌ 缺失字段: ${missing.map(([n]) => n).join(', ')}, 需要更新 App 适配`,
      );
    } finally {
      setRepairing(false);
    }
  }, []);

  /** 网络连通性: 测各依赖端点延迟 */
  const testNet = useCallback(async (name: string, url: string, opts?: RequestInit) => {
    setNet((n) => ({ ...n, [name]: '测试中...' }));
    const t0 = Date.now();
    try {
      const r = await fetch(url, { ...opts, headers: { ...opts?.headers, accept: '*/*' } });
      setNet((n) => ({ ...n, [name]: `${r.status} · ${Date.now() - t0}ms` }));
    } catch {
      setNet((n) => ({ ...n, [name]: `失败 · ${Date.now() - t0}ms` }));
    }
  }, []);

  const testAllNet = useCallback(() => {
    void testNet('门户外链', PORTAL_SITE);
    void testNet('登录接口', `${PORTAL_SITE}/loginp.aspx?login=1`);
    void testNet('天气地理编码', 'https://geocoding-api.open-meteo.com/v1/search?name=changsha&count=1');
    void testNet('天气数据', 'https://api.open-meteo.com/v1/forecast?latitude=28.2&longitude=112.9&current_weather=true');
    void testNet('IP 定位', 'https://ipwho.is/');
    void testNet('GitHub API', 'https://api.github.com/repos/dawgnation1986/class-schedule/releases/latest');
  }, [testNet]);

  const refreshStorage = useCallback(async () => {
    const ks = await AsyncStorage.getAllKeys();
    setKeys([...ks]);
    void loadSettings().then((s) => setSettingsLabel(s ? `${s.xb} / ${s.bjLabel}` : '未设置'));
  }, []);

  useEffect(() => {
    void refreshStorage();
    void loadCachedFields();
  }, [refreshStorage, loadCachedFields]);

  const totalSize = keys?.reduce((n, k) => n + k.length, 0) ?? 0;

  /** 通知调试 */
  const checkPerm = useCallback(async () => {
    const Notifications = require('expo-notifications');
    const p = await Notifications.getPermissionsAsync();
    setPerm(
      p.granted
        ? `已授权 (${p.status})`
        : `未授权 (${p.status})`,
    );
    // 渠道状态: 指定了不存在的 channelId 时 Android 会静默丢弃通知; 上课/下课各一个渠道
    try {
      const [st, en] = await Promise.all([
        Notifications.getNotificationChannelAsync(START_CHANNEL_ID),
        Notifications.getNotificationChannelAsync(END_CHANNEL_ID),
      ]);
      const label = (ch: { importance: number } | null, name: string) =>
        ch
          ? `${name}渠道 存在 · importance=${ch.importance}${Number(ch.importance) >= Notifications.AndroidImportance.HIGH ? '(横幅可用✓)' : ' ← 重要级过低, 横幅弹不出!'}`
          : `${name}渠道 不存在 ← 测试前先点「确保渠道存在」`;
      setChannelInfo(`${label(st, '上课')}\n${label(en, '下课')}`);
    } catch {
      setChannelInfo('查询失败');
    }
  }, []);

  /** 检测并自动修复渠道: 不存在/重要级不足 → 创建或删除重建(MAX) */
  const fixChannel = useCallback(async () => {
    const st = await ensureReminderChannel();
    await checkPerm();
    return st;
  }, [checkPerm]);

  // 进入页面自动检测通知权限与渠道状态
  useEffect(() => {
    void checkPerm();
  }, [checkPerm]);

  const sendTestNotification = useCallback(
    async (immediate: boolean) => {
      const Notifications = require('expo-notifications');
      const p = await Notifications.getPermissionsAsync();
      if (!p.granted) {
        const r = await Notifications.requestPermissionsAsync();
        if (!r.granted) {
          Alert.alert('无通知权限', '系统未授予通知权限(可能之前拒绝过)。请点「打开系统通知设置」手动打开');
          return;
        }
      }
      // 测试前确保渠道存在且 MAX, 否则通知可能不弹横幅
      await ensureReminderChannel();
      const body = `开发者调试通知 · ${new Date().toLocaleTimeString('zh-CN')}`;
      if (immediate) {
        // 关键: 必须带 channelId 走「上课提醒」渠道; trigger:null 会进系统默认渠道, 用户开了渠道权限也没用
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: '测试通知', body },
          trigger: { seconds: 1, channelId: START_CHANNEL_ID } as never,
        });
        Alert.alert('已发送(1秒后弹出)', `通知 ID: ${id}\n本次走「上课提醒」渠道。若仍未弹出, 点「打开系统通知设置」检查 通知/悬浮通知 开关`);
      } else {
        await Notifications.scheduleNotificationAsync({
          content: { title: '测试通知(5秒)', body },
          trigger: { seconds: 5, channelId: START_CHANNEL_ID } as never,
        });
        Alert.alert('已排期', '5 秒后弹出, 注意横幅与状态栏');
      }
      void checkPerm();
    },
    [checkPerm],
  );

  /** 完整日志导出: 修复日志 + 网络结果 + 通知/渠道 + 登录字段全量, 便于远程排障 */
  const exportFullLog = useCallback(async () => {
    const L: string[] = [];
    L.push(`===== 课表 App 完整诊断日志 =====`);
    L.push(`版本: v${Constants.expoConfig?.version ?? '?'}`);
    L.push(`平台: ${require('react-native').Platform.OS} ${require('react-native').Platform.Version}`);
    L.push(`时间: ${new Date().toLocaleString('zh-CN')}`);
    L.push(`班级设置: ${settingsLabel}`);
    L.push(`控件全透明模式: ${glass ? '开' : '关'}`);
    L.push('');
    L.push(`[登录修复日志]`);
    if (logs.length === 0) L.push('(未运行)');
    for (const l of logs) L.push(`${l.ok === true ? '[OK]' : l.ok === false ? '[!!]' : '[--]'} ${l.text}`);
    L.push('');
    L.push(`[网络连通性]`);
    for (const [k, v] of Object.entries(net)) L.push(`${k}: ${v}`);
    if (Object.keys(net).length === 0) L.push('(未测试)');
    L.push('');
    L.push(`[通知]`);
    L.push(`权限: ${perm}`);
    L.push(`渠道 class-remind-v2: ${channelInfo}`);
    L.push('');
    L.push(`[存储] 共 ${keys?.length ?? 0} 个键`);
    for (const k of keys ?? []) L.push(`- ${k}`);
    L.push('');
    L.push(`[登录字段缓存] ${cachedFields ? `缓存于 ${new Date(cachedFields.at).toLocaleString('zh-CN')}` : '(无)'}`);
    if (cachedFields) {
      L.push(`__VIEWSTATE (${cachedFields.vs.length}): ${cachedFields.vs || '(空)'}`);
      L.push(`__VIEWSTATEGENERATOR: ${cachedFields.g || '(空)'}`);
      L.push(`__EVENTVALIDATION (${cachedFields.ev.length}): ${cachedFields.ev || '(空)'}`);
      L.push(`Cookie (${cachedFields.cookie.length}): ${cachedFields.cookie || '(空)'}`);
      L.push(`验证码图: ${cachedFields.captchaUri.startsWith('data:image') ? `有 (${Math.round(cachedFields.captchaUri.length / 1365)}KB)` : '无'}`);
    }
    await Share.share({ message: L.join('\n') });
  }, [logs, net, perm, channelInfo, keys, settingsLabel, cachedFields, glass]);

  const clearAll = useCallback(() => {
    Alert.alert('清除全部数据', '将删除班级设置、作息、待办、账号、备份等所有本地数据, 且无法恢复。确定继续?', [
      { text: '取消', style: 'cancel' },
      {
        text: '再确认一次',
        style: 'destructive',
        onPress: () =>
          Alert.alert('最终确认', '真的要清除全部数据吗?', [
            { text: '取消', style: 'cancel' },
            {
              text: '清除',
              style: 'destructive',
              onPress: () =>
                void AsyncStorage.clear().then(() => {
                  void refreshStorage();
                  void loadCachedFields();
                  Alert.alert('完成', '全部本地数据已清除, 请退出并重新打开 App');
                }),
            },
          ]),
      },
    ]);
  }, [refreshStorage, loadCachedFields]);

  const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 6 };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <PageBackdrop />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', flex: 1 }}>开发者选项</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>v{Constants.expoConfig?.version ?? '?'}</Text>
        </View>

        {/* 登录修复 */}
        <Section title="登录修复" icon="medkit-outline" colors={colors} glass={glass} glassLine={glassLine}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
            登录失败/卡住时使用: 清除失效会话与临时数据, 重新拉取登录页并校验站点登录字段是否改版。点标题可折叠。
          </Text>
          <Btn label={repairing ? '修复中...' : '一键修复登录'} onPress={() => void repairLogin()} colors={colors} tone="primary" disabled={repairing} glass={glass} glassLine={glassLine} />
          {logs.length > 0 && (
            <View style={styles.logBox}>
              {logs.map((l, i) => (
                <Text key={i} style={{ color: l.ok === true ? '#16a34a' : l.ok === false ? '#ef4444' : colors.textSecondary, fontSize: 12, lineHeight: 19 }}>
                  {l.ok === true ? '✓ ' : l.ok === false ? '✗ ' : '· '}
                  {l.text}
                </Text>
              ))}
            </View>
          )}
        </Section>

        {/* 登录字段(缓存) */}
        <Section title="登录字段(本地缓存)" icon="key-outline" colors={colors} glass={glass} glassLine={glassLine}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
            查看站点登录表单字段, 直接读本地缓存不请求网络; 只有手动「拉取最新」或一键修复时才刷新缓存。
          </Text>
          {cachedFields ? (
            <View style={styles.logBox}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 17 }}>
                缓存时间: {new Date(cachedFields.at).toLocaleString('zh-CN')}
              </Text>
              <Text style={{ color: cachedFields.vs ? '#16a34a' : '#ef4444', fontSize: 11, lineHeight: 17 }}>
                __VIEWSTATE ({cachedFields.vs.length} 字符): {cachedFields.vs.slice(0, 60) || '(空)'}...
              </Text>
              <Text style={{ color: cachedFields.g ? '#16a34a' : '#ef4444', fontSize: 11, lineHeight: 17 }}>
                __VIEWSTATEGENERATOR: {cachedFields.g || '(空)'}
              </Text>
              <Text style={{ color: cachedFields.ev ? '#16a34a' : '#ef4444', fontSize: 11, lineHeight: 17 }}>
                __EVENTVALIDATION ({cachedFields.ev.length} 字符): {cachedFields.ev.slice(0, 60) || '(空)'}...
              </Text>
              <Text style={{ color: cachedFields.cookie ? '#16a34a' : '#ef4444', fontSize: 11, lineHeight: 17 }}>
                Cookie ({cachedFields.cookie.length} 字符): {cachedFields.cookie || '(空)'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 17 }}>
                验证码图: {cachedFields.captchaUri.startsWith('data:image') ? '有' : '无'}
              </Text>
              {cachedFields.captchaUri.startsWith('data:image') && (
                <Image source={{ uri: cachedFields.captchaUri }} style={styles.captchaPreview} resizeMode="contain" />
              )}
            </View>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>暂无缓存, 点下方按钮拉取一次</Text>
          )}
          <View style={{ gap: 8 }}>
            <Btn label={fetchingFields ? '拉取中...' : '拉取最新并缓存'} onPress={() => void fetchAndCacheFields()} colors={colors} disabled={fetchingFields} glass={glass} glassLine={glassLine} />
            <Btn label="清除字段缓存" onPress={() => void AsyncStorage.removeItem(LOGIN_FIELDS_KEY).then(() => void loadCachedFields())} colors={colors} tone="danger" glass={glass} glassLine={glassLine} />
          </View>
        </Section>

        {/* 网络连通 */}
        <Section title="网络连通性" icon="globe-outline" colors={colors} glass={glass} glassLine={glassLine}>
          <Btn label="测试全部端点" onPress={() => void testAllNet()} colors={colors} glass={glass} glassLine={glassLine} />
          <View style={{ marginTop: 6 }}>
            {Object.entries(net).map(([k, v]) => (
              <View key={k} style={rowStyle}>
                <Text style={{ color: colors.text, fontSize: 13 }}>{k}</Text>
                <Text style={{ color: v.startsWith('2') ? '#16a34a' : v === '测试中...' ? colors.textSecondary : '#ef4444', fontSize: 12 }}>{v}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* 通知调试 */}
        <Section title="通知调试" icon="notifications-outline" colors={colors} glass={glass} glassLine={glassLine}>
          <View style={rowStyle}>
            <Text style={{ color: colors.text, fontSize: 13 }}>权限状态</Text>
            <Pressable onPress={() => void checkPerm()} hitSlop={6}>
              <Text style={{ color: '#2563eb', fontSize: 12 }}>{perm === '未查询' ? '点此查询' : perm}</Text>
            </Pressable>
          </View>
          <View style={rowStyle}>
            <Text style={{ color: colors.text, fontSize: 13 }}>提醒渠道</Text>
            <Pressable onPress={() => void checkPerm()} hitSlop={6}>
              <Text style={{ color: channelInfo.includes('✓') ? '#16a34a' : channelInfo === '未查询' ? '#2563eb' : '#f59e0b', fontSize: 12 }}>
                {channelInfo === '未查询' ? '点此查询' : channelInfo}
              </Text>
            </Pressable>
          </View>
          <View style={{ gap: 8 }}>
            <Btn
              label="检测并自动修复渠道"
              onPress={() =>
                void fixChannel().then((st) =>
                  Alert.alert(
                    '渠道修复结果',
                    st === 'ok'
                      ? '渠道已存在且重要级为 MAX, 无需修复'
                      : st === 'created'
                        ? '渠道之前不存在, 已自动创建(MAX)'
                        : st === 'recreated'
                          ? '原渠道重要级不足, 已删除并重建(MAX) ← 这就是之前不弹横幅的原因'
                          : '通知模块不可用(Expo Go 环境?)',
                  ),
                )
              }
              colors={colors}
              tone="primary"
              glass={glass}
              glassLine={glassLine}
            />
            <Btn label="发一条测试通知(1秒后)" onPress={() => void sendTestNotification(true)} colors={colors} glass={glass} glassLine={glassLine} />
            <Btn label="5 秒后发一条测试通知" onPress={() => void sendTestNotification(false)} colors={colors} glass={glass} glassLine={glassLine} />
            <Btn label="打开系统通知设置(重点检查!)" onPress={() => Linking.openSettings()} colors={colors} tone="primary" glass={glass} glassLine={glassLine} />
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 8 }}>
            小米/华为等系统: App 授权了也必须在系统设置里单独开「通知」和「悬浮通知」权限, 否则横幅不弹。
          </Text>
        </Section>

        {/* 存储概览 */}
        <Section title="存储概览" icon="server-outline" colors={colors} glass={glass} glassLine={glassLine}>
          <View style={rowStyle}>
            <Text style={{ color: colors.text, fontSize: 13 }}>本地存储键</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{keys?.length ?? 0} 个 · 约 {totalSize} 字符(键名)</Text>
          </View>
          <View style={rowStyle}>
            <Text style={{ color: colors.text, fontSize: 13 }}>班级设置</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{settingsLabel}</Text>
          </View>
          <Btn label={showKeys ? '收起键列表' : '查看全部键'} onPress={() => setShowKeys((s) => !s)} colors={colors} glass={glass} glassLine={glassLine} />
          {showKeys && keys && (
            <View style={styles.logBox}>
              {keys.map((k) => (
                <Text key={k} style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 17 }}>
                  {k}
                </Text>
              ))}
            </View>
          )}
        </Section>

        {/* 诊断信息 */}
        <Section title="诊断信息" icon="information-circle-outline" colors={colors} glass={glass} glassLine={glassLine}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
            导出完整日志(含修复日志/网络结果/通知渠道/登录字段全量值), 发给我即可远程排障。
          </Text>
          <Btn label="导出完整日志" onPress={() => void exportFullLog()} colors={colors} tone="primary" glass={glass} glassLine={glassLine} />
        </Section>

        {/* 危险操作 */}
        <Section title="危险操作" icon="warning-outline" color="#ef4444" colors={colors} glass={glass} glassLine={glassLine} danger>
          <View style={{ gap: 8 }}>
            <Btn
              label="清除会话与临时数据(温和)"
              onPress={() =>
                void clearSession().then(() => {
                  setTempOverride(null);
                  Alert.alert('完成', '会话与临时数据已清除');
                })
              }
              colors={colors}
              tone="danger"
              glass={glass}
              glassLine={glassLine}
            />
            <Btn label="清除全部本地数据(不可恢复)" onPress={clearAll} colors={colors} tone="danger" glass={glass} glassLine={glassLine} />
          </View>
        </Section>

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: Spacing.two }}>
          开发者页面仅用于调试与修复, 正常使用无需进入
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 14, gap: 12, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  card: { borderRadius: 14, padding: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  btn: { borderRadius: 10, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, flexDirection: 'row' },
  logBox: { marginTop: 8, backgroundColor: 'rgba(100,116,139,0.10)', borderRadius: 10, padding: 10, gap: 2 },
  captchaPreview: { width: 120, height: 44, marginTop: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.9)' },
});
