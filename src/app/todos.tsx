/** 作业/事项清单: 本地待办, 可关联课表节次 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addTodo, loadTodos, removeTodo, toggleTodo, type Todo } from '@/lib/todos';

const DAY_NAMES = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const PERIODS = ['1-2', '3-4', '5-6', '7-8', '9-10'];

export default function TodosScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const router = useRouter();

  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState('');
  const [linkDay, setLinkDay] = useState<string | null>(null);
  const [linkPeriod, setLinkPeriod] = useState<string | null>(null);
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 16 }}>返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>作业清单</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.inputWrap}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="记点什么…（如：高数作业 P38 1-5 题）"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }]}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <Pressable onPress={submit} style={[styles.addBtn, !text.trim() && { opacity: 0.4 }]}>
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.linkRow}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>关联课程(可选)：</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
          {DAY_NAMES.map((d) => (
            <Pressable
              key={d}
              onPress={() => setLinkDay(linkDay === d ? null : d)}
              style={[
                styles.tag,
                { backgroundColor: colors.backgroundElement },
                linkDay === d && { backgroundColor: '#2563eb' },
              ]}>
              <Text style={{ color: linkDay === d ? '#fff' : colors.text, fontSize: 12 }}>{d.slice(2)}</Text>
            </Pressable>
          ))}
          {!!linkDay &&
            PERIODS.map((p) => (
              <Pressable
                key={p}
                onPress={() => setLinkPeriod(linkPeriod === p ? null : p)}
                style={[
                  styles.tag,
                  { backgroundColor: colors.backgroundElement },
                  linkPeriod === p && { backgroundColor: '#16a34a' },
                ]}>
                <Text style={{ color: linkPeriod === p ? '#fff' : colors.text, fontSize: 12 }}>{p}</Text>
              </Pressable>
            ))}
        </ScrollView>
      </View>

      <FlatList
        data={todos}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>还没有事项，记一条吧</Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.todoCard, { backgroundColor: colors.backgroundElement }]}>
            <Pressable onPress={() => toggleTodo(item.id).then(setTodos)} hitSlop={6}>
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
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {item.linkDay}
                  {item.linkPeriod ? ` · ${item.linkPeriod} 节` : ''}
                </Text>
              )}
            </View>
            <Pressable onPress={() => del(item.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 64 },
  title: { fontSize: 17, fontWeight: '800' },
  inputWrap: { flexDirection: 'row', paddingHorizontal: Spacing.three, marginTop: Spacing.two, gap: 8 },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 12, width: 44, alignItems: 'center', justifyContent: 'center' },
  linkRow: { paddingHorizontal: Spacing.three, marginTop: 10 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  list: { padding: Spacing.three, gap: 8, paddingBottom: 40 },
  empty: { textAlign: 'center', marginTop: 40 },
  todoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12 },
});
