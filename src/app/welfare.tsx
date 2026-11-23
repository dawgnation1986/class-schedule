/**
 * 宝贝回家 · 公益寻亲
 * 内容整理自宝贝回家志愿者协会官网与公安部公开信息, 仅作公益科普与官方入口聚合
 */
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';

import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { PageBackdrop, useBgSetting, usePageBackground } from '@/lib/background';
import { NightCard, NightGlowBackground } from '@/components/night-kit';

const SITE = 'https://www.baobeihuijia.com';
const POLICE_GUIDE = 'https://www.mps.gov.cn/n2253534/n2253543/c8004932/content.html';
const TUANYUAN = 'https://www.mps.gov.cn/n2255079/n5137689/n5414444/n5414452/c5934412/content.html';

const CATEGORIES: { label: string; path: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { label: '家寻宝贝', path: '/bbhj/#homefind', icon: 'search-outline' },
  { label: '宝贝寻家', path: '/bbhj/#findhome', icon: 'home-outline' },
  { label: '烈士寻根', path: '/bbhj/#martyr', icon: 'ribbon-outline' },
  { label: '其他寻人', path: '/bbhj/#other', icon: 'people-outline' },
  { label: '海外寻人', path: '/bbhj/#overseas', icon: 'earth-outline' },
  { label: '流浪乞讨', path: '/bbhj/#tramp', icon: 'walk-outline' },
  { label: '台海寻亲', path: '/bbhj/#taiwan', icon: 'boat-outline' },
];

const STEPS = [
  { title: '立即报警', desc: '儿童失踪不用等 24 小时，请第一时间拨打 110，并向警方提供近期照片、衣着特征与活动轨迹。' },
  { title: '免费采血入库', desc: '失踪被拐儿童父母、疑似被拐人员可到全国任意公安机关刑侦部门免费采集 DNA，不受户籍限制。' },
  { title: '官网登记寻亲', desc: '在宝贝回家官网按“家寻宝贝 / 宝贝寻家”等分类免费发布寻亲信息，志愿者会协助核实与扩散。' },
  { title: '持续扩散线索', desc: '把官方寻亲页面分享给亲友与本地群，发现疑似线索直接交给公安机关，不要私自接触或转账。' },
];

const KNOWLEDGE = [
  {
    q: '孩子应该记住哪些信息？',
    a: '熟记父母姓名、手机号、家庭住址和 110；学会辨认警察、保安、商场工作人员等可求助对象。',
  },
  {
    q: '如何防止孩子被陌生人带走？',
    a: '不轻信陌生人，不接受陌生人的糖果、玩具和饮料，不跟陌生人走，不独自去偏僻地点。',
  },
  {
    q: '外出时家长要注意什么？',
    a: '低龄儿童始终保持在视线范围内；在商场、车站、景区先约定走散后的集合点，并给孩子穿颜色醒目的衣物。',
  },
  {
    q: '孩子走失后怎么办？',
    a: '立即在原地附近寻找并报警，同时安排家人在出入口守候；不要盲目远距离寻找，黄金 24 小时最关键。',
  },
  {
    q: '怀疑自己身世可以怎么做？',
    a: '可主动到公安机关刑侦部门申请免费采血，录入全国打拐 DNA 数据库；也可在宝贝回家官网登记寻家信息。',
  },
  {
    q: '发现疑似被拐卖或乞讨儿童？',
    a: '保持安全距离，记住地点、时间和人物特征，立即拨打 110 报警，不要自行解救或与对方发生冲突。',
  },
  {
    q: '如何保护孩子的网络隐私？',
    a: '少在社交平台公开孩子的姓名、学校、班级、行程和正脸照片，避免被不法分子利用。',
  },
];

export default function WelfareScreen() {
  const scheme = useColorScheme();
  const colors = useTheme();
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const openUrl = useCallback(async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      await Linking.openURL(url).catch(() => Alert.alert('打开失败', '请稍后重试'));
    }
  }, []);

  const call = useCallback(async (tel: string) => {
    try {
      await Linking.openURL(`tel:${tel}`);
    } catch {
      Alert.alert('无法拨号', `请手动拨打 ${tel}`);
    }
  }, []);

  const Card = night ? NightCard : View;
  const cardBg = !night && {
    backgroundColor: glass ? 'transparent' : colors.backgroundElement,
    ...(glass ? { borderWidth: 1, borderColor: glassLine } : null),
  };
  const cardStyle = [styles.card, cardBg];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
      <PageBackdrop />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.backBtn,
            glass && { borderWidth: 1, borderColor: glassLine },
            { backgroundColor: glass ? 'transparent' : colors.backgroundElement },
          ]}>
          <Text style={{ color: colors.text, fontSize: 14 }}>← 返回</Text>
        </Pressable>

        {/* 头部 */}
        <Card style={[styles.hero, cardBg]}>
          <View style={styles.heroHead}>
            <View style={[styles.heroIcon, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
              <Ionicons name="heart" size={26} color="#ef4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>宝贝回家</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>
                全国公益寻亲平台 · 让爱回家
              </Text>
            </View>
          </View>
          <Text style={{ color: colors.text, fontSize: 13.5, lineHeight: 21, marginTop: 12 }}>
            宝贝回家志愿者协会是面向全国的公益寻亲组织，免费帮助失踪被拐儿童家庭与失散人员寻找亲人。
            所有寻亲服务均不收取任何费用。
          </Text>
          <View style={[styles.stats, { borderTopColor: glass ? glassLine : 'rgba(100,116,139,0.20)' }]}>
            {[
              ['61,596', '寻人登记'],
              ['17,835', '成功案例'],
              ['418,675', '志愿者'],
            ].map(([num, label]) => (
              <View key={label} style={styles.statItem}>
                <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '800' }}>{num}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 2 }}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 6 }}>
            数据来自宝贝回家官网公开统计，仅供参考
          </Text>
        </Card>

        {/* 紧急求助 */}
        <View style={[styles.sosCard, { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.45)' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="alert-circle" size={18} color="#ef4444" />
            <Text style={{ color: '#dc2626', fontSize: 15, fontWeight: '800' }}>紧急求助</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20, marginTop: 8 }}>
            儿童失踪请立即报警，不需要等待 24 小时。越早报警，找回的希望越大。
          </Text>
          <Pressable onPress={() => void call('110')} style={styles.policeBtn}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>立即拨打 110</Text>
          </Pressable>
          <View style={styles.sosRow}>
            <Pressable onPress={() => void call('04353338090')} style={[styles.sosMini, { borderColor: 'rgba(239,68,68,0.35)' }]}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>宝贝回家热线</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 2 }}>0435-3338090（工作日）</Text>
            </Pressable>
            <Pressable onPress={() => void call('13039194000')} style={[styles.sosMini, { borderColor: 'rgba(239,68,68,0.35)' }]}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>节假日值班</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 2 }}>13039194000</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 8, lineHeight: 16 }}>
            服务时间 08:00-11:30 / 13:00-16:30 / 17:00-23:00 · 志愿者 QQ 群 1840533
            {'\n'}邮箱 baobeihuijia@yeah.net
          </Text>
        </View>

        {/* 寻亲分类 */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>官方寻亲入口</Text>
        <View style={styles.grid}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.label}
              onPress={() => void openUrl(SITE + c.path)}
              style={({ pressed }) => [
                styles.gridItem,
                !night && {
                  backgroundColor: glass ? 'transparent' : colors.backgroundElement,
                  ...(glass ? { borderWidth: 1, borderColor: glassLine } : null),
                },
                night && { backgroundColor: 'rgba(30,41,59,0.72)' },
                pressed && { opacity: 0.7 },
              ]}>
              <View style={[styles.gridIcon, { backgroundColor: 'rgba(239,68,68,0.10)' }]}>
                <Ionicons name={c.icon} size={18} color="#ef4444" />
              </View>
              <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '600', marginTop: 6 }}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 10.5, lineHeight: 16 }}>
          点击分类跳转宝贝回家官网对应板块，登记与查询均免费。
        </Text>

        {/* 寻亲流程 */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>寻亲流程</Text>
        <Card style={cardStyle}>
          {STEPS.map((s, i) => (
            <View key={s.title} style={[styles.stepRow, i > 0 && { marginTop: 12 }]}>
              <View style={[styles.stepNo, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }}>{s.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 }}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* 公安部团圆行动 */}
        <Card style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>公安部「团圆」行动</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 19, marginTop: 8 }}>
            「团圆」系统以失踪地为中心，按失踪时长逐级扩大范围，向周边群众定向推送儿童失踪信息；
            全国公安机关设有 3000 余个免费采血点，免费采血不受户籍地域限制。
          </Text>
          <Pressable onPress={() => void openUrl(POLICE_GUIDE)} style={[styles.linkRow, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.22)' }]}>
            <Ionicons name="document-text-outline" size={15} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>公安部刑侦局《寻亲指南》</Text>
            <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => void openUrl(TUANYUAN)} style={[styles.linkRow, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.22)' }]}>
            <Ionicons name="radio-outline" size={15} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>「团圆」系统如何帮助寻人</Text>
            <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
          </Pressable>
        </Card>

        {/* 防拐知识 */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>防拐与寻亲知识</Text>
        {KNOWLEDGE.map((k, i) => {
          const open = openFaq === i;
          return (
            <Pressable
              key={k.q}
              onPress={() => setOpenFaq(open ? null : i)}
              style={[
                styles.faq,
                !night && {
                  backgroundColor: glass ? 'transparent' : colors.backgroundElement,
                  ...(glass ? { borderWidth: 1, borderColor: glassLine } : null),
                },
                night && { backgroundColor: 'rgba(30,41,59,0.72)' },
              ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700', flex: 1 }}>{k.q}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
              </View>
              {open && (
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 20, marginTop: 8 }}>{k.a}</Text>
              )}
            </Pressable>
          );
        })}

        {/* 举报与求助 */}
        <Card style={cardStyle}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>举报与求助渠道</Text>
          {[
            { icon: 'call-outline' as const, label: '报警求助', value: '110', tel: '110' },
            { icon: 'people-outline' as const, label: '妇女维权热线', value: '12338', tel: '12338' },
            { icon: 'globe-outline' as const, label: '网络违法举报', value: '12377', tel: '12377' },
          ].map((r) => (
            <Pressable
              key={r.value}
              onPress={() => void call(r.tel)}
              style={[styles.linkRow, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.22)' }]}>
              <Ionicons name={r.icon} size={15} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>{r.label}</Text>
              <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: '700' }}>{r.value}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => void openUrl(SITE)}
            style={[styles.linkRow, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.22)', marginBottom: 0 }]}>
            <Ionicons name="link-outline" size={15} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>宝贝回家官网</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>baobeihuijia.com</Text>
            <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
          </Pressable>
        </Card>

        <Text style={{ color: colors.textSecondary, fontSize: 10.5, lineHeight: 17, textAlign: 'center' }}>
          本页面仅聚合官方公开信息与入口，不收集、不存储任何个人寻亲信息。
          {'\n'}请以公安机关与宝贝回家官网发布的信息为准，谨防以寻亲名义收费的诈骗。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  backBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  card: { borderRadius: 14, padding: 14 },
  hero: { borderRadius: 16, padding: 16 },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  sosCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  policeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 12,
  },
  sosRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  sosMini: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  sectionTitle: { fontSize: 12, fontWeight: '700', marginTop: 6, marginLeft: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: {
    width: '30.5%',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  gridIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepRow: { flexDirection: 'row', gap: 10 },
  stepNo: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
    marginTop: 2,
  },
  faq: { borderRadius: 12, padding: 13 },
});
