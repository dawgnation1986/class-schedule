/**
 * 赞助独立页面: 展示开发者收款码(官网下发优先, GitHub 兜底) + 赞助说明
 * 从"我的 → 支持开发者"进入
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { useBgSetting, PageBackdrop, usePageBackground } from '@/lib/background';
import { NightCard, NightGlowBackground } from '@/components/night-kit';
import { fetchSponsor, sponsorPageUrl, type SponsorInfo } from '@/lib/sponsor';

export default function SponsorScreen() {
  const scheme = useColorScheme();
  const colors = useTheme();
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const router = useRouter();

  const [info, setInfo] = useState<SponsorInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchSponsor()
      .then((s) => {
        if (s && (s.wechat || s.alipay)) setInfo(s);
        else setErr('接口未返回收款码(后台未配置或官网地址不对)');
      })
      .catch((e) => setErr(`加载失败: ${String(e?.message ?? e)}\n可到 我的→通用→官网接口地址 检查地址`));
  }, []);

  const Card = night ? NightCard : View;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      {night && <NightGlowBackground>{null}</NightGlowBackground>}
      <PageBackdrop />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, glass && { borderWidth: 1, borderColor: glassLine }, { backgroundColor: glass ? 'transparent' : colors.backgroundElement }]}>
          <Text style={{ color: colors.text, fontSize: 14 }}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>支持开发者</Text>

        <Card style={[styles.card, !night && glass && { backgroundColor: 'transparent', borderWidth: 1, borderColor: glassLine }, !night && !glass && { backgroundColor: colors.backgroundElement }]}>
          <Text style={{ color: colors.text, lineHeight: 21, fontSize: 13.5 }}>
            这个 App 完全免费、无广告。如果它帮到了你，可以请开发者喝杯奶茶，感谢每一份支持！
          </Text>

          {err && (
            <View style={{ alignItems: 'center', paddingVertical: 18, gap: 10 }}>
              <Ionicons name="heart-outline" size={34} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{err}</Text>
            </View>
          )}

          {!err && !info && <ActivityIndicator style={{ paddingVertical: 24 }} />}

          {info && (
            <View style={styles.codes}>
              {[
                { k: 'wechat' as const, label: '微信收款码', tint: '#07C160', icon: 'chatbubble-ellipses-outline' as const },
                { k: 'alipay' as const, label: '支付宝收款码', tint: '#1677FF', icon: 'wallet-outline' as const },
              ].map((c) =>
                info[c.k] ? (
                  <View key={c.k} style={[styles.codeBox, { borderColor: glass ? glassLine : 'rgba(100,116,139,0.3)' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name={c.icon} size={15} color={c.tint} />
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{c.label}</Text>
                    </View>
                    <Image source={{ uri: info[c.k]! }} style={styles.qr} resizeMode="contain" />
                  </View>
                ) : null,
              )}
              {!info.wechat && !info.alipay && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>暂未配置收款码</Text>
              )}
            </View>
          )}

          {info?.note ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 12 }}>{info.note}</Text>
          ) : null}
          {info?.updated ? (
            <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: 6 }}>更新时间: {info.updated.slice(0, 10)}</Text>
          ) : null}

          <Pressable
            onPress={() => void sponsorPageUrl().then((u) => Linking.openURL(u))}
            style={[styles.webBtn, glass && { borderWidth: 1, borderColor: glassLine, backgroundColor: 'transparent' }, !glass && { backgroundColor: night ? 'rgba(91,140,255,0.14)' : colors.backgroundSelected }]}>
            <Ionicons name="globe-outline" size={15} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '700' }}>在网页查看</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, gap: 14 },
  backBtn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  title: { fontSize: 26, fontWeight: '800' },
  card: { borderRadius: 12, padding: 16, gap: 4 },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  codeBox: {
    width: '47.5%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    alignItems: 'center',
  },
  qr: { width: '100%', aspectRatio: 1, borderRadius: 8 },
  webBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 14,
  },
});
