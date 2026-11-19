/** 启动公告检查: 官网后台下发的未读公告弹窗展示（延迟避开启动动画与更新弹窗） */
import { useEffect, useState, type ElementType } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { NightCard, NightPrimaryButton } from '@/components/night-kit';
import { fetchNotice, getNoticeReadId, markNoticeRead, type NoticeInfo } from '@/lib/notice';

export function NoticePrompt() {
  const colors = useTheme();
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const BoxWrap: ElementType = night ? NightCard : View;
  const [info, setInfo] = useState<NoticeInfo | null>(null);

  useEffect(() => {
    let alive = true;
    // 稍等启动流程稳定再检查（更新检查在 2s, 公告错开到 4s）
    const t = setTimeout(() => {
      void (async () => {
        const n = await fetchNotice();
        if (!alive || !n) return;
        const read = await getNoticeReadId();
        if (read !== n.id) setInfo(n);
      })();
    }, 4000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    if (info) void markNoticeRead(info.id);
    setInfo(null);
  };

  if (!info) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.mask}>
        <BoxWrap style={night ? styles.box : [styles.box, { backgroundColor: colors.background }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 18 }}>📣</Text>
            <Text style={[styles.title, { color: colors.text }]}>{info.title}</Text>
          </View>
          {!!info.updated && (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>发布于 {info.updated}</Text>
          )}
          <ScrollView style={[styles.contentBox, { backgroundColor: colors.backgroundElement }]} nestedScrollEnabled>
            <Text style={[styles.content, { color: colors.text }]}>{info.content}</Text>
          </ScrollView>
          <View style={styles.btnRow}>
            {night ? (
              <NightPrimaryButton title="我知道了" onPress={dismiss} style={{ flex: 1 }} />
            ) : (
              <Pressable onPress={dismiss} style={[styles.btn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>我知道了</Text>
              </Pressable>
            )}
          </View>
        </BoxWrap>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  box: { width: '100%', maxWidth: 380, borderRadius: 16, padding: 20 },
  title: { fontSize: 17, fontWeight: '800', flexShrink: 1 },
  sub: { fontSize: 12, marginTop: 6 },
  contentBox: { maxHeight: 300, marginTop: 12, borderRadius: 10, padding: 12 },
  content: { fontSize: 14, lineHeight: 21 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 12 },
});
