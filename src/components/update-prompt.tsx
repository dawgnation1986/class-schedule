/** 启动自动检查更新: 每次进入 App 静默查询 GitHub Releases, 发现新版本弹窗提示(下载/取消) */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { ApkDownload } from '@/components/download-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { checkUpdate, type UpdateInfo } from '@/lib/updates';

export function UpdatePrompt() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    // 稍等启动动画结束再检查, 避免弹窗抢在首帧前弹出
    const t = setTimeout(() => {
      void checkUpdate().then((r) => {
        if (alive && r?.hasUpdate) setInfo(r);
      });
    }, 2000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  if (!info) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        setDownloading(false);
        setInfo(null);
      }}>
      <View style={styles.mask}>
        <View style={[styles.box, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text }]}>发现新版本 v{info.latest}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>当前版本 v{info.current}</Text>
          {!!info.notes && (
            <ScrollView style={styles.notesBox} nestedScrollEnabled>
              <Text style={[styles.notes, { color: colors.textSecondary, backgroundColor: colors.backgroundElement }]}>
                {info.notes.trim()}
              </Text>
            </ScrollView>
          )}
          {downloading ? (
            <ApkDownload info={info} colors={colors} />
          ) : (
            <View style={styles.btnRow}>
              <Pressable
                onPress={() => setInfo(null)}
                style={[styles.btn, { backgroundColor: colors.backgroundElement }]}>
                <Text style={{ color: colors.text, fontSize: 15 }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => setDownloading(true)}
                style={[styles.btn, { backgroundColor: '#2563eb' }]}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>下载更新</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  box: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 20 },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 4 },
  notesBox: { maxHeight: 160, marginTop: 12 },
  notes: { fontSize: 13, lineHeight: 19, borderRadius: 10, padding: 10 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 12 },
});
