/**
 * 公益专栏 · 宝贝回家
 * 寻亲 tab: 随机展示一条官方寻亲信息(含照片与详细走失信息), 可换一条 / 查看官网详情
 * 捐赠 tab: 志愿者、转发、企业支持与官方渠道说明
 * 数据与图片来自宝贝回家官方公开页面, 仅用于公益传播
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';

import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { PageBackdrop, useBgSetting, usePageBackground } from '@/lib/background';
import { NightCard, NightGlowBackground } from '@/components/night-kit';
import { GlassSurface, GLASS_LINE } from '@/components/glass-surface';
import { fetchRandomRecord, type BbhjRecord } from '@/lib/bbhj';

const SITE = 'https://baobeihuijia.com/bbhj/';
const SEARCH = 'https://so.baobeihuijia.com/bbhj/search.html';
const VOLUNTEER = 'https://reg.baobeihuijia.com/volunteer/index.html';
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
  { q: '孩子应该记住哪些信息？', a: '熟记父母姓名、手机号、家庭住址和 110；学会辨认警察、保安、商场工作人员等可求助对象。' },
  { q: '如何防止孩子被陌生人带走？', a: '不轻信陌生人，不接受陌生人的糖果、玩具和饮料，不跟陌生人走，不独自去偏僻地点。' },
  { q: '外出时家长要注意什么？', a: '低龄儿童始终保持在视线范围内；在商场、车站、景区先约定走散后的集合点，并给孩子穿颜色醒目的衣物。' },
  { q: '孩子走失后怎么办？', a: '立即在原地附近寻找并报警，同时安排家人在出入口守候；不要盲目远距离寻找，黄金 24 小时最关键。' },
  { q: '怀疑自己身世可以怎么做？', a: '可主动到公安机关刑侦部门申请免费采血，录入全国打拐 DNA 数据库；也可在宝贝回家官网登记寻家信息。' },
  { q: '发现疑似被拐卖或乞讨儿童？', a: '保持安全距离，记住地点、时间和人物特征，立即拨打 110 报警，不要自行解救或与对方发生冲突。' },
  { q: '如何保护孩子的网络隐私？', a: '少在社交平台公开孩子的姓名、学校、班级、行程和正脸照片，避免被不法分子利用。' },
];

type Tab = 'find' | 'donate';

export default function WelfareScreen() {
  const scheme = useColorScheme();
  const colors = useTheme();
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.ctrl;
  const glassLine = glass ? GLASS_LINE : scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('find');
  const [record, setRecord] = useState<BbhjRecord | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recErr, setRecErr] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState(false);
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

  const mail = useCallback(async () => {
    try {
      await Linking.openURL('mailto:baobeihuijia@yeah.net');
    } catch {
      Alert.alert('无法打开邮箱', '请手动发送至 baobeihuijia@yeah.net');
    }
  }, []);

  const loadRecord = useCallback(async (excludeId?: string) => {
    setRecLoading(true);
    setRecErr(null);
    setPhotoErr(false);
    try {
      setRecord(await fetchRandomRecord(excludeId));
    } catch (e) {
      setRecErr(e instanceof Error ? e.message : '寻亲信息加载失败');
    } finally {
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  const Card = night ? NightCard : View;
  const cardBg = !night && {
    backgroundColor: glass ? 'transparent' : colors.backgroundElement,
    ...(glass ? { borderWidth: 1, borderColor: glassLine } : null),
  };
  const cardStyle = [styles.card, cardBg];
  const chipBg = night ? 'rgba(30,41,59,0.72)' : glass ? 'transparent' : colors.backgroundElement;
  const chipBorder = night || glass ? { borderWidth: 1, borderColor: glassLine } : null;

  const metaRows: [string, string][] = record
    ? [
        [
          record.restricted ? '年龄' : '出生日期',
          record.restricted ? record.age || '—' : record.birthday || '—',
        ],
        [record.restricted ? '走失年月' : '走失日期', record.lostTime || '—'],
        ['走失地点', record.lostPlace || '—'],
        ['当时身高', record.height || '—'],
      ]
    : [];

  const now = new Date();
  const todayLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
      <PageBackdrop />

      {/* 顶部标题 + 切换 tab */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backIcon}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>公益专栏</Text>
      </View>
      <View style={[styles.tabs, { backgroundColor: night ? 'rgba(30,41,59,0.55)' : colors.backgroundElement }]}>
        {([
          { key: 'find', label: '寻亲' },
          { key: 'donate', label: '捐赠' },
        ] as { key: Tab; label: string }[]).map((t) => {
          const on = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[
                styles.tab,
                on && {
                  backgroundColor: night ? 'rgba(51,65,85,0.95)' : '#fff',
                  shadowColor: '#000',
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: 2,
                },
              ]}>
              <Text style={{ fontSize: 14.5, fontWeight: on ? '800' : '600', color: on ? colors.primary : colors.textSecondary }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'find' ? (
          <>
            {/* 帮宝贝回家 */}
            <Card style={cardStyle}>
              <GlassSurface radius={14} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.introIcon, { backgroundColor: 'rgba(239,68,68,0.10)' }]}>
                  <Ionicons name="heart" size={22} color="#ef4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>帮宝贝回家</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 3 }}>
                    随机展示一条寻亲信息，标注禁止转发的资料仅限站内查看。
                  </Text>
                </View>
              </View>
            </Card>

            {/* 随机寻亲卡片 */}
            <Card style={cardStyle}>
              <GlassSurface radius={14} />
              {!record && recLoading && (
                <View style={{ alignItems: 'center', paddingVertical: 46, gap: 10 }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>正在获取寻亲信息…</Text>
                </View>
              )}

              {!record && !recLoading && (
                <View style={{ alignItems: 'center', paddingVertical: 34, gap: 10 }}>
                  <Ionicons name="cloud-offline-outline" size={34} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, textAlign: 'center' }}>
                    {recErr ?? '暂时没有获取到寻亲信息'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                    <Pressable onPress={() => void loadRecord()} style={[styles.smallBtn, { borderColor: colors.primary }]}>
                      <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: '700' }}>重试</Text>
                    </Pressable>
                    <Pressable onPress={() => void openUrl(SITE)} style={[styles.smallBtn, { borderColor: glassLine }]}>
                      <Text style={{ color: colors.text, fontSize: 12.5 }}>打开官网</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {record && (
                <>
                  {record.restricted && (
                    <View
                      style={[
                        styles.desensBar,
                        { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.45)' },
                      ]}>
                      <Ionicons name="lock-closed-outline" size={14} color="#d97706" />
                      <Text style={{ color: '#b45309', fontSize: 11.5, flex: 1, lineHeight: 17 }}>
                        该资料标注「禁止转发」，已脱敏处理，仅限站内查看；完整信息请前往宝贝回家官网查看。
                      </Text>
                    </View>
                  )}

                  <View style={[styles.photoWrap, { backgroundColor: 'rgba(100,116,139,0.10)' }]}>
                    {!photoErr && record.photo ? (
                      <Image
                        source={{ uri: record.photo }}
                        style={styles.photo}
                        resizeMode="contain"
                        blurRadius={record.restricted ? 6 : 0}
                        onError={() => setPhotoErr(true)}
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Ionicons name="image-outline" size={36} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>暂无照片</Text>
                      </View>
                    )}
                    {record.restricted && !!record.photo && !photoErr && (
                      <View pointerEvents="none" style={styles.watermark}>
                        <Text style={styles.watermarkText}>学生综合管理平台 · 已脱敏</Text>
                        <Text style={styles.watermarkText}>{todayLabel} · 仅限站内查看</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {record.name}
                    </Text>
                    {!!record.gender && (
                      <View
                        style={[
                          styles.tag,
                          {
                            backgroundColor:
                              record.gender === '男'
                                ? 'rgba(37,99,235,0.12)'
                                : record.gender === '女'
                                  ? 'rgba(236,72,153,0.12)'
                                  : 'rgba(100,116,139,0.12)',
                          },
                        ]}>
                        <Text
                          style={{
                            fontSize: 10.5,
                            fontWeight: '700',
                            color: record.gender === '男' ? '#2563eb' : record.gender === '女' ? '#db2777' : colors.textSecondary,
                          }}>
                          {record.gender}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.tag, { backgroundColor: colors.backgroundSelected, marginLeft: 'auto' }]}>
                      <Text style={{ fontSize: 10.5, color: colors.textSecondary }}>{record.category}</Text>
                    </View>
                  </View>

                  <View style={{ marginTop: 6 }}>
                    {metaRows.map(([label, value]) => (
                      <View key={label} style={[styles.metaRow, { borderBottomColor: glass ? glassLine : 'rgba(100,116,139,0.16)' }]}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12.5, width: 72 }}>{label}</Text>
                        <Text style={{ color: colors.text, fontSize: 12.5, flex: 1, textAlign: 'right' }} numberOfLines={2}>
                          {value}
                        </Text>
                      </View>
                    ))}
                    {!!record.feature && (
                      <View style={{ paddingTop: 9 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>特征描述</Text>
                        <Text style={{ color: colors.text, fontSize: 12.5, lineHeight: 19, marginTop: 4 }} numberOfLines={4}>
                          {record.feature}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.actions}>
                    <Pressable onPress={() => void openUrl(record.detailUrl)} style={styles.detailBtn}>
                      <GlassSurface radius={10} />
                      <Ionicons name="document-text-outline" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
                        {record.restricted ? '前往官网查看' : '查看详情'}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={recLoading}
                      onPress={() => void loadRecord(record.id)}
                      style={[styles.shuffleBtn, { borderColor: colors.primary, opacity: recLoading ? 0.6 : 1 }]}>
                      {recLoading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name="refresh" size={15} color={colors.primary} />
                      )}
                      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>换一个</Text>
                    </Pressable>
                  </View>

                  <Text style={{ color: colors.textSecondary, fontSize: 10.5, lineHeight: 16, marginTop: 12 }}>
                    数据来自宝贝回家公益平台，内容随机展示。若你有线索，请联系当地公安或宝贝回家。
                  </Text>
                </>
              )}
            </Card>

            {!!record && (
              <View style={[styles.shareTip, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.22)', backgroundColor: night ? 'rgba(30,41,59,0.55)' : 'transparent' }]}>
                <Ionicons name="shield-checkmark-outline" size={15} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 11, flex: 1, lineHeight: 16 }}>
                  {record.restricted
                    ? '该信息已脱敏，请勿转发或截图传播；带联系方式的完整内容请前往宝贝回家官网查看。'
                    : '转发时请保留原始信息与联系方式，不要修改或裁剪图片。'}
                </Text>
              </View>
            )}

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
                <GlassSurface radius={12} />
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

            {/* 官方寻亲入口 */}
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>官方寻亲入口</Text>
            <Pressable
              onPress={() => void openUrl(SEARCH)}
              style={[styles.searchBtn, { backgroundColor: chipBg }, chipBorder]}>
              <Ionicons name="search" size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 }}>寻亲信息综合搜索</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.textSecondary} />
            </Pressable>
            <View style={styles.grid}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.label}
                  onPress={() => void openUrl('https://baobeihuijia.com' + c.path)}
                  style={({ pressed }) => [styles.gridItem, { backgroundColor: chipBg }, chipBorder, pressed && { opacity: 0.7 }]}>
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
              <GlassSurface radius={14} />
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
              <GlassSurface radius={14} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>公安部「团圆」行动</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 19, marginTop: 8 }}>
                「团圆」系统以失踪地为中心，按失踪时长逐级扩大范围，向周边群众定向推送儿童失踪信息；
                全国公安机关设有 3000 余个免费采血点，免费采血不受户籍地域限制。
              </Text>
              <Pressable
                onPress={() => void openUrl(POLICE_GUIDE)}
                style={[styles.linkRow, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.22)' }]}>
                <Ionicons name="document-text-outline" size={15} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>公安部刑侦局《寻亲指南》</Text>
                <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => void openUrl(TUANYUAN)}
                style={[styles.linkRow, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.22)' }]}>
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
                  style={[styles.faq, { backgroundColor: chipBg }, chipBorder]}>
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
              <GlassSurface radius={14} />
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
              本页面仅展示官方公开寻亲信息与入口，不收集、不存储任何个人寻亲信息。
              {'\n'}请以公安机关与宝贝回家官网发布的信息为准，谨防以寻亲名义收费的诈骗。
            </Text>
          </>
        ) : (
          <>
            {/* 捐赠 / 支持 */}
            <Card style={cardStyle}>
              <GlassSurface radius={14} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.introIcon, { backgroundColor: 'rgba(239,68,68,0.10)' }]}>
                  <Ionicons name="heart" size={24} color="#ef4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>支持宝贝回家</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 3 }}>
                    让更多走失的孩子被看见，让更多家庭团圆。
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.text, fontSize: 12.5, lineHeight: 20, marginTop: 12 }}>
                宝贝回家志愿者协会是民政部门注册的公益性组织，寻亲服务永久免费。
                你可以用转发、志愿服务或爱心支持的方式参与。
              </Text>
            </Card>

            {[
              {
                icon: 'people-outline' as const,
                title: '成为志愿者',
                desc: '有耐心、有时间，可报名参与信息核实、案例跟进与本地协助。',
                action: '志愿者登记',
                run: () => void openUrl(VOLUNTEER),
              },
              {
                icon: 'share-social-outline' as const,
                title: '转发寻亲信息',
                desc: '把允许公开的寻亲卡片分享给亲友；标注禁止转发的资料请勿传播。',
                action: '去转发一条',
                run: () => {
                  setTab('find');
                  void loadRecord(record?.id);
                },
              },
              {
                icon: 'business-outline' as const,
                title: '爱心企业 / 物资支持',
                desc: '企业合作、物资与技术支持，请联系宝贝回家官方。',
                action: '联系官方',
                run: () => void call('04353338090'),
              },
              {
                icon: 'wallet-outline' as const,
                title: '资金捐赠',
                desc: '请认准宝贝回家官网公布的官方捐赠渠道，不要向个人账户转账。',
                action: '查看官网',
                run: () => void openUrl(SITE),
              },
            ].map((item) => (
              <Card key={item.title} style={cardStyle}>
                <GlassSurface radius={14} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.supportIcon, { backgroundColor: 'rgba(37,99,235,0.10)' }]}>
                    <Ionicons name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{item.title}</Text>
                  <Pressable onPress={item.run} style={[styles.smallBtn, { borderColor: colors.primary }]}>
                    <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: '700' }}>{item.action}</Text>
                  </Pressable>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 }}>{item.desc}</Text>
              </Card>
            ))}

            <View style={[styles.sosCard, { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.45)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="alert-circle-outline" size={18} color="#f59e0b" />
                <Text style={{ color: '#b45309', fontSize: 14, fontWeight: '800' }}>重要声明</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 12.5, lineHeight: 19, marginTop: 8 }}>
                宝贝回家不会以任何理由收取寻亲费用。任何以“打点关系”“加急寻人”等名义索要钱财的行为都是诈骗，
                请立即停止转账并拨打 110。
              </Text>
            </View>

            <Card style={cardStyle}>
              <GlassSurface radius={14} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>官方联系方式</Text>
              {[
                { icon: 'call-outline' as const, label: '工作日热线', value: '0435-3338090', run: () => void call('04353338090') },
                { icon: 'call-outline' as const, label: '节假日值班', value: '13039194000', run: () => void call('13039194000') },
                { icon: 'mail-outline' as const, label: '官方邮箱', value: 'baobeihuijia@yeah.net', run: () => void mail() },
              ].map((r) => (
                <Pressable
                  key={r.label}
                  onPress={r.run}
                  style={[styles.linkRow, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.22)' }]}>
                  <Ionicons name={r.icon} size={15} color={colors.primary} />
                  <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>{r.label}</Text>
                  <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: '700' }}>{r.value}</Text>
                </Pressable>
              ))}
              <Text style={{ color: colors.textSecondary, fontSize: 10.5, lineHeight: 16, marginTop: 10 }}>
                服务时间 08:00-11:30 / 13:00-16:30 / 17:00-23:00
                {'\n'}地址：吉林省通化市东昌区新华大街 135 号（134000）
              </Text>
            </Card>

            <Card style={cardStyle}>
              <GlassSurface radius={14} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 2 }}>官方链接</Text>
              {[
                { label: '宝贝回家官网', value: 'baobeihuijia.com', url: SITE },
                { label: '志愿者登记入口', value: 'reg.baobeihuijia.com', url: VOLUNTEER },
                { label: '公安部刑侦局《寻亲指南》', value: 'mps.gov.cn', url: POLICE_GUIDE },
              ].map((l) => (
                <Pressable
                  key={l.label}
                  onPress={() => void openUrl(l.url)}
                  style={[styles.linkRow, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.22)' }]}>
                  <Ionicons name="link-outline" size={15} color={colors.primary} />
                  <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>{l.label}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 10.5 }}>{l.value}</Text>
                  <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
                </Pressable>
              ))}
            </Card>

            <Text style={{ color: colors.textSecondary, fontSize: 10.5, lineHeight: 17, textAlign: 'center' }}>
              本页面不提供任何收款功能，也不收集个人信息。
              {'\n'}捐赠与志愿服务请以宝贝回家官网公布的信息为准。
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  backIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', marginLeft: 4 },
  tabs: { flexDirection: 'row', gap: 6, marginHorizontal: 20, padding: 4, borderRadius: 12 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  content: { padding: 20, paddingTop: 12, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 14 },
  introIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  photoWrap: { height: 210, borderRadius: 10, overflow: 'hidden', marginTop: 2 },
  photo: { width: '100%', height: '100%' },
  desensBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    padding: 9,
    marginBottom: 10,
  },
  watermark: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  watermarkText: { color: 'rgba(255,255,255,0.92)', fontSize: 9.5, fontWeight: '700', lineHeight: 13 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  name: { fontSize: 20, fontWeight: '800', maxWidth: '52%' },
  tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2.5 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  detailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
  },
  shuffleBtn: {
    width: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  smallBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  shareTip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 10, padding: 10 },
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
  searchBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '30.5%', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  gridIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepRow: { flexDirection: 'row', gap: 10 },
  stepNo: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  supportIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
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
