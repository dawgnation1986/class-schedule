/**
 * 每日新闻: 中国新闻网官方 RSS 聚合(要闻 + 即时)
 * 入口: 课表页天气胶囊旁的「新闻」按钮 / 我的 → 每日新闻
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
import { fetchDailyNews, type NewsItem } from '@/lib/news';

export default function NewsScreen() {
  const scheme = useColorScheme();
  const colors = useTheme();
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const router = useRouter();

  const [list, setList] = useState<NewsItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
              <Ionicons name="newspaper-outline" size={34} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>暂无新闻，下拉刷新试试</Text>
            </View>
          </Card>
        )}

        {list?.map((n, i) => (
          <Pressable key={n.id + i} onPress={() => void openLink(n.link)} style={({ pressed }) => (pressed ? { opacity: 0.75 } : null)}>
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
                  阅读原文
                </Text>
                <Ionicons name="chevron-forward" size={12} color={colors.primary} />
              </View>
            </Card>
          </Pressable>
        ))}

        {list !== null && list.length > 0 && (
          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            内容来自中国新闻网官方 RSS，点击条目跳转原文
          </Text>
        )}
      </ScrollView>
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
});
