/** 课表截图导入: 选图 → OCR → 人工校正 → 写入课表 */
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { GlassSurface, GLASS_LINE } from '@/components/glass-surface';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PageBackdrop, usePageBackground } from '@/lib/background';
import { recognizeImageLayout } from '@/lib/captcha-ocr';
import { beijingNow } from '@/lib/timetable';
import { weekKeyOf, saveTimetableCache } from '@/lib/settings';
import { scheduleClassReminders } from '@/lib/notifications';
import { refreshWidgets } from '@/lib/widget';
import {
  buildTimetableFromCourses,
  OCR_PERIODS,
  parseOcrCourses,
  saveImportedTimetable,
  type OcrCourse,
} from '@/lib/timetable-ocr';

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export default function TimetableOcrScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  const router = useRouter();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [via, setVia] = useState('');
  const [courses, setCourses] = useState<OcrCourse[]>([]);

  const pickImage = useCallback(async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (r.canceled) return;
      const asset = r.assets?.[0];
      if (!asset) return;
      const ext = (asset.name?.split('.').pop() || 'jpg').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const b64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setImageUri(asset.uri);
      setDataUri(`data:${mime};base64,${b64}`);
      setCourses([]);
      setError(null);
      setVia('');
    } catch {
      Alert.alert('读取失败', '无法读取这张图片，请换一张试试');
    }
  }, []);

  const recognize = useCallback(async () => {
    if (!dataUri || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await recognizeImageLayout(dataUri);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const parsed = parseOcrCourses(r.lines);
      setVia(r.via);
      if (!parsed.length) {
        setError('识别到了文字，但没找到课程信息。请确认截图包含完整课表、文字清晰，或换一张再试。');
        return;
      }
      setCourses(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : '识别失败，请重试');
    } finally {
      setBusy(false);
    }
  }, [busy, dataUri]);

  const update = useCallback((id: string, patch: Partial<OcrCourse>) => {
    setCourses((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const remove = useCallback((id: string) => {
    setCourses((list) => list.filter((c) => c.id !== id));
  }, []);

  const addBlank = useCallback(() => {
    setCourses((list) => [
      ...list,
      {
        id: `manual-${Date.now()}`,
        name: '',
        location: '',
        teacher: '',
        weeks: '1-18周',
        day: null,
        period: null,
      },
    ]);
  }, []);

  const doImport = useCallback(
    async (list: OcrCourse[]) => {
      setImporting(true);
      try {
        const tt = buildTimetableFromCourses(list);
        await saveImportedTimetable(tt);
        // 同步到普通缓存, 桌面小组件也能看到
        await saveTimetableCache(tt, weekKeyOf(beijingNow())).catch(() => {});
        void scheduleClassReminders(tt).catch(() => {});
        void refreshWidgets().catch(() => {});
        Alert.alert('导入成功', `已导入 ${list.length} 门课程，回到课表页即可查看`, [
          { text: '完成', onPress: () => router.back() },
        ]);
      } finally {
        setImporting(false);
      }
    },
    [router],
  );

  const onImport = useCallback(() => {
    const valid = courses.filter((c) => c.name.trim() && c.day != null && c.period);
    const skipped = courses.length - valid.length;
    if (!valid.length) {
      Alert.alert('还不能导入', '至少需要一门填好课程名、星期和节次的课');
      return;
    }
    if (skipped > 0) {
      Alert.alert('有课程没填完', `${skipped} 门缺少课程名/星期/节次，将被忽略。`, [
        { text: '返回修改', style: 'cancel' },
        { text: '仍然导入', onPress: () => void doImport(valid) },
      ]);
      return;
    }
    void doImport(valid);
  }, [courses, doImport]);

  const chipStyle = (active: boolean) => [
    styles.chip,
    {
      borderColor: active ? colors.primary : 'rgba(128,128,128,0.35)',
      backgroundColor: active ? 'rgba(37,99,235,0.12)' : 'transparent',
    },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <PageBackdrop />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 16 }}>返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>截图导入课表</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <GlassSurface radius={14} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>怎么用</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            1. 选择一张课表截图（教务系统、班级群里的都行）{'\n'}
            2. 点「识别」自动拆出课程、教室、星期和节次{'\n'}
            3. 识别不准的地方直接改，再点「导入课表」
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 6 }]}>
            识别在云端完成，图片会上传到 OCR 服务。主站登录页的 OCR 设置里填了百度 AK/SK 会更准、更快。
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <GlassSurface radius={14} />
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <Pressable
              onPress={pickImage}
              style={[styles.pickBox, { borderColor: 'rgba(128,128,128,0.35)' }]}>
              <Ionicons name="image-outline" size={34} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>点这里选择课表图片</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>支持相册 / 文件里的 png、jpg</Text>
            </Pressable>
          )}

          <View style={styles.btnRow}>
            <Pressable
              onPress={pickImage}
              style={[styles.btn, { backgroundColor: 'rgba(128,128,128,0.12)' }]}>
              <Ionicons name="images-outline" size={15} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 13 }}>{imageUri ? '换一张' : '选择图片'}</Text>
            </Pressable>
            <Pressable
              onPress={recognize}
              disabled={!dataUri || busy}
              style={[
                styles.btn,
                { backgroundColor: colors.primary, opacity: !dataUri || busy ? 0.5 : 1 },
              ]}>
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="scan-outline" size={15} color="#fff" />
              )}
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                {busy ? '识别中…' : '识别文字'}
              </Text>
            </Pressable>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}
          {!error && !!via && courses.length > 0 && (
            <Text style={[styles.via, { color: colors.textSecondary }]}>
              已通过 {via} 识别，请核对下面的结果
            </Text>
          )}
        </View>

        {courses.length > 0 && (
          <>
            <View style={styles.resultHead}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>
                识别结果 · {courses.length} 门
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>点字段可直接修改</Text>
            </View>

            {courses.map((c) => (
              <View key={c.id} style={[styles.courseCard, { backgroundColor: colors.backgroundElement }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    value={c.name}
                    onChangeText={(v) => update(c.id, { name: v })}
                    placeholder="课程名称"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.nameInput, { color: colors.text, borderColor: 'rgba(128,128,128,0.35)' }]}
                  />
                  <Pressable onPress={() => remove(c.id)} style={styles.delBtn}>
                    <Ionicons name="trash-outline" size={17} color="#ef4444" />
                  </Pressable>
                </View>

                <View style={styles.inputRow}>
                  <TextInput
                    value={c.location}
                    onChangeText={(v) => update(c.id, { location: v })}
                    placeholder="教室"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.smallInput, { color: colors.text, borderColor: 'rgba(128,128,128,0.35)' }]}
                  />
                  <TextInput
                    value={c.teacher}
                    onChangeText={(v) => update(c.id, { teacher: v })}
                    placeholder="教师"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.smallInput, { color: colors.text, borderColor: 'rgba(128,128,128,0.35)' }]}
                  />
                  <TextInput
                    value={c.weeks}
                    onChangeText={(v) => update(c.id, { weeks: v })}
                    placeholder="1-18周"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.smallInput, { color: colors.text, borderColor: 'rgba(128,128,128,0.35)' }]}
                  />
                </View>

                <View style={styles.chipRow}>
                  {DAY_LABELS.map((label, i) => (
                    <Pressable
                      key={label}
                      onPress={() => update(c.id, { day: c.day === i ? null : i })}
                      style={chipStyle(c.day === i)}>
                      <Text style={{ color: c.day === i ? colors.primary : colors.text, fontSize: 11.5 }}>
                        周{label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.chipRow}>
                  {OCR_PERIODS.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => update(c.id, { period: c.period === p ? null : p })}
                      style={chipStyle(c.period === p)}>
                      <Text style={{ color: c.period === p ? colors.primary : colors.text, fontSize: 11.5 }}>
                        {p === '中午' ? '中午' : `${p} 节`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {(c.day == null || !c.period || !c.name.trim()) && (
                  <Text style={styles.missing}>还差：{!c.name.trim() ? '课程名 ' : ''}{c.day == null ? '星期 ' : ''}{!c.period ? '节次' : ''}</Text>
                )}
              </View>
            ))}

            <Pressable onPress={addBlank} style={[styles.addBtn, { borderColor: 'rgba(128,128,128,0.35)' }]}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13 }}>手动添加一门</Text>
            </Pressable>

            <Pressable
              onPress={onImport}
              disabled={importing}
              style={[styles.importBtn, { opacity: importing ? 0.6 : 1 }]}>
              <GlassSurface radius={12} />
              {importing && <ActivityIndicator size="small" color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                {importing ? '正在导入…' : '导入到课表'}
              </Text>
            </Pressable>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              导入后课表页会显示这份课表；点课表页的「刷新」可恢复联网课表。
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 64 },
  title: { fontSize: 17, fontWeight: '800' },
  content: { padding: Spacing.three, gap: 12, paddingBottom: 48 },
  card: { borderRadius: 14, padding: 14 },
  hint: { fontSize: 11.5, lineHeight: 18, marginTop: 6 },
  preview: { width: '100%', height: 200, borderRadius: 10, backgroundColor: 'rgba(128,128,128,0.10)' },
  pickBox: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
  },
  error: { color: '#ef4444', fontSize: 12, lineHeight: 17, marginTop: 10 },
  via: { fontSize: 11, marginTop: 10 },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  courseCard: { borderRadius: 14, padding: 12, gap: 8 },
  nameInput: { flex: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14.5, fontWeight: '700' },
  delBtn: { padding: 6 },
  inputRow: { flexDirection: 'row', gap: 8 },
  smallInput: { flex: 1, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, fontSize: 12.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  missing: { color: '#d97706', fontSize: 10.5 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 11,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  note: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
