/**
 * 全部公告页面: 展示官网后台下发的所有启用中公告（最新在前）
 * 点按卡片展开/收起内容; 从弹窗「查看全部」或「我的 → 公告」进入
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { useBgSetting, PageBackdrop, usePageBackground } from '@/lib/background';
import { NightCard, NightGlowBackground } from '@/components/night-kit';
import { GlassSurface, GLASS_LINE } from '@/components/glass-surface';
import { fetchNoticeList, getNoticeReadIds, type NoticeInfo } from '@/lib/notice';

export default function NoticesScreen() {
  const scheme = useColorScheme();
  const colors = useTheme();
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.ctrl;
  const glassLine = glass ? GLASS_LINE : scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const router = useRouter();

  const [list, setList] = useState<NoticeInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await fetchNoticeList();
      if (l.length === 0) setErr('暂无公告（后台未发布或官网地址不对）');
      else setErr(null);
      setList(l);
      setReadIds(await getNoticeReadIds());
    } catch (e) {
      setErr(`加载失败: ${e instanceof Error ? e.message : String(e)}`);
      setList([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const Card = night ? NightCard : View;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
      <PageBackdrop />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, glass && { borderWidth: 1, borderColor: glassLine }, { backgroundColor: glass ? 'transparent' : colors.backgroundElement }]}>
          <GlassSurface radius={10} />
          <Text style={{ color: colors.text, fontSize: 14 }}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>公告</Text>

        {list === null && !err && <ActivityIndicator style={{ paddingVertical: 32 }} />}

        {err && list !== null && list.length === 0 && (
          <Card style={[styles.card, !night && glass && { backgroundColor: 'transparent', borderWidth: 1, borderColor: glassLine }, !night && !glass && { backgroundColor: colors.backgroundElement }]}>
            <GlassSurface radius={12} />
            <View style={{ alignItems: 'center', paddingVertical: 18, gap: 10 }}>
              <Ionicons name="megaphone-outline" size={34} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{err}</Text>
            </View>
          </Card>
        )}

        {list !== null &&
          list.map((n, i) => {
            // 默认展开第一条; openId 为空串表示全部收起
            const open = openId === null ? i === 0 : openId === n.id;
            const unread = !readIds.includes(n.id);
            return (
              <Pressable
                key={n.id + i}
                onPress={() => setOpenId(open ? '' : n.id)}
                style={[
                  styles.card,
                  !night && glass && { backgroundColor: 'transparent', borderWidth: 1, borderColor: glassLine },
                  !night && !glass && { backgroundColor: colors.backgroundElement },
                ]}>
                <GlassSurface radius={12} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="megaphone-outline" size={16} color={colors.primary} />
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, flexShrink: 1 }} numberOfLines={open ? undefined : 1}>
                    {n.title}
                  </Text>
                  {unread && (
                    <View style={[styles.dot, { backgroundColor: colors.primary }]}>
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>新</Text>
                    </View>
                  )}
                </View>
                {!!n.updated && <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>发布于 {n.updated}</Text>}
                {open ? (
                  <View style={[styles.contentBox, { backgroundColor: glass ? 'transparent' : colors.backgroundSelected }]}>
                    <Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>{n.content}</Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 6 }} numberOfLines={1}>
                    {n.content}
                  </Text>
                )}
              </Pressable>
            );
          })}

        {list !== null && list.length > 0 && (
          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            点按卡片可展开或收起 · 下拉刷新
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
  title: { fontSize: 26, fontWeight: '800' },
  card: { borderRadius: 12, padding: 16 },
  dot: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 'auto',
  },
  contentBox: { borderRadius: 10, padding: 12, marginTop: 10 },
});
