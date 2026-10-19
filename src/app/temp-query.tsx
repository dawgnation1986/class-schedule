import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PageBackdrop, usePageBackground } from '@/lib/background';
import { PickerField } from '@/components/picker-field';
import {
  loadInitial,
  selectDepartment,
  selectMajor,
  type Option,
  type PageState,
  type QueryType,
} from '@/lib/timetable';
import { loadSettings } from '@/lib/settings';
import { setTempOverride } from '@/lib/tempOverride';

const QUERY_TYPES: { value: QueryType; label: string }[] = [
  { value: 'realtime', label: '本周实时课表' },
  { value: 'original', label: '原始课表' },
];

/** 临时查询其他班级课表: 选择后回到课表页查看, 不覆盖"我的班级"设置 */
export default function TempQueryScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  const router = useRouter();

  const [state, setState] = useState<PageState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queryType, setQueryType] = useState<QueryType>('realtime');
  const [sel, setSel] = useState<{ xb: string; zy: string; bj: string }>({ xb: '', zy: '', bj: '' });

  useEffect(() => {
    (async () => {
      setBusy('加载院系列表…');
      try {
        setState(await loadInitial());
        const saved = await loadSettings();
        if (saved) {
          setQueryType(saved.queryType);
          setSel({ xb: saved.xb, zy: saved.zy, bj: saved.bj });
          try {
            let next = await selectDepartment(state ?? (await loadInitial()), saved.xb);
            next = await selectMajor(next, saved.xb, saved.zy);
            setState(next);
          } catch {
            // 网络失败不影响回显
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setBusy(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = useCallback(
    async (key: 'xb' | 'zy' | 'bj', o: Option) => {
      if (!state) return;
      if (key === 'xb') {
        setSel({ xb: o.value, zy: '', bj: '' });
        setBusy('加载专业…');
        try {
          setState(await selectDepartment(state, o.value));
        } catch (e) {
          setError(e instanceof Error ? e.message : '加载专业失败');
        } finally {
          setBusy(null);
        }
      } else if (key === 'zy') {
        setSel((p) => ({ ...p, zy: o.value, bj: '' }));
        setBusy('加载班级…');
        try {
          setState(await selectMajor(state, sel.xb, o.value));
        } catch (e) {
          setError(e instanceof Error ? e.message : '加载班级失败');
        } finally {
          setBusy(null);
        }
      } else {
        setSel((p) => ({ ...p, bj: o.value }));
      }
    },
    [state, sel.xb],
  );

  const go = useCallback(async () => {
    const xbOpt = state?.departments.find((o) => o.value === sel.xb);
    const zyOpt = state?.majors.find((o) => o.value === sel.zy);
    const bjOpt = state?.classes.find((o) => o.value === sel.bj);
    if (!xbOpt || !zyOpt || !bjOpt) return;
    setTempOverride({
      xb: xbOpt.value,
      xbLabel: xbOpt.label,
      zy: zyOpt.value,
      zyLabel: zyOpt.label,
      bj: bjOpt.value,
      bjLabel: bjOpt.label,
      queryType,
    });
    router.back(); // 回到课表页, useFocusEffect 会自动用临时班级查询
  }, [state, sel, queryType, router]);

  const ready = sel.xb && sel.zy && sel.bj;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <PageBackdrop />      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.backgroundElement }]}>
          <Text style={{ color: colors.text, fontSize: 14 }}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>查询其他班级课表</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          临时查看，不会修改"我的"里保存的班级设置。
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}
        {busy && !error && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{busy}</Text>}

        <PickerField
          label="系部 / 学院"
          placeholder={busy === '加载院系列表…' ? '加载中…' : '--请选择--'}
          value={sel.xb}
          options={state?.departments ?? []}
          disabled={!state || !!busy}
          onPick={(o) => pick('xb', o)}
          colors={colors}
        />
        <PickerField
          label="专业"
          placeholder={busy === '加载专业…' ? '加载中…' : sel.xb ? '--请选择--' : '请先选择系部'}
          value={sel.zy}
          options={state?.majors ?? []}
          disabled={!sel.xb || !!busy}
          onPick={(o) => pick('zy', o)}
          colors={colors}
        />
        <PickerField
          label="班级"
          placeholder={busy === '加载班级…' ? '加载中…' : sel.zy ? '--请选择--' : '请先选择专业'}
          value={sel.bj}
          options={state?.classes ?? []}
          disabled={!sel.zy || !!busy}
          onPick={(o) => pick('bj', o)}
          colors={colors}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>查询类型</Text>
        <View style={styles.typeRow}>
          {QUERY_TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => setQueryType(t.value)}
              style={[styles.typeBtn, { backgroundColor: queryType === t.value ? '#2563eb' : colors.backgroundElement }]}>
              <Text style={{ color: queryType === t.value ? '#fff' : colors.text, fontSize: 13 }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          disabled={!ready}
          onPress={go}
          style={[styles.goBtn, { backgroundColor: ready ? '#2563eb' : colors.backgroundElement }]}>
          <Text style={{ color: ready ? '#fff' : colors.textSecondary, fontWeight: '700' }}>
            {ready ? '查询该班级课表' : '请先选择系部 / 专业 / 班级'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  backBtn: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: Spacing.two },
  title: { fontSize: 24, fontWeight: '800', marginBottom: Spacing.one },
  subtitle: { marginBottom: Spacing.three, lineHeight: 20 },
  error: { color: '#ef4444', marginBottom: Spacing.two },
  label: { fontSize: 13, marginBottom: 6 },
  typeRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two, marginBottom: Spacing.three },
  typeBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  goBtn: { borderRadius: 12, alignItems: 'center', paddingVertical: 13, marginTop: Spacing.three },
});
