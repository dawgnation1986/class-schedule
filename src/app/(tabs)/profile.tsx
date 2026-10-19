import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getThemeMode, saveThemeMode, subscribeTheme, themeModeLabel, type ThemeMode } from '@/lib/theme';
import { loadAccount, saveAccount, type StartPage } from '@/lib/account';
import { loadSettings } from '@/lib/settings';
import {
  activeSourceLabel,
  clearCustomTimes,
  getPeriodTimes,
  isValidHM,
  parseTimesJson,
  saveCustomTimes,
  subscribeTimes,
  useSeasonPreset,
  type PeriodTimes,
} from '@/lib/schedule-times';
import { UpdateCard } from '@/components/update-card';

const PERIOD_ORDER = ['1-2', '3-4', '中午', '5-6', '7-8', '9-10'];

/** 手动编辑每节起止时间 */
function TimesEditorModal({
  visible,
  initial,
  onClose,
  colors,
}: {
  visible: boolean;
  initial: PeriodTimes;
  onClose: () => void;
  colors: (typeof Colors)[keyof typeof Colors];
}) {
  const [values, setValues] = useState<Record<string, [string, string]>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const base = { ...initial };
      for (const p of PERIOD_ORDER) if (!base[p]) base[p] = ['00:00', '00:00'];
      setValues(base);
      setErr(null);
    }
  }, [visible, initial]);

  const save = useCallback(async () => {
    const next: PeriodTimes = {};
    for (const p of PERIOD_ORDER) {
      const [s, e] = values[p] ?? ['', ''];
      if (!isValidHM(s) || !isValidHM(e)) {
        setErr(`"${p}" 的时间格式不对, 需要 HH:MM（如 08:20）`);
        return;
      }
      const toMin = (t: string) => {
        const [h, m] = t.trim().split(':').map(Number);
        return h * 60 + m;
      };
      if (toMin(s) >= toMin(e)) {
        setErr(`"${p}" 的开始时间需要早于结束时间`);
        return;
      }
      next[p] = [s.trim().padStart(5, '0'), e.trim().padStart(5, '0')];
    }
    await saveCustomTimes(next);
    onClose();
  }, [values, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalMask} onPress={onClose}>
        <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>编辑作息时间</Text>
          <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
            直接修改各节起止时间，保存后立即生效（倒计时/通知/今日课程都按此计算）
          </Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {PERIOD_ORDER.map((p) => (
              <View key={p} style={styles.editRow}>
                <Text style={[styles.editLabel, { color: colors.text }]}>{p} 节</Text>
                <TextInput
                  value={values[p]?.[0] ?? ''}
                  onChangeText={(t) => setValues((v) => ({ ...v, [p]: [t, v[p]?.[1] ?? ''] }))}
                  placeholder="08:20"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.editInput, { backgroundColor: colors.backgroundElement, color: colors.text }]}
                />
                <Text style={{ color: colors.textSecondary }}>—</Text>
                <TextInput
                  value={values[p]?.[1] ?? ''}
                  onChangeText={(t) => setValues((v) => ({ ...v, [p]: [v[p]?.[0] ?? '', t] }))}
                  placeholder="10:00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.editInput, { backgroundColor: colors.backgroundElement, color: colors.text }]}
                />
              </View>
            ))}
          </ScrollView>
          {!!err && <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{err}</Text>}
          <View style={styles.modalBtnRow}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
              <Text style={{ color: colors.text }}>取消</Text>
            </Pressable>
            <Pressable onPress={save} style={[styles.modalBtn, { backgroundColor: '#2563eb' }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>保存</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 粘贴 JSON 导入作息 */
function JsonImportModal({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: (typeof Colors)[keyof typeof Colors];
}) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      setErr(null);
    }
  }, [visible]);

  const doImport = useCallback(async () => {
    const r = parseTimesJson(text);
    if (!r.ok || !r.times) {
      setErr(r.error ?? '解析失败');
      return;
    }
    await saveCustomTimes(r.times);
    onClose();
  }, [text, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalMask} onPress={onClose}>
        <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>JSON 导入作息</Text>
          <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
            支持格式（键=大节，值=起止时间）：
            {'\n'}{'{'}"1-2": ["08:20","10:00"], "5-6": ["14:00","15:40"]{'}'}
            {'\n'}或 {'{'}"1-2": {'{'}"start":"08:20","end":"10:00"{'}'}{'}'}
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={6}
            placeholder={'{\n  "1-2": ["08:20","10:00"],\n  "3-4": ["10:20","12:00"]\n}'}
            placeholderTextColor={colors.textSecondary}
            style={[styles.jsonInput, { backgroundColor: colors.backgroundElement, color: colors.text }]}
          />
          {!!err && <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{err}</Text>}
          <View style={styles.modalBtnRow}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.backgroundElement }]}>
              <Text style={{ color: colors.text }}>取消</Text>
            </Pressable>
            <Pressable
              disabled={!text.trim()}
              onPress={doImport}
              style={[styles.modalBtn, { backgroundColor: text.trim() ? '#2563eb' : colors.backgroundElement }]}>
              <Text style={{ color: text.trim() ? '#fff' : colors.textSecondary, fontWeight: '700' }}>导入</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ProfileScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [startPage, setStartPage] = useState<StartPage>('home');
  const [classLabel, setClassLabel] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [source, setSource] = useState<string>(activeSourceLabel());
  const [showTimes, setShowTimes] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [times, setTimes] = useState<PeriodTimes>(getPeriodTimes());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getThemeMode());

  useEffect(() => subscribeTheme(() => setThemeMode(getThemeMode())), []);

  const THEME_OPTIONS: ThemeMode[] = ['auto', 'light', 'dark'];

  useEffect(() => {
    const sync = () => {
      setSource(activeSourceLabel());
      setTimes(getPeriodTimes());
    };
    sync();
    return subscribeTimes(sync);
  }, []);

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

        {/* 作息时间表 */}
        <View style={[styles.section, { backgroundColor: colors.backgroundElement }]}>
          <Pressable onPress={() => setShowTimes((v) => !v)} style={styles.timesHead}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>作息时间表</Text>
            <Text style={{ color: '#2563eb', fontSize: 13 }}>{showTimes ? '收起 ▲' : '查看 ▼'}</Text>
          </Pressable>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
            当前使用：{source}
          </Text>
          {showTimes && (
            <View style={{ marginTop: 8, gap: 4 }}>
              {PERIOD_ORDER.filter((p) => times[p]).map((p) => (
                <View key={p} style={styles.timeRow}>
                  <Text style={{ color: colors.text, width: 52, fontSize: 13 }}>{p} 节</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {times[p][0]} — {times[p][1]}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.timesBtnRow}>
            <Pressable
              onPress={() => useSeasonPreset('winter')}
              style={[styles.timesBtn, { backgroundColor: colors.backgroundSelected }]}>
              <Text style={{ color: colors.text, fontSize: 12 }}>导入冬季</Text>
            </Pressable>
            <Pressable
              onPress={() => useSeasonPreset('summer')}
              style={[styles.timesBtn, { backgroundColor: colors.backgroundSelected }]}>
              <Text style={{ color: colors.text, fontSize: 12 }}>导入夏季</Text>
            </Pressable>
            <Pressable
              onPress={() => setEditOpen(true)}
              style={[styles.timesBtn, { backgroundColor: colors.backgroundSelected }]}>
              <Text style={{ color: colors.text, fontSize: 12 }}>手动编辑</Text>
            </Pressable>
            <Pressable
              onPress={() => setJsonOpen(true)}
              style={[styles.timesBtn, { backgroundColor: colors.backgroundSelected }]}>
              <Text style={{ color: colors.text, fontSize: 12 }}>JSON 导入</Text>
            </Pressable>
          </View>
        </View>

        {/* 外观模式 */}
        <View style={[styles.section, { backgroundColor: colors.backgroundElement }]}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>外观模式</Text>
          <View style={[styles.timesBtnRow, { marginTop: 10, marginBottom: 0 }]}>
            {THEME_OPTIONS.map((m) => (
              <Pressable
                key={m}
                onPress={() => void saveThemeMode(m)}
                style={[
                  styles.timesBtn,
                  { backgroundColor: themeMode === m ? '#2563eb' : colors.backgroundSelected, flex: 1 },
                ]}>
                <Text
                  style={{
                    color: themeMode === m ? '#fff' : colors.text,
                    fontSize: 12,
                    fontWeight: themeMode === m ? '700' : '400',
                  }}>
                  {themeModeLabel(m)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <UpdateCard colors={colors} />
      </ScrollView>

      <TimesEditorModal visible={editOpen} initial={times} onClose={() => setEditOpen(false)} colors={colors} />
      <JsonImportModal visible={jsonOpen} onClose={() => setJsonOpen(false)} colors={colors} />
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
  timesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timesBtnRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.one, flexWrap: 'wrap' },
  timesBtn: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.three },
  modalBox: { borderRadius: 14, padding: Spacing.two },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  modalHint: { fontSize: 12, lineHeight: 18, marginBottom: Spacing.one },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  editLabel: { width: 52, fontSize: 13 },
  editInput: { flex: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  jsonInput: { borderRadius: 10, padding: 12, fontSize: 13, minHeight: 130, textAlignVertical: 'top', fontFamily: 'monospace' },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one, justifyContent: 'flex-end' },
  modalBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
});
