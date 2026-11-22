/** 云端备份与恢复: 注册/登录官网账号, 一键备份到云端、一键恢复到本机 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePageBackground } from '@/lib/background';
import { exportBackup, importBackup } from '@/lib/backup';
import {
  cloudDelete,
  cloudDownload,
  cloudList,
  cloudLogin,
  cloudLogout,
  cloudRegister,
  cloudRename,
  cloudUpload,
  fetchCloudConfig,
  formatSize,
  getCloudSession,
  type BackupPayload,
  type CloudBackupMeta,
  type CloudConfig,
  type CloudSession,
} from '@/lib/cloud';
import { getSiteUrl } from '@/lib/site';

type Mode = 'login' | 'register';

export default function CloudBackupScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  const router = useRouter();

  const [session, setSession] = useState<CloudSession | null>(null);
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [backups, setBackups] = useState<CloudBackupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState('');

  const [mode, setMode] = useState<Mode>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [qq, setQq] = useState('');

  const [selected, setSelected] = useState<string[]>([]);
  const [backupName, setBackupName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const sections = config?.sections ?? [];
  const allSelected = sections.length > 0 && selected.length === sections.length;

  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSite(await getSiteUrl());
      const cfg = await fetchCloudConfig();
      setConfig(cfg);
      setSelected(cfg.sections.map((s) => s.key));
      const s = await getCloudSession();
      setSession(s);
      if (s) {
        const r = await cloudList();
        setSession((prev) => (prev ? { ...prev, user: r.user } : prev));
        setBackups(r.backups);
      } else {
        setBackups([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接官网');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  const doAuth = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const s =
        mode === 'login'
          ? await cloudLogin(account.trim(), password)
          : await cloudRegister({
              username: username.trim(),
              password,
              email: email.trim() || undefined,
              qq: qq.trim() || undefined,
            });
      setSession(s);
      setPassword('');
      const r = await cloudList();
      setSession((prev) => (prev ? { ...prev, user: r.user } : prev));
      setBackups(r.backups);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }, [busy, mode, account, password, username, email, qq]);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const r = await cloudList();
      setSession((prev) => (prev ? { ...prev, user: r.user } : prev));
      setBackups(r.backups);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '刷新失败');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const doBackup = useCallback(async () => {
    if (busy || !config) return;
    if (!selected.length) {
      Alert.alert('还没有选择备份内容', '请至少勾选一项要备份的配置');
      return;
    }
    setBusy(true);
    try {
      const text = await exportBackup(selected);
      const data = JSON.parse(text) as BackupPayload;
      const name = backupName.trim() || `备份 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
      const list = await cloudUpload(name, data);
      setBackups(list);
      setBackupName('');
      const s = await getCloudSession();
      if (s) setSession(s);
      Alert.alert('备份成功', `已上传「${name}」，共 ${selected.length} 项配置`);
    } catch (e) {
      Alert.alert('备份失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setBusy(false);
    }
  }, [busy, config, selected, backupName]);

  const doRestore = useCallback((b: CloudBackupMeta) => {
    Alert.alert(
      '恢复备份',
      `将用「${b.name}」（${new Date(b.at).toLocaleString('zh-CN')}）覆盖本机对应设置，其他设置保持不变。确定继续吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '恢复',
          onPress: () => {
            setBusy(true);
            void cloudDownload(b.id)
              .then((data) => importBackup(JSON.stringify(data)))
              .then((r) => {
                if (r.ok) {
                  Alert.alert('恢复完成', `已恢复 ${r.imported ?? 0} 项配置，请退出并重新打开 App 使设置全部生效。`);
                } else {
                  Alert.alert('恢复失败', r.error ?? '备份内容无法解析');
                }
              })
              .catch((e) => Alert.alert('恢复失败', e instanceof Error ? e.message : '未知错误'))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }, []);

  const doDelete = useCallback((b: CloudBackupMeta) => {
    Alert.alert('删除备份', `确定删除「${b.name}」吗？删除后无法恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void cloudDelete(b.id)
            .then((list) => setBackups(list))
            .catch((e) => Alert.alert('删除失败', e instanceof Error ? e.message : '未知错误'))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }, []);

  const doRename = useCallback(async () => {
    if (!renameId || !renameText.trim()) return;
    setBusy(true);
    try {
      const list = await cloudRename(renameId, renameText.trim());
      setBackups(list);
      setRenameId(null);
      setRenameText('');
    } catch (e) {
      Alert.alert('重命名失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setBusy(false);
    }
  }, [renameId, renameText]);

  const doLogout = useCallback(() => {
    Alert.alert('退出登录', '退出后本机不再保存登录状态，云端备份不会被删除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: () => {
          void cloudLogout().then(() => {
            setSession(null);
            setBackups([]);
            setExpanded(null);
          });
        },
      },
    ]);
  }, []);

  const usedPercent = useMemo(() => {
    if (!session?.user.quota) return 0;
    return Math.min(100, Math.round((backups.length / session.user.quota) * 100));
  }, [session, backups.length]);

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: 'rgba(100,116,139,0.3)' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
          <Text style={[styles.title, { color: colors.text }]}>云端备份</Text>
        </Pressable>
        {session && (
          <Pressable onPress={() => void refresh()} hitSlop={8} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={colors.text} />
            )}
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 13 }}>正在连接官网…</Text>
          </View>
        ) : (
          <>
            {!!error && (
              <View style={[styles.errBox, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                <Ionicons name="alert-circle" size={16} color="#ef4444" />
                <Text style={{ color: '#ef4444', fontSize: 12.5, flex: 1, lineHeight: 18 }}>{error}</Text>
                <Pressable onPress={() => void init()}>
                  <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>重试</Text>
                </Pressable>
              </View>
            )}

            {!session ? (
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="cloud-outline" size={18} color={colors.primary} />
                  <Text style={[styles.cardTitle, { color: colors.text }]}>登录后使用云端备份</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 19, marginTop: 6 }}>
                  App 不强制登录，其他功能不受影响。云端备份需要先用官网账号登录；没有账号可在下方注册。
                  {'\n'}官网：{site}
                </Text>

                <View style={[styles.tabRow, { backgroundColor: colors.background }]}>
                  {(
                    [
                      ['login', '登录'],
                      ['register', '注册'],
                    ] as [Mode, string][]
                  ).map(([m, label]) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setMode(m);
                        setError(null);
                      }}
                      style={[
                        styles.tab,
                        { backgroundColor: mode === m ? colors.primary : 'transparent' },
                      ]}>
                      <Text style={{ color: mode === m ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {mode === 'login' ? (
                  <>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>用户名 / 邮箱</Text>
                    <TextInput
                      value={account}
                      onChangeText={setAccount}
                      placeholder="用户名或邮箱"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="none"
                      style={inputStyle}
                    />
                  </>
                ) : (
                  <>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>用户名</Text>
                    <TextInput
                      value={username}
                      onChangeText={setUsername}
                      placeholder="3-20 位，字母/数字/中文"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="none"
                      style={inputStyle}
                    />
                    <Text style={[styles.label, { color: colors.textSecondary }]}>邮箱（可选）</Text>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="用于找回账号，可不填"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      style={inputStyle}
                    />
                    <Text style={[styles.label, { color: colors.textSecondary }]}>QQ（可选）</Text>
                    <TextInput
                      value={qq}
                      onChangeText={setQq}
                      placeholder="方便管理员联系，可不填"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="number-pad"
                      style={inputStyle}
                    />
                  </>
                )}

                <Text style={[styles.label, { color: colors.textSecondary }]}>密码</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry
                  style={inputStyle}
                />

                <Pressable
                  disabled={busy}
                  onPress={() => void doAuth()}
                  style={[
                    styles.primaryBtn,
                    {
                      backgroundColor:
                        mode === 'login' ? (account.trim() && password ? colors.primary : colors.background) : username.trim() && password ? colors.primary : colors.background,
                      opacity: busy ? 0.6 : 1,
                    },
                  ]}>
                  {busy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text
                      style={{
                        color:
                          (mode === 'login' ? account.trim() && password : username.trim() && password) ? '#fff' : colors.textSecondary,
                        fontWeight: '700',
                      }}>
                      {mode === 'login' ? '登录' : '注册并登录'}
                    </Text>
                  )}
                </Pressable>
                {mode === 'register' && !config?.allow_register && (
                  <Text style={{ color: '#f59e0b', fontSize: 12, marginTop: 8 }}>官网当前未开放注册，请联系管理员。</Text>
                )}
              </View>
            ) : (
              <>
                {/* 账号信息 */}
                <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                  <View style={styles.cardTitleRow}>
                    <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {session.user.username}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
                        {session.user.email || '未绑定邮箱'}
                        {session.user.qq ? ` · QQ ${session.user.qq}` : ''}
                      </Text>
                    </View>
                    <Pressable onPress={doLogout} style={styles.logoutBtn}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>退出</Text>
                    </Pressable>
                  </View>
                  <View style={styles.quotaRow}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      备份 {backups.length} / {session.user.quota}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      共 {formatSize(backups.reduce((n, b) => n + b.size, 0))} · 单包上限 {config?.max_size_mb ?? 8}MB
                    </Text>
                  </View>
                  <View style={[styles.quotaBar, { backgroundColor: colors.background }]}>
                    <View
                      style={{
                        width: `${usedPercent}%`,
                        height: '100%',
                        borderRadius: 4,
                        backgroundColor: usedPercent >= 100 ? '#ef4444' : colors.primary,
                      }}
                    />
                  </View>
                </View>

                {/* 备份内容 */}
                <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                  <View style={styles.cardTitleRow}>
                    <Ionicons name="options-outline" size={18} color={colors.primary} />
                    <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]}>备份内容</Text>
                    <Pressable
                      onPress={() => setSelected(allSelected ? [] : sections.map((s) => s.key))}
                      hitSlop={6}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                        {allSelected ? '全不选' : '全选'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 4 }}>
                    官网允许备份的选项如下，可从中勾选本次要上传的内容
                  </Text>
                  <View style={styles.chipWrap}>
                    {sections.map((s) => {
                      const on = selected.includes(s.key);
                      return (
                        <Pressable
                          key={s.key}
                          onPress={() =>
                            setSelected((prev) => (prev.includes(s.key) ? prev.filter((k) => k !== s.key) : [...prev, s.key]))
                          }
                          style={[
                            styles.chip,
                            {
                              backgroundColor: on ? colors.primary : colors.background,
                              borderColor: on ? colors.primary : 'rgba(100,116,139,0.3)',
                            },
                          ]}>
                          <Text style={{ color: on ? '#fff' : colors.textSecondary, fontSize: 12 }}>{s.label}</Text>
                        </Pressable>
                      );
                    })}
                    {!sections.length && (
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>官网暂未配置可备份的选项</Text>
                    )}
                  </View>
                  <TextInput
                    value={backupName}
                    onChangeText={setBackupName}
                    placeholder="备份名称（可选，如：换机前备份）"
                    placeholderTextColor={colors.textSecondary}
                    maxLength={40}
                    style={[inputStyle, { marginTop: 10 }]}
                  />
                  <Pressable
                    disabled={busy}
                    onPress={() => void doBackup()}
                    style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
                    {busy ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={17} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700' }}>一键备份</Text>
                      </>
                    )}
                  </Pressable>
                </View>

                {/* 备份列表 */}
                <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                  <View style={styles.cardTitleRow}>
                    <Ionicons name="archive-outline" size={18} color={colors.primary} />
                    <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]}>我的备份（{backups.length}）</Text>
                  </View>
                  {!backups.length && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 8 }}>
                      还没有云端备份，勾选内容后点「一键备份」上传第一份。
                    </Text>
                  )}
                  {backups.map((b) => {
                    const open = expanded === b.id;
                    return (
                      <View key={b.id} style={[styles.backupItem, { borderTopColor: 'rgba(100,116,139,0.18)' }]}>
                        <Pressable onPress={() => setExpanded(open ? null : b.id)} style={styles.backupHead}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }} numberOfLines={1}>
                              {b.name}
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 3 }}>
                              {new Date(b.at.replace(' ', 'T')).toLocaleString('zh-CN')} · {formatSize(b.size)}
                              {b.appVersion ? ` · v${b.appVersion}` : ''}
                            </Text>
                          </View>
                          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
                        </Pressable>
                        <View style={styles.chipWrap}>
                          {(open ? b.sections : b.sections.slice(0, 6)).map((label) => (
                            <Text
                              key={label}
                              style={[styles.miniChip, { backgroundColor: colors.background, color: colors.textSecondary }]}>
                              {label}
                            </Text>
                          ))}
                          {!open && b.sections.length > 6 && (
                            <Text style={[styles.miniChip, { backgroundColor: colors.background, color: colors.textSecondary }]}>
                              +{b.sections.length - 6}（展开查看全部）
                            </Text>
                          )}
                        </View>
                        {open && (
                          <View style={styles.backupActions}>
                            <Pressable
                              disabled={busy}
                              onPress={() => doRestore(b)}
                              style={[styles.smallBtn, { backgroundColor: colors.primary }]}>
                              <Ionicons name="download-outline" size={14} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>一键恢复</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                setRenameId(b.id);
                                setRenameText(b.name);
                              }}
                              style={[styles.smallBtn, { backgroundColor: colors.background }]}>
                              <Text style={{ color: colors.text, fontSize: 12 }}>重命名</Text>
                            </Pressable>
                            <Pressable
                              disabled={busy}
                              onPress={() => doDelete(b)}
                              style={[styles.smallBtn, { backgroundColor: colors.background }]}>
                              <Text style={{ color: '#ef4444', fontSize: 12 }}>删除</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                <Text style={{ color: colors.textSecondary, fontSize: 11.5, lineHeight: 17, paddingHorizontal: 4 }}>
                  备份以明文 JSON 存在官网私有目录，只能通过账号鉴权接口访问。恢复只覆盖备份中包含的设置项，不会清空其他配置。
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!renameId} transparent animationType="fade" onRequestClose={() => setRenameId(null)}>
        <Pressable style={styles.modalMask} onPress={() => setRenameId(null)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>重命名备份</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              maxLength={40}
              autoFocus
              style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: 'rgba(100,116,139,0.3)' }]}
            />
            <View style={styles.modalBtnRow}>
              <Pressable onPress={() => setRenameId(null)} style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
                <Text style={{ color: colors.text }}>取消</Text>
              </Pressable>
              <Pressable
                disabled={!renameText.trim() || busy}
                onPress={() => void doRename()}
                style={[styles.modalBtn, { backgroundColor: renameText.trim() ? colors.primary : colors.backgroundElement }]}>
                <Text style={{ color: renameText.trim() ? '#fff' : colors.textSecondary, fontWeight: '700' }}>保存</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '800' },
  content: { padding: Spacing.three, paddingBottom: 40, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', gap: 12 },
  center: { paddingVertical: 60, alignItems: 'center' },
  card: { borderRadius: 14, padding: 14, gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  errBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10 },
  tabRow: { flexDirection: 'row', borderRadius: 10, padding: 3, marginTop: 12 },
  tab: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  label: { fontSize: 12, marginTop: 10, marginBottom: 5 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  primaryBtn: {
    marginTop: 12,
    borderRadius: 12,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  logoutBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(100,116,139,0.4)' },
  quotaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  quotaBar: { height: 6, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  miniChip: { fontSize: 10.5, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  backupItem: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 10 },
  backupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backupActions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.three },
  modalBox: { borderRadius: 14, padding: Spacing.two },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.two, marginTop: 12, justifyContent: 'flex-end' },
  modalBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
});
