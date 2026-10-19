import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadAccount, saveAccount, type StartPage } from '@/lib/account';
import { loadSettings } from '@/lib/settings';

export default function ProfileScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [startPage, setStartPage] = useState<StartPage>('home');
  const [classLabel, setClassLabel] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const acc = await loadAccount();
      if (acc) {
        setUsername(acc.username);
        setPassword(acc.password);
        setStartPage(acc.startPage);
      }
      const s = await loadSettings();
      setClassLabel(s?.bjLabel ?? null);
    })();
  }, []);

  const save = useCallback(async () => {
    if (!username || !password) return;
    await saveAccount({ username, password, startPage });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [username, password, startPage]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>我的</Text>

        <Text style={[styles.label, { color: colors.textSecondary }]}>主站账号（学号）</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="请输入学号"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundElement }]}
          autoCapitalize="none"
        />
        <Text style={[styles.label, { color: colors.textSecondary }]}>密码</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="请输入密码"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundElement }]}
          secureTextEntry
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>默认起始页</Text>
        <View style={styles.startRow}>
          {(
            [
              ['home', '主站（综合管理平台）'],
              ['timetable', '班级课表查询'],
            ] as [StartPage, string][]
          ).map(([v, label]) => (
            <Pressable
              key={v}
              onPress={() => setStartPage(v)}
              style={[
                styles.startBtn,
                { backgroundColor: startPage === v ? '#2563eb' : colors.backgroundElement },
              ]}>
              <Text style={{ color: startPage === v ? '#fff' : colors.text, fontSize: 13, fontWeight: startPage === v ? '700' : '400' }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          disabled={!username || !password}
          onPress={save}
          style={[styles.saveBtn, { backgroundColor: username && password ? '#2563eb' : colors.backgroundElement }]}>
          <Text style={{ color: username && password ? '#fff' : colors.textSecondary, fontWeight: '700' }}>
            {saved ? '已保存 ✓' : '保存'}
          </Text>
        </Pressable>

        <View style={[styles.section, { backgroundColor: colors.backgroundElement }]}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>班级课表设置</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
            当前班级：{classLabel ?? '未设置'}
          </Text>
          <Pressable
            onPress={() => router.push('/settings')}
            style={[styles.linkBtn, { backgroundColor: colors.backgroundSelected }]}>
            <Text style={{ color: colors.text, fontSize: 13 }}>去设置系部 / 专业 / 班级</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: Spacing.three },
  label: { fontSize: 13, marginBottom: 6, marginTop: Spacing.two },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, fontSize: 15 },
  startRow: { flexDirection: 'row', gap: Spacing.two },
  startBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtn: { borderRadius: 12, alignItems: 'center', paddingVertical: 13, marginTop: Spacing.three },
  section: { borderRadius: 12, padding: Spacing.two, marginTop: Spacing.three, gap: Spacing.one },
  linkBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: Spacing.one },
});
