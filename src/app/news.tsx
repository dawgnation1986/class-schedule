/**
 * 每日新闻: 中国新闻网官方 RSS 聚合(要闻 + 即时)
 * 入口: 课表页天气胶囊旁的「新闻」按钮 / 我的 → 每日新闻
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
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
import { fetchDailyNews, fetchNewsArticle, type NewsArticle, type NewsItem } from '@/lib/news';

export default function NewsScreen() {
  const scheme = useColorScheme();
  const colors = useTheme();
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.ctrl;
  const glassLine = glass ? GLASS_LINE : scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const router = useRouter();

  const [list, setList] = useState<NewsItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reader, setReader] = useState<NewsItem | null>(null);
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [artLoading, setArtLoading] = useState(false);
  const [artErr, setArtErr] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const r = await fetchDailyNews(force);
      setList(r.list);
      setCached(r.cached);
      setErr(r.cached ? '网络暂不可用，正在显示上次缓存的新闻' : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '新闻加载失败');
      setList((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const openLink = useCallback(async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      await Linking.openURL(url).catch(() => {});
    }
  }, []);

  const openReader = useCallback(async (item: NewsItem) => {
    setReader(item);
    setArticle(null);
    setArtErr(null);
    setArtLoading(true);
    try {
      setArticle(await fetchNewsArticle(item.link));
    } catch (e) {
      setArtErr(e instanceof Error ? e.message : '正文加载失败');
    } finally {
      setArtLoading(false);
    }
  }, []);

  const closeReader = useCallback(() => {
    setReader(null);
    setArticle(null);
    setArtErr(null);
  }, []);

  const Card = night ? NightCard : View;
  const cardBg = !night && {
    backgroundColor: glass ? 'transparent' : colors.backgroundElement,
    ...(glass ? { borderWidth: 1, borderColor: glassLine } : null),
  };
  const today = new Date();
  const dateLabel = `${today.getMonth() + 1} 月 ${today.getDate()} 日`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
      <PageBackdrop />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />
        }>
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.backBtn,
            glass && { borderWidth: 1, borderColor: glassLine },
            { backgroundColor: glass ? 'transparent' : colors.backgroundElement },
          ]}>
          <GlassSurface radius={10} />
          <Text style={{ color: colors.text, fontSize: 14 }}>← 返回</Text>
        </Pressable>

        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>每日新闻</Text>
          <View style={[styles.dateBadge, { backgroundColor: colors.backgroundSelected }]}>
            <Ionicons name="newspaper-outline" size={12} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{dateLabel}</Text>
          </View>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: -4 }}>
          中国新闻网官方 RSS · 要闻与即时新闻 · 下拉刷新
        </Text>

        {err && (
          <View
            style={[
              styles.tip,
              {
                backgroundColor: cached ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.10)',
                borderColor: cached ? 'rgba(245,158,11,0.45)' : 'rgba(239,68,68,0.40)',
              },
            ]}>
            <Ionicons
              name={cached ? 'cloud-offline-outline' : 'alert-circle-outline'}
              size={14}
              color={cached ? '#f59e0b' : '#ef4444'}
            />
            <Text style={{ color: cached ? '#b45309' : '#dc2626', fontSize: 12, flex: 1 }}>{err}</Text>
          </View>
        )}

        {list === null && <ActivityIndicator style={{ paddingVertical: 40 }} color={colors.primary} />}

        {list !== null && list.length === 0 && (
          <Card style={[styles.card, !night && cardBg]}>
            <GlassSurface radius={14} />
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
              <Ionicons name="newspaper-outline" size={34} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>暂无新闻，下拉刷新试试</Text>
            </View>
          </Card>
        )}

        {list?.map((n, i) => (
          <Pressable key={n.id + i} onPress={() => void openReader(n)} style={({ pressed }) => (pressed ? { opacity: 0.75 } : null)}>
            <Card style={[styles.card, !night && cardBg]}>
              <View style={styles.itemHead}>
                <View style={[styles.index, { backgroundColor: i < 3 ? colors.primary : colors.backgroundSelected }]}>
                  <Text style={{ color: i < 3 ? '#fff' : colors.textSecondary, fontSize: 11, fontWeight: '800' }}>
                    {i + 1}
                  </Text>
                </View>
                <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={3}>
                  {n.title}
                </Text>
              </View>
              {!!n.summary && (
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 19, marginTop: 8 }} numberOfLines={2}>
                  {n.summary}
                </Text>
              )}
              <View style={styles.itemFoot}>
                <Ionicons name="radio-outline" size={11} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 10.5 }}>
                  {n.source}
                  {n.time ? ` · ${n.time}` : ''}
                </Text>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', marginLeft: 'auto' }}>
                  阅读全文
                </Text>
                <Ionicons name="chevron-forward" size={12} color={colors.primary} />
              </View>
            </Card>
          </Pressable>
        ))}

        {list !== null && list.length > 0 && (
          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            点击条目在站内阅读全文，正文页可跳转原文
          </Text>
        )}
      </ScrollView>

      {/* 站内阅读 */}
      <Modal visible={!!reader} animationType="slide" onRequestClose={closeReader}>
        <SafeAreaView style={[styles.readerSafe, { backgroundColor: pageBg }]} edges={['top', 'bottom']}>
          {night && <NightGlowBackground>{null}</NightGlowBackground>}
          <PageBackdrop />
          <View style={styles.readerHead}>
            <Pressable onPress={closeReader} hitSlop={10} style={styles.readerBack}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 }}>新闻正文</Text>
            <Pressable
              onPress={() => reader && void openLink(reader.link)}
              style={[styles.originChip, { borderColor: colors.primary }]}>
              <Ionicons name="open-outline" size={13} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>阅读原文</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.readerContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.readerTitle, { color: colors.text }]}>{article?.title || reader?.title}</Text>
            <View style={styles.readerMeta}>
              <Ionicons name="radio-outline" size={12} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 11.5 }}>
                {article?.source || reader?.source || '中国新闻网'}
                {article?.time || reader?.time ? ` · ${article?.time || reader?.time}` : ''}
              </Text>
            </View>

            {artLoading && (
              <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>正在加载正文…</Text>
              </View>
            )}

            {!!artErr && (
              <View
                style={[
                  styles.tip,
                  { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.45)' },
                ]}>
                <Ionicons name="cloud-offline-outline" size={14} color="#f59e0b" />
                <Text style={{ color: '#b45309', fontSize: 12, flex: 1 }}>
                  正文加载失败（{artErr}），可点击下方「阅读原文」查看。
                </Text>
              </View>
            )}

            {!artLoading && !artErr && article && (
              <>
                {article.blocks.some((b) => b.text || b.images.length) ? (
                  article.blocks.map((b, bi) => (
                    <View key={bi} style={{ gap: 10, marginBottom: 6 }}>
                      {b.images.map((src) => (
                        <Image
                          key={src}
                          source={{ uri: src }}
                          style={[styles.readerImg, { backgroundColor: 'rgba(100,116,139,0.12)' }]}
                          resizeMode="cover"
                        />
                      ))}
                      {!!b.text && <Text style={[styles.readerText, { color: colors.text }]}>{b.text}</Text>}
                    </View>
                  ))
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                    <Ionicons name="videocam-outline" size={30} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12.5, textAlign: 'center', lineHeight: 19 }}>
                      该内容以视频或图片形式发布，{'\n'}站内暂不支持播放，请点击「阅读原文」查看。
                    </Text>
                  </View>
                )}

                {!!reader?.summary && !article.blocks.some((b) => b.text.length > 40) && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 20 }}>{reader.summary}</Text>
                )}
              </>
            )}

            <Pressable onPress={() => reader && void openLink(reader.link)} style={styles.detailBtn}>
              <GlassSurface radius={11} />
              <Ionicons name="open-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>阅读原文</Text>
            </Pressable>
            <Text style={{ color: colors.textSecondary, fontSize: 10.5, lineHeight: 16, textAlign: 'center' }}>
              正文自动提取自中国新闻网，排版可能有缺失，完整内容请阅读原文。
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, gap: 12 },
  backBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  title: { fontSize: 26, fontWeight: '800' },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  card: { borderRadius: 14, padding: 14 },
  itemHead: { flexDirection: 'row', gap: 10 },
  index: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  itemFoot: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  readerSafe: { flex: 1 },
  readerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  readerBack: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  originChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  readerContent: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 36, gap: 12 },
  readerTitle: { fontSize: 21, fontWeight: '800', lineHeight: 30 },
  readerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -4 },
  readerImg: { width: '100%', height: 200, borderRadius: 10 },
  readerText: { fontSize: 15.5, lineHeight: 26 },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    borderRadius: 11,
    paddingVertical: 13,
    marginTop: 8,
  },
});
