/** 作业/事项清单: 本地待办, 可关联课表节次
 *  重构版: 添加卡片化 + 未完成/已完成分组 + 已完成折叠与一键清空 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PageBackdrop, usePageBackground, useBgSetting } from '@/lib/background';
import { addTodo, clearDone, loadTodos, removeTodo, toggleTodo, type Todo } from '@/lib/todos';

const DAY_NAMES = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const PERIODS = ['1-2', '3-4', '5-6', '7-8', '9-10'];
const dayShort = (d: string) => d.replace('星期', '周');

export default function TodosScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const pageBg = usePageBackground(colors);
  const bgSetting = useBgSetting();
  // 控件全透明模式: 与其他页面一致, 卡片只留文字 + 1px 外轮廓
  const glass = !!bgSetting.uri && !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const cardStyle = glass
    ? { borderWidth: 1, borderColor: glassLine, backgroundColor: 'transparent' as const }
    : { backgroundColor: colors.backgroundElement };
  const router = useRouter();

  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState('');
  const [linkDay, setLinkDay] = useState<string | null>(null);
  const [linkPeriod, setLinkPeriod] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const params = useLocalSearchParams<{ course?: string; linkDay?: string; linkPeriod?: string }>();

  useEffect(() => {
    loadTodos().then(setTodos);
    // 从课程详情卡跳转过来: 预填课程名与关联节次
    if (params.course) {
      setText(`${String(params.course)} 作业：`);
      if (params.linkDay) setLinkDay(String(params.linkDay));
      if (params.linkPeriod) setLinkPeriod(String(params.linkPeriod));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayName = DAY_NAMES[(new Date().getDay() + 6) % 7];

  const submit = useCallback(async () => {
    if (!text.trim()) return;
    const next = await addTodo(text, linkDay ? { linkDay, linkPeriod: linkPeriod ?? undefined } : undefined);
    setTodos(next);
    setText('');
    setLinkDay(null);
    setLinkPeriod(null);
  }, [text, linkDay, linkPeriod]);

  const del = useCallback((id: string) => {
    Alert.alert('删除这条事项？', '', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => setTodos(await removeTodo(id)),
      },
    ]);
  }, []);

  const emptyAll = useCallback(() => {
    const n = todos.filter((t) => t.done).length;
    if (!n) return;
    Alert.alert(`清空 ${n} 条已完成事项？`, '', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: async () => setTodos(await clearDone()) },
    ]);
  }, [todos]);

  const undone = todos.filter((t) => !t.done);
  const doneList = todos.filter((t) => t.done);
  const canSubmit = !!text.trim();

  const chip = (label: string, active: boolean, onPress: () => void, activeColor: string, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={[
        styles.tag,
        glass && {
          borderWidth: 1,
          borderColor: active ? activeColor : glassLine,
          backgroundColor: active ? 'rgba(37,99,235,0.15)' : 'transparent',
        },
        !glass && { backgroundColor: active ? activeColor : colors.backgroundSelected },
      ]}>
      <Text style={{ color: active && !glass ? '#fff' : active ? activeColor : colors.text, fontSize: 12, fontWeight: active ? '700' : '400' }}>
        {label}
      </Text>
    </Pressable>
  );

  /** 一条事项: 勾选框 + 文本 + 关联徽章 + 删除 */
  const todoRow = (item: Todo) => {
    const isToday = item.linkDay === todayName;
    return (
      <View key={item.id} style={[styles.todoCard, cardStyle]}>
        <Pressable onPress={() => void toggleTodo(item.id).then(setTodos)} hitSlop={6}>
          <Ionicons
            name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={item.done ? '#16a34a' : colors.textSecondary}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.text,
              textDecorationLine: item.done ? 'line-through' : 'none',
              opacity: item.done ? 0.55 : 1,
            }}>
            {item.text}
          </Text>
          {!!item.linkDay && (
            <View
              style={[
                styles.badge,
                !glass && { backgroundColor: isToday ? 'rgba(37,99,235,0.14)' : colors.backgroundSelected },
                glass && { borderWidth: 1, borderColor: glassLine, backgroundColor: 'transparent' },
              ]}>
              <Ionicons name={isToday ? 'today-outline' : 'calendar-outline'} size={11} color={isToday ? '#2563eb' : colors.textSecondary} />
              <Text style={{ color: isToday ? '#2563eb' : colors.textSecondary, fontSize: 11 }}>
                {isToday ? '今天' : dayShort(item.linkDay)}
                {item.linkPeriod ? ` · ${item.linkPeriod} 节` : ''}
              </Text>
            </View>
          )}
        </View>
        <Pressable onPress={() => del(item.id)} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: pageBg }]} edges={['top']}>
      <PageBackdrop />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 16 }}>返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>作业清单</Text>
        <View style={styles.countBox}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{undone.length}</Text>
        </View>
      </View>

      {/* 添加卡: 多行输入 + 关联选择 + 添加按钮 */}
      <View style={[styles.compose, cardStyle]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="记点什么…（如：高数作业 P38 1-5 题）"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, glass && { backgroundColor: 'transparent' }, { backgroundColor: colors.backgroundElement, color: colors.text }]}
          multiline
        />
        <View style={styles.composeRow}>
          <View style={{ flex: 1 }}>
            {(linkDay || linkPeriod) && (
              <View style={styles.selRow}>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>关联：</Text>
                {!!linkDay && (
                  <Pressable onPress={() => { setLinkDay(null); setLinkPeriod(null); }} style={[styles.selChip, { backgroundColor: 'rgba(37,99,235,0.12)' }]}>
                    <Text style={{ color: '#2563eb', fontSize: 11 }}>{dayShort(linkDay)}{linkPeriod ? ` · ${linkPeriod}节` : ''}</Text>
                    <Ionicons name="close" size={12} color="#2563eb" />
                  </Pressable>
                )}
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingRight: 8 }}>
              {DAY_NAMES.map((d) => chip(dayShort(d), linkDay === d, () => {
                setLinkDay(linkDay === d ? null : d);
                setLinkPeriod(null);
              }, '#2563eb', d))}
              {!!linkDay && PERIODS.map((p) => chip(p, linkPeriod === p, () => setLinkPeriod(linkPeriod === p ? null : p), '#16a34a', p))}
            </ScrollView>
          </View>
          <Pressable
            onPress={() => void submit()}
            disabled={!canSubmit}
            style={[
              styles.addBtn,
              glass && { borderWidth: 1, borderColor: canSubmit ? 'rgba(37,99,235,0.55)' : glassLine, backgroundColor: canSubmit ? 'rgba(37,99,235,0.15)' : 'transparent' },
              !glass && { backgroundColor: canSubmit ? '#2563eb' : colors.backgroundSelected },
              !canSubmit && { opacity: 0.5 },
            ]}>
            <Ionicons name="add" size={20} color={glass && canSubmit ? '#2563eb' : !glass && canSubmit ? '#fff' : colors.textSecondary} />
            <Text style={{ color: glass && canSubmit ? '#2563eb' : !glass && canSubmit ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: '700' }}>添加</Text>
          </Pressable>
        </View>
      </View>

      <SectionList
        sections={[
          { key: 'undone', title: `未完成 ${undone.length}`, data: undone },
          { key: 'done', title: `已完成 ${doneList.length}`, data: showDone ? doneList : [] },
        ]}
        extraData={showDone}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => {
          if (section.key === 'done' && !doneList.length) return null;
          return (
            <View style={styles.secHead}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{section.title}</Text>
              {section.key === 'done' && !!doneList.length && (
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                  <Pressable onPress={() => setShowDone((v) => !v)} hitSlop={6}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text style={{ color: '#2563eb', fontSize: 12 }}>{showDone ? '收起' : '展开'}</Text>
                      <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={13} color="#2563eb" />
                    </View>
                  </Pressable>
                  {showDone && (
                    <Pressable onPress={emptyAll} hitSlop={6}>
                      <Text style={{ color: '#ef4444', fontSize: 12 }}>清空</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        }}
        renderItem={({ item }) => todoRow(item)}
        ListEmptyComponent={
          !todos.length ? (
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={42} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 10, textAlign: 'center', lineHeight: 22 }}>
                还没有事项{'\n'}在上方记一条吧，可关联课程节次
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 64 },
  title: { fontSize: 17, fontWeight: '800' },
  countBox: { minWidth: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  compose: { borderRadius: 14, marginHorizontal: Spacing.three, marginTop: Spacing.two, padding: 10 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, maxHeight: 88, textAlignVertical: 'top' },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8, gap: 8 },
  selRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  selChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  list: { paddingHorizontal: Spacing.three, paddingBottom: 40 },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 14, paddingBottom: 6 },
  todoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  empty: { alignItems: 'center', marginTop: 60 },
});
