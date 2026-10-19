import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { checkUpdate, currentVersion, openDownload, type UpdateInfo } from '@/lib/updates';

/** 检查更新卡片: 显示当前版本 + 查询 GitHub Releases + 一键下载 APK */
export function UpdateCard({ colors }: { colors: (typeof Colors)[keyof typeof Colors] }) {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <View style={styles.row}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>当前版本 v{currentVersion()}</Text>
        <Pressable
          disabled={checking}
          hitSlop={8}
          onPress={async () => {
            setChecking(true);
            setErr(null);
            setUpdate(null);
            try {
              const r = await checkUpdate();
              if (r) setUpdate(r);
              else setErr('查询失败，请稍后再试');
            } finally {
              setChecking(false);
            }
          }}>
          {checking ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text style={{ color: '#2563eb', fontSize: 14 }}>检查更新</Text>
          )}
        </Pressable>
      </View>
      {!!err && <Text style={[styles.msg, { color: '#ef4444' }]}>{err}</Text>}
      {update && !update.hasUpdate && (
        <Text style={[styles.msg, { color: colors.textSecondary }]}>已是最新版本 ✓</Text>
      )}
      {update?.hasUpdate && (
        <View style={{ gap: 8 }}>
          <Text style={[styles.msg, { color: '#f59e0b', fontWeight: '700' }]}>
            发现新版本 v{update.latest}
          </Text>
          {!!update.notes && <Text style={[styles.msg, { color: colors.textSecondary }]}>{update.notes}</Text>}
          <Pressable
            onPress={() => openDownload(update)}
            style={{ backgroundColor: '#2563eb', borderRadius: 10, alignItems: 'center', paddingVertical: 11 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>下载 APK 安装包</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, marginTop: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  msg: { fontSize: 13, lineHeight: 19 },
});
