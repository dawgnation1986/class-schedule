/** 作业/事项清单: 本地存储, 可关联到某天的某节课 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  /** 关联课表: 星期一~星期日 / 节次如 '1-2' */
  linkDay?: string;
  linkPeriod?: string;
};

const KEY = 'todos.v1';

export async function loadTodos(): Promise<Todo[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Todo[]) : [];
    return list.sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function save(list: Todo[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function addTodo(text: string, link?: { linkDay?: string; linkPeriod?: string }): Promise<Todo[]> {
  const list = await loadTodos();
  const todo: Todo = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.trim(),
    done: false,
    createdAt: Date.now(),
    ...link,
  };
  const next = [todo, ...list];
  await save(next);
  return next;
}

export async function toggleTodo(id: string): Promise<Todo[]> {
  const list = await loadTodos();
  const next = list.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  await save(next);
  return next.sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
}

export async function removeTodo(id: string): Promise<Todo[]> {
  const list = await loadTodos();
  const next = list.filter((t) => t.id !== id);
  await save(next);
  return next;
}
