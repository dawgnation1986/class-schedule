/** 个人资料编辑: 头像 / 昵称 / QQ, 本机保存并随备份导出; 登录云账户后昵称与 QQ 同步到云端 */
import { useEffect, useState, type ElementType } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { GlassSurface, GLASS_LINE } from '@/components/glass-surface';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { useBgSetting, usePageBackground } from '@/lib/background';
import { NightCard, NightGlowBackground } from '@/components/night-kit';
import { DEFAULT_PROFILE, clearAvatar, loadProfile, pickAvatar, saveProfile, type UserProfile } from '@/lib/profile';
import { cloudUpdateProfile, getCloudSession, type CloudUser } from '@/lib/cloud';
import { loadAccount } from '@/lib/account';
import { loadSettings } from '@/lib/settings';
import { loadSessionName } from '@/lib/portal';
import { setPendingProfileSection } from '@/lib/nav-intent';

export default function ProfileEditScreen() {
  const router = useRouter();
  const colors = useTheme();
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  // 控件全透明模式: 与「我的」页一致, 卡片只留 1px 描边
  const glass = !!bgSetting.ctrl;
  const glassLine = GLASS_LINE;
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const CardWrap: ElementType = night ? NightCard : View;
  const cardStyle = (base: ViewStyle | ViewStyle[]): StyleProp<ViewStyle> =>
    night ? base : [base, glass && { borderWidth: 1, borderColor: glassLine }, { backgroundColor: glass ? 'transparent' : colors.backgroundElement }];

  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [nickname, setNickname] = useState('');
  const [qq, setQq] = useState('');
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [portalName, setPortalName] = useState<string | null>(null);
  const [studentNo, setStudentNo] = useState('');
  const [classLabel, setClassLabel] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const p = await loadProfile();
      const session = await getCloudSession();
      const cu = session?.user ?? null;
      setProfile(p);
      setCloudUser(cu);
      // 本机为空时用云账户资料兜底, 已手动设置过则保持本机值
      setNickname(p.nicknameManual ? p.nickname : p.nickname || cu?.nickname || '');
      setQq(p.qq || cu?.qq || '');
      const [acc, settings, name] = await Promise.all([loadAccount(), loadSettings(), loadSessionName()]);
      setStudentNo(acc?.username ?? '');
      setClassLabel(settings?.bjLabel ?? null);
      setPortalName(name);
    })();
  }, []);

  const doPick = async () => {
    try {
      const uri = await pickAvatar();
      if (uri) setProfile(await loadProfile());
    } catch (e) {
      // 相册权限被拒绝: 引导去系统设置开启
      Alert.alert('无法选择头像', e instanceof Error ? e.message : '请检查相册权限', [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => void Linking.openSettings() },
      ]);
    }
  };

  const doClear = async () => {
    await clearAvatar();
    setProfile(await loadProfile());
  };

  const doSave = async () => {
    const nick = nickname.trim();
    const q = qq.trim();
    if (nick) await saveProfile({ nickname: nick, nicknameManual: true, qq: q });
    // 昵称为空 → 回退到主站姓名
    else await saveProfile({ nickname: '', nicknameManual: false, qq: q });
    if (cloudUser) {
      try {
        const u = await cloudUpdateProfile({ nickname: nick, qq: q });
        setCloudUser(u);
      } catch (e) {
        Alert.alert('已保存到本机', `同步云账户失败：${e instanceof Error ? e.message : '网络异常'}`);
        router.back();
        return;
      }
    }
    router.back();
  };

  const actionBtn = (label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.avatarBtn,
        glass ? { borderWidth: 1, borderColor: glassLine } : { backgroundColor: colors.backgroundSelected },
      ]}>
      <Text style={{ color: colors.text, fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );

  const inputStyle = [
    styles.input,
    glass
      ? { borderWidth: 1, borderColor: glassLine, backgroundColor: 'transparent' }
      : { borderWidth: 1, borderColor: colors.backgroundElement, backgroundColor: colors.backgroundElement },
    { color: colors.text },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>个人资料</Text>
          <View style={styles.backBtn} />
        </View>

        {/* 头像 */}
        <CardWrap style={cardStyle(styles.card)}>
          <GlassSurface radius={16} />
          <View
            style={[
              styles.avatarWrap,
              glass ? { borderWidth: 1, borderColor: glassLine } : { backgroundColor: colors.backgroundElement },
            ]}>
            {profile.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person" size={44} color={colors.textSecondary} />
            )}
          </View>
          <View style={styles.avatarBtnRow}>
            {actionBtn(profile.avatar ? '更换头像' : '选择头像', () => void doPick())}
            {actionBtn('恢复默认', () => void doClear())}
          </View>
        </CardWrap>

        {/* 昵称与 QQ */}
        <CardWrap style={cardStyle(styles.card)}>
          <GlassSurface radius={16} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>昵称与 QQ</Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>昵称</Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            maxLength={12}
            placeholder={portalName ? `留空则使用主站姓名：${portalName}` : '输入昵称（最多 12 字）'}
            placeholderTextColor={colors.textSecondary}
            style={inputStyle}
          />
          <Text style={[styles.label, { color: colors.textSecondary }]}>QQ 号</Text>
          <TextInput
            value={qq}
            onChangeText={(t) => setQq(t.replace(/\D/g, '').slice(0, 12))}
            maxLength={12}
            keyboardType="number-pad"
            placeholder="选填，用于展示联系方式"
            placeholderTextColor={colors.textSecondary}
            style={inputStyle}
          />
        </CardWrap>

        {/* 云账户联动 */}
        <CardWrap style={cardStyle(styles.card)}>
          <GlassSurface radius={16} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>云账户</Text>
          {cloudUser ? (
            <>
              <View style={[styles.cloudRow, glass && { borderTopColor: glassLine }]}>
                <View
                  style={[
                    styles.cloudAvatar,
                    glass ? { borderWidth: 1, borderColor: glassLine } : { backgroundColor: colors.backgroundElement },
                  ]}>
                  {profile.avatar ? (
                    <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
                  ) : (
                    <Ionicons name="cloud" size={20} color={colors.textSecondary} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                    {cloudUser.nickname || cloudUser.username}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
                    账号 {cloudUser.username}
                    {cloudUser.email ? ` · ${cloudUser.email}` : ''}
                  </Text>
                </View>
                <View style={styles.cloudBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
                  <Text style={{ color: '#16a34a', fontSize: 11, fontWeight: '700' }}>已连接</Text>
                </View>
              </View>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                保存时昵称与 QQ 会同步到云账户，换设备登录后仍然保留。
              </Text>
            </>
          ) : (
            <>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>状态</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>未连接</Text>
              </View>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                登录云账户后，昵称与 QQ 会同步到云端，个人资料与云端备份账号联动。
              </Text>
              <Pressable
                onPress={() => router.push('/cloud-backup' as never)}
                style={[
                  styles.cloudLoginBtn,
                  glass ? { borderWidth: 1, borderColor: glassLine } : { backgroundColor: colors.primary },
                ]}>
                <Ionicons name="cloud-upload-outline" size={15} color={glass ? colors.text : '#fff'} />
                <Text style={{ color: glass ? colors.text : '#fff', fontSize: 13, fontWeight: '700' }}>去登录云账户</Text>
              </Pressable>
            </>
          )}
        </CardWrap>

        {/* 学号 / 班级(来自主站账号, 点击学号可去设置) */}
        <CardWrap style={cardStyle(styles.card)}>
          <GlassSurface radius={16} />
          <Pressable
            onPress={() => {
              setPendingProfileSection('account');
              router.back();
            }}
            style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>学号</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{studentNo || '未设置'}</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.textSecondary} />
            </View>
          </Pressable>
          <View style={[styles.infoRow, styles.infoSep, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>班级</Text>
            <Text style={{ color: colors.text, fontSize: 14 }}>{classLabel ?? '未设置'}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            点击学号可去设置主站账号、密码与默认起始页
          </Text>
        </CardWrap>

        <Pressable
          onPress={() => void doSave()}
          style={[
            styles.saveBtn,
            glass
              ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(37,99,235,0.6)' }
              : { backgroundColor: colors.primary },
          ]}>
          <GlassSurface radius={12} />
          <Text style={[styles.saveText, glass && { color: colors.primary }]}>保存</Text>
        </Pressable>

        <Text style={[styles.note, { color: colors.textSecondary }]}>
          头像保存在本机并随备份一起导出；昵称与 QQ 会同步到已登录的云账户。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  backBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800' },
  card: { borderRadius: 16, padding: Spacing.three, marginTop: Spacing.three, gap: 6, alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', alignSelf: 'flex-start' },
  avatarWrap: { width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarBtnRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignSelf: 'stretch' },
  avatarBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  label: { fontSize: 13, marginTop: Spacing.two, alignSelf: 'flex-start' },
  input: { alignSelf: 'stretch', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingVertical: 3 },
  infoSep: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 9 },
  infoLabel: { fontSize: 13 },
  cloudRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginTop: 8 },
  cloudAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cloudBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cloudLoginBtn: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 11, marginTop: 10 },
  hint: { fontSize: 11.5, lineHeight: 17, alignSelf: 'flex-start', marginTop: 8 },
  saveBtn: { borderRadius: 12, alignItems: 'center', paddingVertical: 14, marginTop: Spacing.four },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { fontSize: 11.5, lineHeight: 17, marginTop: Spacing.three, textAlign: 'center' },
});
