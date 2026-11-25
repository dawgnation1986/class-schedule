/** 关于本项目: GitHub 主页 / 仓库地址 / 项目信息, 独立页面 */
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';

import { GlassSurface, GLASS_LINE } from '@/components/glass-surface';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { usePageBackground, useBgSetting } from '@/lib/background';
import { NightCard, NightGlowBackground } from '@/components/night-kit';
import { REPO_HOME } from '@/components/about-github';

const AUTHOR_HOME = 'https://github.com/dawgnation1986';

const LINKS = [
  { title: '项目仓库', sub: 'dawgnation1986/class-schedule', icon: 'logo-github' as const, url: REPO_HOME },
  { title: '开发者 GitHub 主页', sub: '@dawgnation1986', icon: 'person-circle-outline' as const, url: AUTHOR_HOME },
  { title: '问题反馈与建议', sub: '提交 Issue', icon: 'chatbubble-ellipses-outline' as const, url: `${REPO_HOME}/issues` },
];

const FEATURES = [
  '实时课表 / 原始课表查询，支持翻周、翻日与整周横屏',
  '上课前提醒、每日早报、桌面小组件',
  '学业成绩面板：学分加权 GPA、目标绩点反推',
  '课表截图 OCR 导入，自动还原网格',
  '个人资料卡片、主题配色与透明控件',
];

export default function AboutProjectScreen() {
  const router = useRouter();
  const colors = useTheme();
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.ctrl;
  const glassLine = GLASS_LINE;
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const CardWrap = night ? NightCard : View;
  const cardStyle = (base: object) => [base, night ? undefined : glass ? { borderWidth: 1, borderColor: glassLine, backgroundColor: 'transparent' } : undefined];

  const open = (url: string) => void Linking.openURL(url);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>关于本项目</Text>
          <View style={styles.backBtn} />
        </View>

        {/* 项目标识 */}
        <CardWrap style={cardStyle(styles.hero)}>
          <GlassSurface radius={16} />
          <View style={[styles.heroIcon, glass ? { borderWidth: 1, borderColor: glassLine } : { backgroundColor: colors.backgroundElement }]}>
            <Ionicons name="logo-github" size={40} color={colors.text} />
          </View>
          <Text style={[styles.heroName, { color: colors.text }]}>学生综合管理平台</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>Class Schedule · v{version}</Text>
          <Text style={[styles.heroDesc, { color: colors.textSecondary }]}>
            非官方校园课表工具，课表、提醒与学业数据只保存在本机。
          </Text>
        </CardWrap>

        {/* 链接 */}
        <CardWrap style={cardStyle(styles.card)}>
          <GlassSurface radius={16} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>项目链接</Text>
          {LINKS.map((l, i) => (
            <Pressable
              key={l.title}
              onPress={() => open(l.url)}
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.rowSep,
                i > 0 && { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' },
                pressed && { opacity: 0.6 },
              ]}>
              <View style={[styles.rowIcon, glass ? { borderWidth: 1, borderColor: glassLine } : { backgroundColor: colors.backgroundSelected }]}>
                <Ionicons name={l.icon} size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>{l.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 2 }}>{l.sub}</Text>
              </View>
              <Ionicons name="open-outline" size={15} color={colors.textSecondary} />
            </Pressable>
          ))}
        </CardWrap>

        {/* 项目信息 */}
        <CardWrap style={cardStyle(styles.card)}>
          <GlassSurface radius={16} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>项目信息</Text>
          <View style={styles.infoRow}>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>技术栈</Text>
            <Text style={{ color: colors.text, fontSize: 13 }}>Expo · React Native · TypeScript</Text>
          </View>
          <View style={[styles.infoRow, styles.infoSep, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>开源协议</Text>
            <Text style={{ color: colors.text, fontSize: 13 }}>MIT License</Text>
          </View>
          <View style={[styles.infoRow, styles.infoSep, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.18)' }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>当前版本</Text>
            <Text style={{ color: colors.text, fontSize: 13 }}>v{version}</Text>
          </View>
        </CardWrap>

        {/* 主要功能 */}
        <CardWrap style={cardStyle(styles.card)}>
          <GlassSurface radius={16} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>主要功能</Text>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark-circle-outline" size={15} color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 19, flex: 1 }}>{f}</Text>
            </View>
          ))}
        </CardWrap>

        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {'本项目为个人开发的学习工具，与学校官方无关。\n如涉及数据或版权问题，请通过 Issue 联系。'}
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
  hero: { borderRadius: 16, padding: Spacing.four, alignItems: 'center', gap: 4 },
  heroIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  heroName: { fontSize: 17, fontWeight: '800' },
  heroDesc: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  card: { borderRadius: 16, padding: Spacing.three, marginTop: Spacing.three },
  cardTitle: { fontSize: 14.5, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  infoSep: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 9 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 },
  note: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: Spacing.three },
});
