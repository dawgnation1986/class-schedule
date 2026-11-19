/** 赞助开发者弹窗: 展示微信/支付宝收款码(官网后台下发, GitHub 兜底) */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { fetchSponsor, SPONSOR_PAGE_URL, type SponsorInfo } from '@/lib/sponsor';
import { type Palette } from '@/constants/theme';

export function SponsorModal({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: Palette;
}) {
  const [info, setInfo] = useState<SponsorInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setInfo(null);
    setErr(null);
    void fetchSponsor().then((r) => {
      if (r) setInfo(r);
      else setErr('加载失败，请检查网络后重试');
    });
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={[styles.box, { backgroundColor: colors.background }]} onPress={() => {}}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="heart" size={20} color="#ef4444" />
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>支持开发者</Text>
          </View>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingTop: 10, gap: 14 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
              {info?.note || '这个 App 完全免费、无广告。如果它帮到了你，可以请开发者喝杯奶茶，感谢每一份支持！'}
            </Text>
            {err && <Text style={{ color: '#ef4444', fontSize: 13 }}>{err}</Text>}
            {!info && !err && <ActivityIndicator style={{ paddingVertical: 24 }} />}
            {info && (
              <View style={styles.qrRow}>
                {info.wechat && (
                  <View style={styles.qrCol}>
                    <View style={[styles.qrBox, { backgroundColor: '#fff' }]}>
                      <Image source={{ uri: info.wechat }} style={styles.qrImg} contentFit="contain" />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>微信收款码</Text>
                  </View>
                )}
                {info.alipay && (
                  <View style={styles.qrCol}>
                    <View style={[styles.qrBox, { backgroundColor: '#fff' }]}>
                      <Image source={{ uri: info.alipay }} style={styles.qrImg} contentFit="contain" />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>支付宝收款码</Text>
                  </View>
                )}
                {!info.wechat && !info.alipay && (
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>收款码暂未配置</Text>
                )}
              </View>
            )}
            {!!info?.updated && (
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>更新于 {info.updated}</Text>
            )}
          </ScrollView>
          <View style={styles.btnRow}>
            <Pressable onPress={onClose} style={[styles.btn, { backgroundColor: colors.backgroundElement }]}>
              <Text style={{ color: colors.text }}>关闭</Text>
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL(SPONSOR_PAGE_URL)}
              style={[styles.btn, { backgroundColor: '#2563eb' }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>在网页查看</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  box: { borderRadius: 14, padding: 18 },
  qrRow: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  qrCol: { alignItems: 'center', gap: 8 },
  qrBox: { width: 150, height: 150, borderRadius: 12, padding: 8 },
  qrImg: { width: '100%', height: '100%' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  btn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
});
