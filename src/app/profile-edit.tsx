/** 个人资料编辑: 头像 / 昵称 / QQ, 仅本机保存(随备份导出), 学号班级只读 */
import { useEffect, useState, type ElementType } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { useBgSetting, usePageBackground } from '@/lib/background';
import { NightCard, NightGlowBackground } from '@/components/night-kit';
import { DEFAULT_PROFILE, clearAvatar, loadProfile, pickAvatar, saveProfile, type UserProfile } from '@/lib/profile';
import { loadAccount } from '@/lib/account';
import { loadSettings } from '@/lib/settings';
import { loadSessionName } from '@/lib/portal';

export default function ProfileEditScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = useTheme();
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  // 控件全透明模式: 与「我的」页一致, 卡片只留 1px 描边
  const glass = !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const CardWrap: ElementType = night ? NightCard : View;
  const cardStyle = (base: ViewStyle | ViewStyle[]): StyleProp<ViewStyle> =>
    night ? base : [base, glass && { borderWidth: 1, borderColor: glassLine }, { backgroundColor: glass ? 'transparent' : colors.backgroundElement }];

  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [nickname, setNickname] = useState('');
  const [qq, setQq] = useState('');
  const [portalName, setPortalName] = useState<string | null>(null);
  const [studentNo, setStudentNo] = useState('');
  const [classLabel, setClassLabel] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const p = await loadProfile();
      setProfile(p);
      setNickname(p.nickname);
      setQq(p.qq);
      const [acc, settings, name] = await Promise.all([loadAccount(), loadSettings(), loadSessionName()]);
      setStudentNo(acc?.username ?? '');
      setClassLabel(settings?.bjLabel ?? null);
      setPortalName(name);
    })();
  }, []);

  const doPick = async () => {
    const uri = await pickAvatar();
    if (uri) setProfile(await loadProfile());
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

        {/* 学号 / 班级(只读, 来自主站账号) */}
        <CardWrap style={cardStyle(styles.card)}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>学号</Text>
            <Text style={{ color: colors.text, fontSize: 14 }}>{studentNo || '未设置'}</Text>
          </View>
          <View style={[styles.infoRow, styles.infoSep, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>班级</Text>
            <Text style={{ color: colors.text, fontSize: 14 }}>{classLabel ?? '未设置'}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            来自主站账号，去 账号与数据 → 主站账号 修改
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
          <Text style={[styles.saveText, glass && { color: colors.primary }]}>保存</Text>
        </Pressable>

        <Text style={[styles.note, { color: colors.textSecondary }]}>
          头像、昵称、QQ 只保存在本机，会随备份一起导出。
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
  hint: { fontSize: 11.5, lineHeight: 17, alignSelf: 'flex-start', marginTop: 8 },
  saveBtn: { borderRadius: 12, alignItems: 'center', paddingVertical: 14, marginTop: Spacing.four },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  note: { fontSize: 11.5, lineHeight: 17, marginTop: Spacing.three, textAlign: 'center' },
});
