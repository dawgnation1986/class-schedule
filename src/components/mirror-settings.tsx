/** 镜像管理弹窗: 内置/自定义镜像列表 + 测速 + 增删 + 开关 */
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/theme';
import {
  addCustomMirror,
  getMirrorSettings,
  removeCustomMirror,
  subscribeMirrors,
  testMirror,
  toggleBuiltinMirror,
  type Mirror,
} from '@/lib/gh-mirrors';

export function MirrorSettings({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: (typeof Colors)[keyof typeof Colors];
}) {
  const [customs, setCustoms] = useState<string[]>([]);
  const [builtins, setBuiltins] = useState<Mirror[]>([]);
  const [latency, setLatency] = useState<Record<string, number>>({});
  const [testing, setTesting] = useState(false);
  const [input, setInput] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getMirrorSettings().then((s) => {
      setCustoms(s.customs);
      setBuiltins(s.builtins);
    });
  }, []);

  useEffect(() => refresh(), [refresh, visible]);
  useEffect(() => subscribeMirrors(refresh), [refresh]);

  const testAll = async () => {
    setTesting(true);
    setLatency({});
    const targets = [
      ...builtins.map((m) => ({ id: m.id, prefix: m.prefix })),
      ...customs.map((prefix, i) => ({ id: `c-${i}`, prefix })),
    ];
    await Promise.all(
      targets.map(async (t) => {
        const ms = await testMirror(t.prefix);
        setLatency((prev) => ({ ...prev, [t.id]: ms }));
      }),
    );
    setTesting(false);
  };

  const row = (id: string, name: string, enabled: boolean, onDelete?: () => void, onToggle?: () => void) => (
    <View key={id} style={[styles.row, { backgroundColor: colors.backgroundElement }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14 }}>{name}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
          {latency[id] === undefined
            ? '未测试'
            : latency[id] < 0
              ? '✗ 不可用'
              : `✓ ${latency[id]}ms`}
        </Text>
      </View>
      {onToggle && (
        <Pressable onPress={onToggle} style={styles.chip}>
          <Text style={{ color: enabled ? '#16a34a' : colors.textSecondary, fontSize: 12 }}>
            {enabled ? '已启用' : '已停用'}
          </Text>
        </Pressable>
      )}
      {!!onDelete && (
        <Pressable onPress={onDelete} style={styles.chip}>
          <Text style={{ color: '#ef4444', fontSize: 12 }}>删除</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable
          style={[styles.box, { backgroundColor: colors.background }]}
          onPress={() => {}}>
          <Text style={[styles.title, { color: colors.text }]}>下载镜像设置</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            下载时自动测速，从快到慢依次尝试
          </Text>

          <ScrollView style={styles.list} nestedScrollEnabled>
            {customs.map((prefix, i) =>
              row(`c-${i}`, prefix, true, () => void removeCustomMirror(i).then(refresh)),
            )}
            {builtins.map((m) =>
              row(m.id, m.name, m.enabled, undefined, () => void toggleBuiltinMirror(m.id)),
            )}
          </ScrollView>

          <View style={styles.addRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="https://你的镜像域名/"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }]}
              autoCapitalize="none"
            />
            <Pressable
              onPress={() => {
                setErr(null);
                addCustomMirror(input)
                  .then(() => setInput(''))
                  .catch((e) => setErr(e instanceof Error ? e.message : '添加失败'));
              }}
              style={[styles.chip, { backgroundColor: '#2563eb' }]}>
              <Text style={{ color: '#fff', fontSize: 13 }}>添加</Text>
            </Pressable>
          </View>
          {!!err && <Text style={{ color: '#ef4444', fontSize: 12 }}>{err}</Text>}

          <View style={styles.btnRow}>
            <Pressable
              disabled={testing}
              onPress={() => void testAll()}
              style={[styles.btn, { backgroundColor: colors.backgroundElement }]}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{testing ? '测试中…' : '测试连接性'}</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[styles.btn, { backgroundColor: '#2563eb' }]}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>完成</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 400, borderRadius: 16, padding: 18 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  list: { maxHeight: 300, marginTop: 10, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10, marginBottom: 6 },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(128,128,128,0.15)' },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: 10, minHeight: 40 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 11 },
});
